// ─────────────────────────────────────────────────────────────
//  Transport layer — the only file that knows where game state lives.
//
//  SupabaseTransport (when js/config.js has keys):
//    one row per room in `public.rooms` (state jsonb + version int).
//    Every device applies actions with the pure reducer and writes
//    them back with optimistic concurrency (update … where version = v,
//    retry on conflict). Realtime Postgres Changes push each new state
//    to every phone and the TV.
//
//  LocalTransport (no keys): localStorage + BroadcastChannel, which
//    only syncs tabs on the same device. Handy for offline dev.
// ─────────────────────────────────────────────────────────────
import { reduce, newGame } from './engine.js';
import { useState, useEffect, useCallback } from './lib.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const SUPABASE_JS = 'https://esm.sh/@supabase/supabase-js@2.49.4';

class Subs {
  constructor() { this.map = new Map(); }
  add(code, cb) { if (!this.map.has(code)) this.map.set(code, new Set()); this.map.get(code).add(cb); }
  del(code, cb) { const s = this.map.get(code); if (s) { s.delete(cb); return s.size; } return 0; }
  emit(code, state) { (this.map.get(code) || []).forEach((cb) => cb(state)); }
}

// ── local (same device only) ─────────────────────────────────
class LocalTransport {
  constructor() { this.mode = 'local'; this.subs = new Subs(); this.chans = new Map(); }
  key(code) { return `bunker:room:${code}`; }
  read(code) { try { const raw = localStorage.getItem(this.key(code)); return raw ? JSON.parse(raw) : null; } catch { return null; } }
  chan(code) {
    if (!this.chans.has(code) && 'BroadcastChannel' in window) {
      const c = new BroadcastChannel('bunker:' + code);
      c.onmessage = () => this.subs.emit(code, this.read(code));
      this.chans.set(code, c);
    }
    return this.chans.get(code);
  }
  async load(code) { return this.read(code); }
  async exists(code) { return !!this.read(code); }
  async create(code, opts) {
    if (this.read(code)) throw new Error('exists');
    const s = newGame(code, opts); localStorage.setItem(this.key(code), JSON.stringify(s)); return s;
  }
  async dispatch(code, action) {
    const cur = this.read(code); if (!cur) return;
    const nxt = reduce(cur, action); if (nxt === cur) return;
    localStorage.setItem(this.key(code), JSON.stringify(nxt));
    this.subs.emit(code, nxt);
    this.chan(code)?.postMessage(nxt.version);
  }
  subscribe(code, cb) {
    this.chan(code); this.subs.add(code, cb);
    const onStorage = (ev) => { if (ev.key === this.key(code)) cb(this.read(code)); };
    addEventListener('storage', onStorage);
    return () => { this.subs.del(code, cb); removeEventListener('storage', onStorage); };
  }
}

// ── Supabase (cross-device) ──────────────────────────────────
class SupabaseTransport {
  constructor(url, key) {
    this.mode = 'online';
    this.subs = new Subs(); this.cache = new Map(); this.queues = new Map(); this.channels = new Map();
    this.ready = import(SUPABASE_JS).then(({ createClient }) => {
      this.sb = createClient(url, key, { auth: { persistSession: false } });
    });
  }

  async row(code) {
    await this.ready;
    const { data, error } = await this.sb.from('rooms').select('state').eq('code', code).maybeSingle();
    if (error) throw error;
    return data ? data.state : null;
  }
  async load(code) { const s = await this.row(code); if (s) this.apply(code, s); return s; }
  async exists(code) { return !!(await this.row(code)); }
  async create(code, opts) {
    await this.ready;
    const s = newGame(code, opts);
    const { error } = await this.sb.from('rooms').insert({ code, state: s, version: s.version });
    if (error) throw error;
    this.cache.set(code, s);
    return s;
  }

  // newer versions win; older pushes are ignored
  apply(code, s) {
    const cur = this.cache.get(code);
    if (cur && cur.version > s.version) return;
    this.cache.set(code, s);
    this.subs.emit(code, s);
  }

  // one write at a time per room from this device
  dispatch(code, action) {
    const prev = this.queues.get(code) || Promise.resolve();
    const p = prev.then(() => this.write(code, action)).catch((e) => console.warn('[bunker] dispatch failed', e));
    this.queues.set(code, p);
    return p;
  }
  async write(code, action) {
    await this.ready;
    for (let attempt = 0; attempt < 8; attempt++) {
      const cur = attempt === 0 && this.cache.get(code) ? this.cache.get(code) : await this.row(code);
      if (!cur) return;
      const nxt = reduce(cur, action);
      if (nxt === cur) return; // not valid in the current state — nothing to do
      const { data, error } = await this.sb.from('rooms')
        .update({ state: nxt, version: nxt.version, updated_at: new Date().toISOString() })
        .eq('code', code).eq('version', cur.version)
        .select('version');
      if (error) throw error;
      if (data && data.length) { this.apply(code, nxt); return; }
      // someone else wrote first → reload and re-apply
      await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
    }
    throw new Error('too many write conflicts');
  }

  subscribe(code, cb) {
    this.subs.add(code, cb);
    if (!this.channels.has(code)) {
      const holder = { ch: null, dead: false };
      this.channels.set(code, holder);
      this.ready.then(() => {
        if (holder.dead) return;
        holder.ch = this.sb.channel('room-' + code)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
            (payload) => payload.new && payload.new.state && this.apply(code, payload.new.state))
          .subscribe((status) => {
            // (re)connected → catch up on anything missed while offline
            if (status === 'SUBSCRIBED') this.load(code).catch(() => {});
          });
      });
    }
    // phones that sleep miss realtime events: refresh when they come back
    const onWake = () => { if (document.visibilityState === 'visible') this.load(code).catch(() => {}); };
    document.addEventListener('visibilitychange', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      if (this.subs.del(code, cb) === 0) {
        const h = this.channels.get(code);
        if (h) { h.dead = true; if (h.ch) this.sb.removeChannel(h.ch); }
        this.channels.delete(code);
      }
    };
  }
}

export const transport = SUPABASE_URL && SUPABASE_KEY
  ? new SupabaseTransport(SUPABASE_URL, SUPABASE_KEY)
  : new LocalTransport();

// state: undefined = loading, null = room not found
export function useRoom(code) {
  const [state, setState] = useState(undefined);
  useEffect(() => {
    let live = true;
    setState(undefined);
    const off = transport.subscribe(code, (s) => live && setState(s));
    transport.load(code)
      .then((s) => live && setState((cur) => (cur && s && cur.version > s.version ? cur : s)))
      .catch(() => live && setState(null));
    return () => { live = false; off(); };
  }, [code]);
  const dispatch = useCallback((a) => transport.dispatch(code, a), [code]);
  return [state, dispatch];
}

export function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// ── host key: proves this device may control a room ──────────
const HK = (code) => `bunker:hostkey:${code}`;
export const hostKey = {
  get(code) { try { return localStorage.getItem(HK(code)); } catch { return null; } },
  set(code, key) { try { localStorage.setItem(HK(code), key); } catch {} },
};

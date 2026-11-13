// ─────────────────────────────────────────────────────────────
//  BUNKER — game engine. Pure reducer: (state, action) → state.
//  The same reducer will run on the server once the backend exists.
// ─────────────────────────────────────────────────────────────
import { CATS, TRAITS, CATASTROPHES, ROOMS, ACTIONS, BOT_NAMES, AVATARS, byId } from './content.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 16;
const ACTIONS_PER_PLAYER = 2;
const ROOMS_PER_BUNKER = 3;

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const between = (a, b) => a + rnd(b - a + 1);
export const uid = () => Math.random().toString(36).slice(2, 10);
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function roomCode() {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  return Array.from({ length: 4 }, () => L[rnd(L.length)]).join('');
}

export function newGame(code) {
  return {
    code, version: 0, createdAt: Date.now(),
    phase: 'lobby', round: 0,
    traitLang: 'uk', mature: false, discussionSec: 90,
    catastrophe: null, bunker: null, seats: 0,
    players: [], votes: {}, candidates: [], revote: 0, tie: [],
    revealed: [], lastExiled: null, lastTally: null, timerEnd: null,
    log: [],
  };
}

// ── dealing ──────────────────────────────────────────────────
function pool(cat, mature) { return TRAITS[cat].filter((x) => mature || !x.m); }

function dealBiology() {
  const sex = Math.random() < 0.5 ? 'm' : 'f';
  const age = Math.random() < 0.15 ? between(61, 84) : between(18, 60);
  let x;
  if (Math.random() < 0.4) {
    const notes = TRAITS.biology.filter((n) => n.id !== 'pregnant' || (sex === 'f' && age <= 42));
    x = pick(notes).id;
  }
  return { id: sex, n: age, x, revealed: false };
}

function dealAll(s) {
  const decks = {};
  for (const c of CATS) if (c !== 'biology') decks[c] = shuffle(pool(c, s.mature));
  const actionDeck = shuffle(ACTIONS.map((a) => a.id));
  let ai = 0;
  s.players.forEach((p, i) => {
    p.cards = {};
    for (const c of CATS) {
      if (c === 'biology') { p.cards.biology = dealBiology(); continue; }
      const deck = decks[c];
      p.cards[c] = { id: deck[i % deck.length].id, revealed: false };
    }
    p.actions = Array.from({ length: ACTIONS_PER_PLAYER }, () => ({ id: actionDeck[ai++ % actionDeck.length], used: false }));
    p.alive = true; p.exiledRound = null; p.immuneRound = null; p.doubleRound = null;
  });
  const cat = pick(CATASTROPHES);
  s.catastrophe = { id: cat.id, months: between(cat.months[0], cat.months[1]) };
  s.bunker = {
    area: between(4, 20) * 10,
    food: between(3, Math.max(6, s.catastrophe.months + 6)),
    rooms: shuffle(ROOMS).slice(0, ROOMS_PER_BUNKER).map((r) => ({ id: r.id, revealed: false })),
  };
  s.seats = Math.max(1, Math.floor(s.players.length / 2));
}

// ── helpers ──────────────────────────────────────────────────
export const alive = (s) => s.players.filter((p) => p.alive);
export const findP = (s, id) => s.players.find((p) => p.id === id);
const log = (s, k, p = {}) => { s.log.push({ t: Date.now(), k, p }); if (s.log.length > 60) s.log.shift(); };
const hiddenCats = (p) => CATS.filter((c) => p.cards[c] && !p.cards[c].revealed);

export function canReveal(s, p, cat) {
  if (s.phase !== 'reveal' || !p.alive || s.revealed.includes(p.id)) return false;
  const card = p.cards[cat];
  if (!card || card.revealed) return false;
  if (s.round === 1 && cat !== 'profession') return false;
  return true;
}

function autoReveal(s) {
  for (const p of alive(s)) {
    if (s.revealed.includes(p.id)) continue;
    const opts = s.round === 1 ? ['profession'] : hiddenCats(p);
    const c = opts.find((x) => !p.cards[x].revealed) ? pick(opts.filter((x) => !p.cards[x].revealed)) : null;
    if (c) { p.cards[c].revealed = true; log(s, 'reveal', { a: p.id, cat: c }); }
    s.revealed.push(p.id);
  }
}

function beginRound(s) {
  s.round += 1;
  s.phase = 'reveal';
  s.revealed = []; s.votes = {}; s.revote = 0; s.tie = [];
  s.lastExiled = null; s.lastTally = null; s.timerEnd = null;
  s.candidates = alive(s).map((p) => p.id);
  const room = s.bunker.rooms.find((r) => !r.revealed);
  if (room) { room.revealed = true; log(s, 'room', { room: room.id }); }
  log(s, 'round', { n: s.round });
}

function exile(s, id) {
  const p = findP(s, id);
  p.alive = false; p.exiledRound = s.round;
  for (const c of CATS) p.cards[c].revealed = true;
  s.lastExiled = id; s.tie = [];
  s.phase = 'results';
  log(s, 'exiled', { a: id });
}

function tally(s) {
  const t = Object.fromEntries(s.candidates.map((id) => [id, 0]));
  for (const [voter, target] of Object.entries(s.votes)) {
    const v = findP(s, voter), tg = findP(s, target);
    if (!v || !tg || !(target in t)) continue;
    if (tg.immuneRound === s.round) continue;
    t[target] += v.doubleRound === s.round ? 2 : 1;
  }
  return t;
}

function goFinal(s) {
  s.phase = 'final';
  for (const p of alive(s)) for (const c of CATS) p.cards[c].revealed = true;
  for (const r of s.bunker.rooms) r.revealed = true;
  log(s, 'final', {});
}

function applyAction(s, p, idx, targetId) {
  const card = p.actions[idx];
  if (!card || card.used || !p.alive) return false;
  if (!['reveal', 'discussion', 'voting'].includes(s.phase)) return false;
  const def = byId(ACTIONS, card.id);
  const tg = targetId ? findP(s, targetId) : null;
  if (def.target && (!tg || !tg.alive || tg.id === p.id)) return false;
  const swap = (cat) => { const a = p.cards[cat], b = tg.cards[cat]; [a.id, b.id] = [b.id, a.id]; };
  switch (card.id) {
    case 'swap_health': swap('health'); break;
    case 'swap_baggage': swap('baggage'); break;
    case 'reroll_prof': {
      const taken = new Set(s.players.map((x) => x.cards.profession.id));
      const opts = pool('profession', s.mature).filter((x) => !taken.has(x.id));
      tg.cards.profession.id = (opts.length ? pick(opts) : pick(pool('profession', s.mature))).id;
      break;
    }
    case 'expose': {
      const h = hiddenCats(tg);
      if (!h.length) return false;
      const c = pick(h); tg.cards[c].revealed = true;
      log(s, 'reveal', { a: tg.id, cat: c });
      break;
    }
    case 'heal': tg.cards.health.id = 'healthy'; break;
    case 'double_vote': p.doubleRound = s.round; break;
    case 'immunity': p.immuneRound = s.round; break;
    case 'therapy': p.cards.phobia.id = 'none'; break;
    default: return false;
  }
  card.used = true;
  log(s, 'action', { a: p.id, b: tg ? tg.id : '', act: card.id });
  return true;
}

// ── reducer ──────────────────────────────────────────────────
export function reduce(state, a) {
  const s = structuredClone(state);
  const ok = step(s, a);
  if (!ok) return state;
  s.version += 1;
  return s;
}

function step(s, a) {
  switch (a.type) {
    case 'join': {
      if (s.phase !== 'lobby' || s.players.length >= MAX_PLAYERS) return false;
      if (findP(s, a.player.id)) { Object.assign(findP(s, a.player.id), a.player); return true; }
      s.players.push({ id: a.player.id, name: a.player.name.slice(0, 18), avatar: a.player.avatar, bot: !!a.player.bot, cards: {}, actions: [], alive: true });
      log(s, 'join', { a: a.player.id });
      return true;
    }
    case 'addBots': {
      if (s.phase !== 'lobby') return false;
      const used = new Set(s.players.map((p) => p.name));
      const names = shuffle(BOT_NAMES).filter((n) => !used.has(n));
      for (let i = 0; i < a.n && s.players.length < MAX_PLAYERS && names.length; i++) {
        s.players.push({ id: 'bot_' + uid(), name: names.pop(), avatar: pick(AVATARS), bot: true, cards: {}, actions: [], alive: true });
      }
      return true;
    }
    case 'kick': {
      if (s.phase !== 'lobby') return false;
      s.players = s.players.filter((p) => p.id !== a.id);
      return true;
    }
    case 'settings': {
      if ('traitLang' in a) s.traitLang = a.traitLang;
      if ('discussionSec' in a) s.discussionSec = a.discussionSec;
      if ('mature' in a && s.phase === 'lobby') s.mature = a.mature;
      return true;
    }
    case 'start': {
      if (s.phase !== 'lobby' || s.players.length < MIN_PLAYERS) return false;
      dealAll(s);
      s.phase = 'briefing'; s.round = 0; s.log = [];
      log(s, 'start', {});
      return true;
    }
    case 'reveal': {
      const p = findP(s, a.id);
      if (!p || !canReveal(s, p, a.cat)) return false;
      p.cards[a.cat].revealed = true;
      s.revealed.push(p.id);
      log(s, 'reveal', { a: p.id, cat: a.cat });
      return true;
    }
    case 'useAction': {
      const p = findP(s, a.id);
      return !!p && applyAction(s, p, a.idx, a.target);
    }
    case 'vote': {
      const p = findP(s, a.id);
      if (s.phase !== 'voting' || !p || !p.alive || a.target === p.id || !s.candidates.includes(a.target)) return false;
      s.votes[p.id] = a.target;
      return true;
    }
    case 'next': return next(s);
    case 'hostExile': {
      if (s.phase !== 'results' || !s.tie.includes(a.id)) return false;
      exile(s, a.id);
      return true;
    }
    case 'extendTimer': {
      if (s.phase !== 'discussion') return false;
      s.timerEnd = Math.max(Date.now(), s.timerEnd || 0) + a.sec * 1000;
      return true;
    }
    case 'reset': {
      const keep = s.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, bot: p.bot, cards: {}, actions: [], alive: true }));
      Object.assign(s, newGame(s.code), { players: keep, traitLang: s.traitLang, mature: s.mature, discussionSec: s.discussionSec, version: s.version });
      return true;
    }
    default: return false;
  }
}

// host's big "next" button
function next(s) {
  switch (s.phase) {
    case 'briefing': beginRound(s); return true;
    case 'reveal':
      autoReveal(s);
      s.phase = 'discussion';
      s.timerEnd = Date.now() + s.discussionSec * 1000;
      return true;
    case 'discussion':
      s.phase = 'voting'; s.votes = {}; s.timerEnd = null;
      s.candidates = alive(s).map((p) => p.id);
      return true;
    case 'voting': {
      const t = tally(s);
      s.lastTally = t;
      const max = Math.max(0, ...Object.values(t));
      const top = Object.keys(t).filter((id) => t[id] === max);
      if (top.length === 1 && max > 0) { exile(s, top[0]); return true; }
      if (s.revote === 0) {
        s.revote = 1; s.candidates = top; s.votes = {};
        log(s, 'revote', {});
        return true;
      }
      s.tie = top; s.phase = 'results'; s.lastExiled = null;
      log(s, 'tie', {});
      return true;
    }
    case 'results':
      if (s.tie.length) return false; // host must pick
      if (alive(s).length <= s.seats) goFinal(s); else beginRound(s);
      return true;
    default: return false;
  }
}

// ── card text ────────────────────────────────────────────────
function years(n, lang) {
  if (lang === 'en') return `${n} y.o.`;
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'рік' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'роки' : 'років';
  return `${n} ${w}`;
}

export function cardText(cat, card, lang) {
  if (!card) return '';
  if (cat === 'biology') {
    const sex = lang === 'uk' ? (card.id === 'f' ? 'Жінка' : 'Чоловік') : (card.id === 'f' ? 'Female' : 'Male');
    const note = card.x ? byId(TRAITS.biology, card.x) : null;
    return `${sex}, ${years(card.n, lang)}${note ? ' · ' + note[lang] : ''}`;
  }
  const entry = byId(TRAITS[cat], card.id);
  return entry ? entry[lang] : card.id;
}

export const catastropheOf = (s) => s.catastrophe && byId(CATASTROPHES, s.catastrophe.id);
export const roomOf = (id) => byId(ROOMS, id);
export const actionOf = (id) => byId(ACTIONS, id);

// ── final verdict ────────────────────────────────────────────
function tagsOf(p) {
  const out = [];
  for (const c of CATS) {
    const card = p.cards[c];
    if (c === 'biology') { const n = card.x && byId(TRAITS.biology, card.x); if (n) out.push(...n.tags); continue; }
    const en = byId(TRAITS[c], card.id); if (en) out.push(...en.tags);
  }
  return out;
}

function fertile(p) {
  const b = p.cards.biology, tags = tagsOf(p);
  if (tags.includes('infertile')) return false;
  if (b.x === 'pregnant') return true;
  return b.id === 'f' ? b.n >= 18 && b.n <= 45 : b.n >= 18 && b.n <= 60;
}

export function evaluate(s) {
  const surv = alive(s);
  const tags = surv.flatMap(tagsOf);
  const roomTags = s.bunker.rooms.flatMap((r) => roomOf(r.id).tags);
  const all = [...tags, ...roomTags];
  const count = (t) => all.filter((x) => x === t).length;
  const cat = catastropheOf(s);
  const checks = [];

  const pregnant = surv.some((p) => p.cards.biology.x === 'pregnant');
  const f = surv.some((p) => p.cards.biology.id === 'f' && fertile(p));
  const m = surv.some((p) => p.cards.biology.id === 'm' && fertile(p));
  checks.push({ k: 'repro', ok: (f && m) || pregnant });

  const foodOk = s.bunker.food >= s.catastrophe.months || count('food') >= 2 || (count('food') >= 1 && s.bunker.food * 2 >= s.catastrophe.months);
  checks.push({ k: 'food', ok: foodOk });

  for (const need of cat.needs) if (need !== 'food') checks.push({ k: 'need_' + need, ok: count(need) > 0 });

  checks.push({ k: 'health', ok: tags.filter((t) => t === 'weak').length <= Math.floor(surv.length / 2) });
  checks.push({ k: 'peace', ok: count('danger') === 0 });
  checks.push({ k: 'morale', ok: count('morale') > 0 });

  const score = checks.filter((c) => c.ok).length / checks.length;
  const verdict = score >= 0.85 ? 'thrive' : score >= 0.6 ? 'survive' : score >= 0.35 ? 'struggle' : 'extinct';
  return { checks, score, verdict };
}

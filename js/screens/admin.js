// Admin panel — every host command lives here.
// Shown as a drawer (⚙) on every host screen. Extra host screens join via a single-use,
// 2-minute invite (#/admin/CODE/TOKEN) — never a reusable key, so a QR glimpsed on the projector is worthless.
import { html, useEffect, useState } from '../lib.js';
import { useT } from '../i18n.js';
import { CATS } from '../content.js';
import { alive, findP, estimate, SPEEDS, MIN_PLAYERS, uid, hashKey, isHost, INVITE_MS } from '../engine.js';
import { useRoom, useNow, hostKey } from '../transport.js';
import {
  LangSwitch, PhaseBadge, Timer, ConfirmButton, hint, primaryLabel, QR, useLanBase, Brand, UiLang, Loading,
} from '../ui.js';
import { NotFound } from './host.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Bots act from whichever controlling screen is open. Duplicate actions are rejected by the reducer. */
export function useBots(s, dispatch, enabled = true) {
  useEffect(() => {
    if (!s || !enabled) return;
    const bots = alive(s).filter((p) => p.bot);
    let act = null;
    if (s.phase === 'reveal') {
      const b = bots.find((p) => !s.revealed.includes(p.id));
      if (b) {
        const opts = s.round === 1 ? ['profession'] : CATS.filter((c) => !b.cards[c].revealed);
        if (opts.length) act = { type: 'reveal', id: b.id, cat: pick(opts) };
      }
    } else if (s.phase === 'voting') {
      const b = bots.find((p) => !s.votes[p.id]);
      if (b) {
        const opts = s.candidates.filter((id) => id !== b.id);
        if (opts.length) act = { type: 'vote', id: b.id, target: pick(opts) };
      }
    }
    if (!act) return;
    const tm = setTimeout(() => dispatch(act), 500 + Math.random() * 900);
    return () => clearTimeout(tm);
  }, [s && s.version, enabled]);
}

export function SpeedPicker({ s, dispatch, big }) {
  const { t } = useT();
  const n = Math.max(s.players.filter((p) => !p.left).length, MIN_PLAYERS);
  return html`<div class=${'speeds' + (big ? ' big' : '')}>
    ${Object.keys(SPEEDS).map((sp) => {
      const e = estimate(sp, n);
      return html`<button class=${'speed' + (s.speed === sp ? ' on' : '')} onClick=${() => dispatch({ type: 'settings', speed: sp })}>
        <span class="speed-t">${t('sp_' + sp)}</span>
        <span class="speed-m">${t('est_min', { m: e.minutes })}</span>
        <span class="speed-d">${t('sp_' + sp + '_d')} · ${t('est_rounds', { n: e.rounds })}</span>
      </button>`;
    })}
  </div>`;
}

export function AdminPanel({ s, dispatch, onClose }) {
  const { t, lang, setLang } = useT();
  const a = alive(s);
  const n = s.players.filter((p) => !p.left).length;
  const progress = s.phase === 'reveal' ? `${t('revealed_n')}: ${s.revealed.length}/${a.length}`
    : s.phase === 'voting' ? `${t('voted')}: ${Object.keys(s.votes).length}/${a.length}` : '';
  const nextDisabled = (s.phase === 'results' && s.tie.length > 0) || s.phase === 'final'
    || (s.phase === 'lobby' && s.players.length < MIN_PLAYERS);
  const doNext = () => dispatch(s.phase === 'lobby' ? { type: 'start' } : { type: 'next' });

  return html`<div class="admin">
    <div class="admin-h">
      <span>⚙ ${t('admin_panel')}</span>
      <span class="room-code sm"><b>${s.code}</b></span>
      ${s.admin && html`<span class="chip red">${t('admin_badge')}</span>`}
      <span class="grow"></span>
      ${onClose && html`<button class="btn sm ghost" onClick=${onClose}>✕ ${t('close')}</button>`}
    </div>

    <section class="adm-sec">
      <h3>${t('sec_game')}</h3>
      <div class="adm-row"><${PhaseBadge} s=${s} />${s.phase === 'discussion' && html`<${Timer} end=${s.timerEnd} />`}</div>
      <p class="adm-hint">${hint(s, t)}${progress && html` · <b>${progress}</b>`}</p>
      ${s.phase === 'discussion' && html`<div class="adm-row">
        <button class="btn sm" onClick=${() => dispatch({ type: 'extendTimer', sec: -30 })}>${t('minus30')}</button>
        <button class="btn sm" onClick=${() => dispatch({ type: 'extendTimer', sec: 30 })}>${t('plus30')}</button>
        <button class="btn sm" onClick=${() => dispatch({ type: 'next' })}>⏹ ${t('end_disc')}</button>
      </div>`}
      ${s.phase === 'results' && s.tie.length > 0 && html`<div class="adm-tie">
        <p>${t('tie_host_n', { n: s.slots })}</p>
        <div class="adm-row">${s.tie.map((id) => { const p = findP(s, id); return html`<button class="btn sm" onClick=${() => dispatch({ type: 'hostExile', id })}>${p.avatar} ${p.name}</button>`; })}</div>
      </div>`}
      ${s.phase !== 'final' && html`<button class="btn primary big wide" disabled=${nextDisabled} onClick=${doNext}>${primaryLabel(s, t)} ▶</button>`}
    </section>

    <section class="adm-sec">
      <h3>${t('speed_title')}</h3>
      <${SpeedPicker} s=${s} dispatch=${dispatch} />
      <p class="dim">${t('est_note', { n: Math.max(n, MIN_PLAYERS) })}</p>
    </section>

    <section class="adm-sec">
      <h3>${t('sec_lang')}</h3>
      <div class="adm-row">
        <${LangSwitch} value=${s.traitLang} onChange=${(l) => dispatch({ type: 'settings', traitLang: l })} label=${t('trait_lang')} />
        <${LangSwitch} value=${lang} onChange=${setLang} label=${t('ui_lang')} />
      </div>
    </section>


    <${LateJoiners} s=${s} dispatch=${dispatch} />

    <section class="adm-sec">
      <h3>${t('sec_players')} · ${a.length}/${n}</h3>
      <ul class="adm-players">
        ${s.players.map((p) => {
          const status = p.left ? 'status_left' : !p.alive ? 'status_out' : 'status_alive';
          return html`<li class=${p.alive ? '' : 'off'}>
            <span class="ava">${p.avatar}</span>
            <span class="pname">${p.name}</span>
            ${p.bot && html`<span class="chip">BOT</span>`}
            ${s.phase !== 'lobby' && html`<span class="dim">${t(status)}</span>`}
            <span class="grow"></span>
            ${(s.phase === 'lobby' || p.alive) && html`<${ConfirmButton} label=${t('remove')} confirmLabel=${t('confirm')}
              onConfirm=${() => dispatch({ type: 'remove', id: p.id })} />`}
          </li>`;
        })}
      </ul>
      ${s.phase !== 'lobby' && html`<p class="dim">${t('remove_note')}</p>`}
    </section>

    <${CoHosts} s=${s} dispatch=${dispatch} />

    <section class="adm-sec">
      <h3>${t('sec_service')}</h3>
      <div class="adm-row">
        ${s.phase === 'lobby' && html`<a class="btn sm ghost" href=${`#/play/${s.code}/new`} target="_blank">${t('open_test_player')}</a>`}
        ${s.phase !== 'lobby' && html`<${ConfirmButton} label=${t('restart')} confirmLabel=${t('confirm')} onConfirm=${() => dispatch({ type: 'reset' })} />`}
        <a class="btn sm ghost" href="#/">${t('home')}</a>
      </div>
    </section>
  </div>`;
}

/** Late joiners (new device mid-game) → hand them an existing character; the old device loses it. */
function LateJoiners({ s, dispatch }) {
  const { t } = useT();
  const list = s.waiting || [];
  if (!list.length || s.phase === 'lobby') return null;
  const chars = s.players.filter((p) => !p.left);
  return html`<section class="adm-sec late">
    <h3>⇄ ${t('sec_late')} · ${list.length}</h3>
    <p class="dim">${t('late_d')}</p>
    <ul class="adm-players">${list.map((w) => html`<${MergeRow} key=${w.id} w=${w} chars=${chars} dispatch=${dispatch} />`)}</ul>
  </section>`;
}

function MergeRow({ w, chars, dispatch }) {
  const { t } = useT();
  const [into, setInto] = useState('');
  return html`<li class="merge-row">
    <span class="ava">${w.avatar}</span>
    <span class="pname">${w.name}</span>
    <span class="dim">→</span>
    <select class="input sm" value=${into} onChange=${(e) => setInto(e.target.value)} aria-label=${t('choose_char')}>
      <option value="">${t('choose_char')}</option>
      ${chars.map((p) => html`<option value=${p.id}>${p.avatar} ${p.name}${p.alive ? '' : ' · ' + t('status_out')}${p.bot ? ' · BOT' : ''}</option>`)}
    </select>
    <${ConfirmButton} label=${t('merge')} confirmLabel=${t('confirm')} disabled=${!into}
      onConfirm=${() => dispatch({ type: 'merge', from: w.id, into })} />
    <button class="x" title=${t('dismiss')} onClick=${() => dispatch({ type: 'dropWaiting', id: w.id })}>✕</button>
  </li>`;
}

/** Extra admin screens: create a single-use invite, list connected devices, revoke them. */
function CoHosts({ s, dispatch }) {
  const { t } = useT();
  const base = useLanBase();
  const now = useNow(1000);
  const [token, setToken] = useState(null); // the clear token exists only on this device
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const inv = s.invite;
  const mine = token && inv && inv.hash === hashKey(token);
  const live = mine && !inv.used && now < inv.exp;
  const url = token ? `${base}#/admin/${s.code}/${token}` : '';

  const create = () => {
    const tk = uid() + uid() + uid();
    setToken(tk); setShow(false); setCopied(false);
    dispatch({ type: 'invite', hash: hashKey(tk), exp: Date.now() + INVITE_MS });
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); } };

  return html`<section class="adm-sec cohosts">
    <h3>⧉ ${t('sec_cohosts')} · ${(s.admins || []).length}</h3>
    <p class="dim">${t('cohost_d')}</p>
    ${live ? html`<div class="invite">
      <div class="adm-row">
        <span class="chip">${t('invite_left', { s: Math.max(0, Math.ceil((inv.exp - now) / 1000)) })}</span>
        <button class="btn sm" onClick=${() => setShow(!show)}>${show ? t('hide_qr') : t('show_qr')}</button>
        <button class="btn sm ghost" onClick=${copy}>${copied ? t('copied') : t('copy_link')}</button>
        <button class="x" title=${t('cancel')} onClick=${() => { dispatch({ type: 'cancelInvite' }); setToken(null); }}>✕</button>
      </div>
      ${show && html`<div class="invite-qr"><${QR} text=${url} size="180px" /><p class="dim">${t('qr_warn')}</p></div>`}
    </div>` : html`<div class="adm-row">
      ${mine && inv.used && html`<span class="chip">✓ ${t('invite_used')}</span>`}
      ${mine && !inv.used && html`<span class="chip red">${t('invite_expired')}</span>`}
      <button class="btn sm" onClick=${create}>+ ${t('new_invite')}</button>
    </div>`}
    ${(s.admins || []).length > 0 && html`<ul class="adm-players">
      ${s.admins.map((a) => html`<li><span class="ava">⧉</span><span class="pname">${t('admin_n', { n: a.n })}</span><span class="grow"></span>
        <${ConfirmButton} label=${t('revoke')} confirmLabel=${t('confirm')} onConfirm=${() => dispatch({ type: 'revokeAdmin', hash: a.hash })} /></li>`)}
    </ul>`}
  </section>`;
}

/** #/admin/CODE/TOKEN — claims an invite on a new device, then opens the full host screen #/host/CODE. */
export function AdminScreen({ code, token }) {
  const [s, dispatch] = useRoom(code);
  const { t } = useT();
  const [state, setState] = useState('idle'); // idle | claiming | failed
  const ok = isHost(s, hostKey.get(code));

  useEffect(() => {
    if (!s || ok || !token || state !== 'idle') return;
    setState('claiming');
    const key = uid() + uid() + uid();
    hostKey.set(code, key);
    dispatch({ type: 'claimAdmin', token, keyHash: hashKey(key) }).then(() => setTimeout(() => setState('done'), 1500));
  }, [s && s.version, ok]);

  // once in, open the full host screen (board + timer + Next + ⚙); the used token leaves the address bar
  useEffect(() => { if (ok) location.replace(`#/host/${code}`); }, [ok]);

  if (s === undefined) return html`<${Loading} />`;
  if (!s) return html`<${NotFound} />`;
  if (!ok) {
    const msg = state === 'claiming' ? t('claim_wait') : t('claim_fail');
    return html`<main class="center-screen"><${Brand} small /><div class="panel narrow"><p class=${state === 'claiming' ? 'blink' : ''}>${msg}</p>
      <a class="btn ghost" href="#/">${t('home')}</a></div></main>`;
  }
  return html`<${Loading} />`;
}

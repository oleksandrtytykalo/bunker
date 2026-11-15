// Admin panel — every host command lives here.
// Shown as a drawer on the TV (⚙). Phone remote control was removed: a visible key on a big screen = anyone is admin.
import { html, useEffect } from '../lib.js';
import { useT } from '../i18n.js';
import { CATS } from '../content.js';
import { alive, findP, estimate, SPEEDS, MIN_PLAYERS } from '../engine.js';
import {
  LangSwitch, PhaseBadge, Timer, ConfirmButton, hint, primaryLabel,
} from '../ui.js';

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

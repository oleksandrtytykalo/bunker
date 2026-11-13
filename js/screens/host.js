import { html, useEffect } from '../lib.js';
import { useT } from '../i18n.js';
import { CATS } from '../content.js';
import { alive, findP, evaluate, MIN_PLAYERS, MAX_PLAYERS } from '../engine.js';
import { useRoom } from '../transport.js';
import {
  Brand, UiLang, LangSwitch, PhaseBadge, Timer, SeatMeter, TraitCard,
  CatastrophePanel, BunkerPanel, LogFeed, PlayerTile, QR, useLanBase, hint, Loading, ModeNote,
} from '../ui.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Bots act on whichever host screen is open (local mode only).
function useBots(s, dispatch) {
  useEffect(() => {
    if (!s) return;
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
  }, [s && s.version]);
}

export function NotFound() {
  const { t } = useT();
  return html`<main class="center-screen">
    <${Brand} small />
    <div class="panel narrow"><p>${t('no_room')}</p><${ModeNote} />
    <a class="btn" href="#/">${t('home')}</a></div>
  </main>`;
}

export function Host({ code }) {
  const [s, dispatch] = useRoom(code);
  const { t } = useT();
  useBots(s, dispatch);
  if (s === undefined) return html`<${Loading} />`;
  if (!s) return html`<${NotFound} />`;

  return html`<main class="host">
    <header class="host-h">
      <${Brand} small />
      <div class="room-code"><small>${t('code')}</small><b>${s.code}</b></div>
      <${PhaseBadge} s=${s} />
      <div class="grow"></div>
      ${s.phase !== 'lobby' && html`<${SeatMeter} s=${s} />`}
      <${LangSwitch} value=${s.traitLang} onChange=${(l) => dispatch({ type: 'settings', traitLang: l })} label=${t('trait_lang')} />
      <${UiLang} />
    </header>
    ${s.phase === 'lobby' ? html`<${Lobby} s=${s} dispatch=${dispatch} />`
      : s.phase === 'final' ? html`<${Final} s=${s} dispatch=${dispatch} host />`
      : html`<${Board} s=${s} dispatch=${dispatch} />`}
  </main>`;
}

function Lobby({ s, dispatch }) {
  const { t } = useT();
  const base = useLanBase();
  const url = `${base}#/play/${s.code}`;
  return html`<div class="lobby">
    <section class="panel lobby-join">
      <div class="panel-h"><span>${t('scan')}</span></div>
      <${QR} text=${url} size=${220} />
      <div class="big-code">${s.code}</div>
      <div class="url">${t('or_open')} <code>${url}</code></div>
      <${ModeNote} />
    </section>

    <section class="panel lobby-list">
      <div class="panel-h"><span>${t('lobby')}</span><span>${s.players.length}/${MAX_PLAYERS}</span></div>
      ${s.players.length === 0 && html`<p class="dim blink">${t('waiting_players')}</p>`}
      <ul class="roster">
        ${s.players.map((p) => html`<li><span class="ava">${p.avatar}</span><span class="pname">${p.name}</span>${p.bot && html`<span class="chip">BOT</span>`}
          <button class="x" title=${t('kick')} onClick=${() => dispatch({ type: 'kick', id: p.id })}>✕</button></li>`)}
      </ul>
      <div class="lobby-ctl">
        <button class="btn ghost" onClick=${() => dispatch({ type: 'addBots', n: 1 })}>${t('add_bot')}</button>
        <label class="check"><input type="checkbox" checked=${s.mature} onChange=${(e) => dispatch({ type: 'settings', mature: e.target.checked })} /> ${t('mature')}</label>
        <label class="check">${t('disc_time')}
          <select class="input sm" value=${s.discussionSec} onChange=${(e) => dispatch({ type: 'settings', discussionSec: +e.target.value })}>
            ${[45, 60, 90, 120, 180].map((n) => html`<option value=${n}>${n} ${t('sec')}</option>`)}
          </select>
        </label>
      </div>
      <button class="btn primary big" disabled=${s.players.length < MIN_PLAYERS} onClick=${() => dispatch({ type: 'start' })}>${t('start')}</button>
      ${s.players.length < MIN_PLAYERS && html`<div class="dim">${t('need_more', { n: MIN_PLAYERS })}</div>`}
    </section>
  </div>`;
}

function primaryLabel(s, t) {
  switch (s.phase) {
    case 'briefing': return t('to_round', { n: 1 });
    case 'reveal': return t('to_discussion');
    case 'discussion': return t('to_voting');
    case 'voting': return t('close_vote');
    case 'results': return alive(s).length <= s.seats ? t('to_final') : t('to_round', { n: s.round + 1 });
    default: return t('next');
  }
}

function Board({ s, dispatch }) {
  const { t } = useT();
  const a = alive(s);
  const progress = s.phase === 'reveal' ? `${t('revealed_n')}: ${s.revealed.length}/${a.length}`
    : s.phase === 'voting' ? `${t('voted')}: ${Object.keys(s.votes).length}/${a.length}` : '';
  const blocked = s.phase === 'results' && s.tie.length > 0;
  return html`<div class="board">
    <aside class="board-side">
      <${CatastrophePanel} s=${s} />
      <${BunkerPanel} s=${s} />
      <${LogFeed} s=${s} />
    </aside>
    <section class="board-main">
      <div class="hint-bar">
        <span class="hint">${hint(s, t)}</span>
        ${progress && html`<span class="progress">${progress}</span>`}
        ${s.phase === 'discussion' && html`<${Timer} end=${s.timerEnd} big />`}
      </div>
      <div class="pgrid">
        ${s.players.map((p) => html`<${PlayerTile} s=${s} p=${p} />`)}
      </div>
      <div class="ctl-bar">
        ${s.phase === 'discussion' && html`<button class="btn ghost" onClick=${() => dispatch({ type: 'extendTimer', sec: 30 })}>${t('plus30')}</button>`}
        <div class="grow"></div>
        <button class="btn primary big" disabled=${blocked} onClick=${() => dispatch({ type: 'next' })}>${primaryLabel(s, t)} ▶</button>
      </div>
    </section>
    ${s.phase === 'results' && html`<${Results} s=${s} dispatch=${dispatch} host />`}
  </div>`;
}

export function Results({ s, dispatch, host }) {
  const { t } = useT();
  const ex = s.lastExiled && findP(s, s.lastExiled);
  const tally = s.lastTally || {};
  const max = Math.max(1, ...Object.values(tally));
  return html`<div class="overlay">
    <div class="results panel">
      ${ex ? html`
        <div class="res-h">${t('on_surface')}</div>
        <div class="res-who"><span class="ava xl">${ex.avatar}</span><span>${ex.name}</span></div>
        <div class="res-cards">${CATS.map((c) => html`<${TraitCard} cat=${c} card=${ex.cards[c]} lang=${s.traitLang} compact />`)}</div>
        <div class="stamp big">${t('exiled')}</div>
      ` : html`<div class="res-h">${t('tie_host')}</div>
        ${host && html`<div class="tie-btns">${s.tie.map((id) => { const p = findP(s, id); return html`<button class="btn" onClick=${() => dispatch({ type: 'hostExile', id })}>${p.avatar} ${p.name}</button>`; })}</div>`}`}
      <div class="tally">
        ${Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([id, n]) => html`<div class="tally-r">
          <span class="tally-n">${findP(s, id)?.name}</span>
          <span class="tally-bar"><i style=${`width:${(n / max) * 100}%`}></i></span><b>${n}</b>
        </div>`)}
      </div>
      ${host && ex && html`<button class="btn primary big" onClick=${() => dispatch({ type: 'next' })}>${primaryLabel(s, t)} ▶</button>`}
    </div>
  </div>`;
}

export function Final({ s, dispatch, host }) {
  const { t } = useT();
  const ev = evaluate(s);
  const surv = alive(s);
  return html`<div class="final">
    <section class="panel verdict">
      <div class="panel-h"><span>☢ ${t('verdict')}</span><span>${Math.round(ev.score * 100)}%</span></div>
      <h2 class=${'v-' + ev.verdict}>${t('v_' + ev.verdict)}</h2>
      <ul class="checks">${ev.checks.map((c) => html`<li class=${c.ok ? 'ok' : 'bad'}><span>${c.ok ? '✔' : '✖'}</span>${t('c_' + c.k)}</li>`)}</ul>
      <${CatastrophePanel} s=${s} full=${false} />
      <${BunkerPanel} s=${s} />
      ${host && html`<div class="row"><button class="btn primary" onClick=${() => dispatch({ type: 'reset' })}>${t('new_game')}</button><a class="btn ghost" href="#/">${t('home')}</a></div>`}
    </section>
    <section class="final-surv">
      <div class="panel-h"><span>${t('survivors')}</span><span>${surv.length}</span></div>
      <div class="pgrid">${surv.map((p) => html`<${PlayerTile} s=${s} p=${p} />`)}</div>
    </section>
  </div>`;
}

// TV / projector screen. Pure display + a small auto-hiding dock;
// every command lives in the admin panel (drawer here, or a phone).
import { html, useEffect, useRef, useState } from '../lib.js';
import { useT } from '../i18n.js';
import { CATS } from '../content.js';
import { alive, findP, evaluate, isHost, tiedIds, MIN_PLAYERS, MAX_PLAYERS } from '../engine.js';
import { useRoom, hostKey } from '../transport.js';
import {
  Brand, PhaseBadge, Timer, SeatMeter, TraitCard, CatastrophePanel, BunkerPanel, BlockPanel, TiePanel, LogFeed,
  LangSwitch, FitGrid, QR, useLanBase, hint, primaryLabel, Loading, ModeNote, isFresh,
} from '../ui.js';
import { AdminPanel, SpeedPicker, useBots } from './admin.js';

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
  const ctl = isHost(s, hostKey.get(code));
  const [panel, setPanel] = useState(false);
  useBots(s, dispatch, ctl);

  useEffect(() => {
    document.documentElement.classList.add('tv');
    return () => document.documentElement.classList.remove('tv');
  }, []);

  // keyboard: Space / → = next, Esc closes the panel
  const live = useRef(s); live.current = s;
  useEffect(() => {
    if (!ctl) return;
    const onKey = (e) => {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') { setPanel(false); return; }
      if (e.key !== ' ' && e.key !== 'ArrowRight') return;
      const st = live.current;
      if (!st || st.phase === 'final' || (st.phase === 'results' && st.tie.length)) return;
      e.preventDefault();
      dispatch(st.phase === 'lobby' ? { type: 'start' } : { type: 'next' });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [ctl]);

  if (s === undefined) return html`<${Loading} />`;
  if (!s) return html`<${NotFound} />`;

  const nextDisabled = (s.phase === 'results' && s.tie.length > 0) || (s.phase === 'lobby' && s.players.length < MIN_PLAYERS);

  return html`<main class="host">
    <header class="host-h">
      <${Brand} small />
      <div class="room-code"><small>${t('code')}</small><b>${s.code}</b></div>
      <${PhaseBadge} s=${s} />
      ${s.admin && html`<span class="chip red">${t('admin_badge')}</span>`}
      ${!ctl && html`<span class="chip">${t('view_only')}</span>`}
      <div class="grow"></div>
      ${s.phase === 'discussion' && html`<${Timer} end=${s.timerEnd} big />`}
      ${s.phase !== 'lobby' && html`<${SeatMeter} s=${s} />`}
    </header>

    ${s.phase === 'lobby' ? html`<${Lobby} s=${s} dispatch=${dispatch} ctl=${ctl} />`
      : s.phase === 'final' ? html`<${Final} s=${s} dispatch=${dispatch} host=${ctl} />`
      : html`<${Board} s=${s} />`}
    ${s.phase === 'results' && html`<${Results} s=${s} dispatch=${dispatch} host=${ctl} />`}

    ${ctl && html`<div class=${'dock dock-' + s.phase}>
      <button class="btn dock-gear" title=${t('admin_panel')} onClick=${() => setPanel(true)}>⚙</button>
      ${s.phase !== 'final' && s.phase !== 'lobby' && html`<button class="btn primary" disabled=${nextDisabled}
        onClick=${() => dispatch({ type: 'next' })} title=${t('keys_hint')}>${primaryLabel(s, t)} ▶</button>`}
    </div>`}

    ${ctl && panel && html`<div class="drawer-bg" onClick=${(e) => e.target === e.currentTarget && setPanel(false)}>
      <aside class="drawer"><${AdminPanel} s=${s} dispatch=${dispatch} onClose=${() => setPanel(false)} /></aside>
    </div>`}
  </main>`;
}

function Lobby({ s, dispatch, ctl }) {
  const { t } = useT();
  const base = useLanBase();
  const url = `${base}#/play/${s.code}`;
  const noop = () => {};
  return html`<div class="lobby">
    <section class="panel lobby-join">
      <div class="panel-h"><span>${t('scan')}</span></div>
      <${QR} text=${url} size="min(36vh, 24vw)" />
      <div class="big-code">${s.code}</div>
      <div class="url">${t('or_open')} <code>${url}</code></div>
      <${ModeNote} />
    </section>

    <section class="lobby-main">
      <div class="panel lobby-list">
        <div class="panel-h"><span>${t('lobby')}</span><span>${s.players.length}/${MAX_PLAYERS}</span></div>
        ${s.players.length === 0 && html`<p class="dim blink">${t('waiting_players')}</p>`}
        <ul class="roster">
          ${s.players.map((p) => html`<li><span class="ava">${p.avatar}</span><span class="pname">${p.name}</span>${p.bot && html`<span class="chip">BOT</span>`}</li>`)}
        </ul>
      </div>

      <div class="panel">
        <div class="panel-h"><span>${t('speed_title')}</span></div>
        <${SpeedPicker} s=${s} dispatch=${ctl ? dispatch : noop} big />
        <p class="dim">${t('est_note', { n: Math.max(s.players.length, MIN_PLAYERS) })}</p>
      </div>

      ${ctl && html`<div class="panel lobby-set">
        <div class="panel-h"><span>${t('sec_lobby')}</span></div>
        <div class="lobby-set-row">
          <div class="lobby-set-g"><small>${t('bots')}</small>
            <div class="row"><button class="btn ghost" onClick=${() => dispatch({ type: 'addBots', n: 1 })}>${t('add_bot')}</button>
            <button class="btn ghost" onClick=${() => dispatch({ type: 'addBots', n: 5 })}>${t('add_bots5')}</button></div></div>
          <div class="lobby-set-g"><small>${t('trait_lang')}</small>
            <${LangSwitch} value=${s.traitLang} onChange=${(l) => dispatch({ type: 'settings', traitLang: l })} /></div>
          <label class="check lobby-set-g"><input type="checkbox" checked=${s.mature} onChange=${(e) => dispatch({ type: 'settings', mature: e.target.checked })} /> ${t('mature')}</label>
        </div>
      </div>`}
      ${ctl && html`<div class="lobby-ctl">
        <div class="grow"></div>
        <button class="btn primary big" disabled=${s.players.length < MIN_PLAYERS} onClick=${() => dispatch({ type: 'start' })}>${t('start')} ▶</button>
      </div>`}
      ${s.players.length < MIN_PLAYERS && html`<div class="dim">${t('need_more', { n: MIN_PLAYERS })}</div>`}
    </section>
  </div>`;
}

function Board({ s }) {
  const { t } = useT();
  const a = alive(s);
  const progress = s.phase === 'reveal' ? `${t('revealed_n')}: ${s.revealed.length}/${a.length}`
    : s.phase === 'voting' ? `${t('voted')}: ${Object.keys(s.votes).length}/${a.length}` : '';
  return html`<div class="board">
    <aside class="board-side">
      <${CatastrophePanel} s=${s} />
      <${BunkerPanel} s=${s} />
      <${BlockPanel} s=${s} />
      <${TiePanel} s=${s} />
      <${LogFeed} s=${s} max=${6} />
    </aside>
    <section class="board-main">
      <div class=${'hint-bar' + (s.phase === 'voting' ? ' voting' : '')}>
        <span class="hint">${hint(s, t)}</span>
        ${progress && html`<span class="progress">${progress}</span>`}
      </div>
      <${FitGrid} n=${a.length}>
        ${a.map((p) => html`<div class="cell"><${TvTile} s=${s} p=${p} /></div>`)}
      <//>
      <${OutStrip} s=${s} />
    </section>
  </div>`;
}

/** TV tile: revealed cards get the space, hidden ones shrink to labels.
 *  --h (in em) is the tile's content height, so the font scales to fill it. */
export function TvTile({ s, p }) {
  const { t } = useT();
  const open = CATS.filter((c) => p.cards[c]?.revealed);
  const hid = CATS.filter((c) => !p.cards[c]?.revealed);
  const rows = Math.ceil(open.length / 2);
  // header+padding 3.5em, each card row ≈3.75em, hidden labels wrap ~4 per line (1.1em each) + gap
  const h = 3.5 + rows * 3.75 + (hid.length ? 0.45 + Math.ceil(hid.length / 4) * 1.1 : 0);
  const done = (s.phase === 'voting' && s.votes[p.id]) || (s.phase === 'reveal' && s.revealed.includes(p.id));
  const onBlock = p.alive && s.round <= 2 && s.board.includes(p.id);
  const onTie = tiedIds(s).includes(p.id);
  return html`<div class=${'ptile tvtile' + (onBlock ? ' onblock' : '') + (onTie ? ' ontie' : '')} style=${`--h:${h}`}>
    <div class="ptile-h">
      <span class="ava">${p.avatar}</span>
      <span class="pname">${p.name}</span>
      ${onTie ? html`<span class="chip tie">${t('tie_chip')}</span>` : onBlock && html`<span class="chip red">${t('board')}</span>`}
      ${done && html`<span class="chip">✓</span>`}
    </div>
    <div class="tv-open">${open.map((c) => html`<${TraitCard} cat=${c} card=${p.cards[c]} lang=${s.traitLang} compact fresh=${isFresh(s, p.cards[c])} />`)}</div>
    ${hid.length > 0 && html`<div class="tv-hidden">${hid.map((c) => html`<span class="tv-chip">${t('cat_' + c)}</span>`)}</div>`}
    ${s.phase === 'final' && html`<div class="stamp ok">${t('survivor')}</div>`}
  </div>`;
}

function OutStrip({ s }) {
  const { t } = useT();
  const out = s.players.filter((p) => !p.alive);
  if (!out.length) return null;
  return html`<div class="out-strip">
    <span class="out-l">${t('on_surface')}</span>
    ${out.map((p) => html`<span class=${'out-chip' + (p.left ? ' left' : '')}><span class="ava">${p.avatar}</span>${p.name}<small>${p.left ? t('left') : t('exiled')}</small></span>`)}
  </div>`;
}

export function Results({ s, dispatch, host }) {
  const { t } = useT();
  const outs = s.out.map((id) => findP(s, id)).filter(Boolean);
  const board = s.outKind === 'board';
  const tally = s.lastTally || {};
  const max = Math.max(1, ...Object.values(tally));
  const title = board ? t('res_board') : outs.length > 1 ? t('res_out_n') : t('on_surface');
  return html`<div class="overlay">
    <div class=${'results panel' + (outs.length > 1 ? ' multi' : '')}>
      ${outs.length > 0 && html`<div class=${'res-h' + (board ? ' amber' : '')}>${title}</div>`}
      <div class="res-list">
        ${outs.map((p) => html`<div class="res-one">
          <div class="res-who"><span class="ava xl">${p.avatar}</span><span>${p.name}</span></div>
          ${!board && html`<div class="res-cards">${CATS.map((c) => html`<${TraitCard} cat=${c} card=${p.cards[c]} lang=${s.traitLang} compact />`)}</div>`}
          ${board ? html`<span class="chip red res-chip">☒ ${t('board')}</span>` : html`<div class="stamp big">${t('exiled')}</div>`}
        </div>`)}
      </div>
      ${s.tie.length > 0 && html`<div class="res-h">${t('tie_host_n', { n: s.slots })}</div>
        <div class="tie-btns">${s.tie.map((id) => { const p = findP(s, id);
          return host ? html`<button class="btn" onClick=${() => dispatch({ type: 'hostExile', id })}>${p.avatar} ${p.name}</button>`
            : html`<span class="chip">${p.avatar} ${p.name}</span>`; })}</div>`}
      <div class="tally">
        ${Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([id, n]) => html`<div class="tally-r">
          <span class="tally-n">${findP(s, id)?.name}</span>
          <span class="tally-bar"><i style=${`width:${(n / max) * 100}%`}></i></span><b>${n}</b>
        </div>`)}
      </div>
      ${host && !s.tie.length && html`<button class="btn primary big" onClick=${() => dispatch({ type: 'next' })}>${primaryLabel(s, t)} ▶</button>`}
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
      <${FitGrid} n=${surv.length}>${surv.map((p) => html`<div class="cell"><${TvTile} s=${s} p=${p} /></div>`)}<//>
    </section>
  </div>`;
}

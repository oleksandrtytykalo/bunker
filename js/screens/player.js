import { html, useState } from '../lib.js';
import { useT } from '../i18n.js';
import { CATS, AVATARS } from '../content.js';
import { alive, findP, canReveal, actionOf, uid, votesNeeded, discussionSec, totalRounds } from '../engine.js';
import { useRoom } from '../transport.js';
import { Brand, UiLang, PhaseBadge, Timer, TraitCard, CatastrophePanel, BunkerPanel, LogFeed, PlayerTile, SeatMeter, BlockPanel, TiePanel, Modal, hint, Loading, ModeNote, isFresh } from '../ui.js';
import { NotFound, Results, Final } from './host.js';

const PID = (code) => `bunker:pid:${code}`;
// sessionStorage = this tab; localStorage = this phone (survives closing the tab).
// `fresh` (#/play/CODE/new) ignores the phone-wide id so one device can test several players.
const getPid = (code, fresh) => {
  try { return sessionStorage.getItem(PID(code)) || (fresh ? null : localStorage.getItem(PID(code))); } catch { return null; }
};
const setPid = (code, id, fresh) => {
  try { sessionStorage.setItem(PID(code), id); if (!fresh) localStorage.setItem(PID(code), id); } catch {}
};

export function Player({ code, fresh }) {
  const [s, dispatch] = useRoom(code);
  const [pid, setP] = useState(() => getPid(code, fresh));
  const [spectate, setSpectate] = useState(false);
  const { t } = useT();
  if (s === undefined) return html`<${Loading} />`;
  if (!s) return html`<${NotFound} />`;
  const me = pid && findP(s, pid);

  if (!me && !spectate) {
    if (s.phase === 'lobby') {
      return html`<${JoinForm} s=${s} onJoin=${(name, avatar) => {
        const id = 'p_' + uid(); setPid(code, id, fresh); setP(id);
        dispatch({ type: 'join', player: { id, name, avatar } });
      }} />`;
    }
    return html`<main class="center-screen"><${Brand} small /><div class="panel narrow">
      <p>${t('game_started')}</p><button class="btn" onClick=${() => setSpectate(true)}>${t('watch')}</button></div></main>`;
  }

  return html`<main class="phone">
    <header class="phone-h">
      ${me ? html`<span class="ava">${me.avatar}</span><span class="pname">${me.name}</span>` : html`<span class="pname dim">${t('spectator')}</span>`}
      <span class="grow"></span>
      <span class="room-code sm"><b>${s.code}</b></span>
      <${UiLang} />
    </header>
    ${s.phase === 'lobby' ? html`<${Waiting} s=${s} me=${me} />`
      : s.phase === 'final' ? html`<${Final} s=${s} dispatch=${dispatch} />`
      : html`<${InGame} s=${s} me=${me} dispatch=${dispatch} />`}
  </main>`;
}

function JoinForm({ s, onJoin }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [ava, setAva] = useState(AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const submit = (e) => { e.preventDefault(); if (name.trim()) onJoin(name.trim(), ava); };
  return html`<main class="phone">
    <header class="phone-h"><${Brand} small /><span class="grow"></span><${UiLang} /></header>
    <form class="panel join-form" onSubmit=${submit}>
      <div class="panel-h"><span>${t('code')}: ${s.code}</span><span>${s.players.length} ${t('players').toLowerCase()}</span></div>
      <label class="fld"><span>${t('callsign')}</span>
        <input class="input" maxlength="18" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Сокіл / Falcon" autofocus />
      </label>
      <div class="fld"><span>${t('choose_avatar')}</span>
        <div class="ava-grid">${AVATARS.map((a) => html`<button type="button" class=${'ava-b' + (a === ava ? ' on' : '')} onClick=${() => setAva(a)}>${a}</button>`)}</div>
      </div>
      <button class="btn primary big" type="submit" disabled=${!name.trim()}>${t('create_char')}</button>
    </form>
  </main>`;
}

function Waiting({ s, me }) {
  const { t } = useT();
  return html`<div class="pad">
    <div class="panel">
      <p class="blink">${me ? t('you_in') : t('waiting_players')}</p>
      <ul class="roster">${s.players.map((p) => html`<li class=${p.id === me?.id ? 'me' : ''}><span class="ava">${p.avatar}</span><span class="pname">${p.name}</span></li>`)}</ul>
    </div>
    <${ModeNote} />
  </div>`;
}

function InGame({ s, me, dispatch }) {
  const { t } = useT();
  const [tab, setTab] = useState(me ? 'dossier' : 'board');
  const [confirm, setConfirm] = useState(null); // {kind:'reveal'|'vote'|'action', ...}
  const voting = s.phase === 'voting' && me && me.alive;
  const myVote = me && s.votes[me.id];

  const doConfirm = () => {
    const c = confirm; setConfirm(null);
    if (c.kind === 'reveal') dispatch({ type: 'reveal', id: me.id, cat: c.cat });
    if (c.kind === 'vote') dispatch({ type: 'vote', id: me.id, target: c.id });
    if (c.kind === 'action') dispatch({ type: 'useAction', id: me.id, idx: c.idx, target: c.target });
  };

  return html`<div class="pad">
    <${RoundIntro} s=${s} me=${me} />
    <div class="status panel">
      <div class="status-r"><${PhaseBadge} s=${s} />${s.phase === 'discussion' && html`<${Timer} end=${s.timerEnd} />`}</div>
      <div class="hint">${hint(s, t)}</div>
      ${me && s.phase === 'reveal' && me.alive && s.revealed.includes(me.id) && html`<div class="dim">✓ ${t('already_revealed')}</div>`}
      <${BlockPanel} s=${s} />
      <${TiePanel} s=${s} />
    </div>

    ${me && !me.alive && html`<div class="panel dead-banner"><b>${t('dead_title')}</b><span>${t('dead_d')}</span></div>`}

    ${voting && html`<section class="panel vote">
      <div class="panel-h"><span>☒ ${t(s.round === 1 ? 'nominate' : 'vote_for')}</span>${myVote && html`<span>${t('your_vote')}: ${findP(s, myVote)?.name}</span>`}</div>
      <div class="vote-list">${s.candidates.filter((id) => id !== me.id).map((id) => {
        const p = findP(s, id);
        return html`<button class=${'vote-b' + (myVote === id ? ' on' : '')} onClick=${() => setConfirm({ kind: 'vote', id, name: p.name })}>
          <span class="ava">${p.avatar}</span>${p.name}</button>`;
      })}</div>
    </section>`}

    <nav class="tabs">
      ${me && html`<button class=${tab === 'dossier' ? 'on' : ''} onClick=${() => setTab('dossier')}>${t('tab_dossier')}</button>`}
      <button class=${tab === 'board' ? 'on' : ''} onClick=${() => setTab('board')}>${t('tab_board')}</button>
      <button class=${tab === 'bunker' ? 'on' : ''} onClick=${() => setTab('bunker')}>${t('tab_bunker')}</button>
    </nav>

    ${tab === 'dossier' && me && html`<${Dossier} s=${s} me=${me} onReveal=${(cat) => setConfirm({ kind: 'reveal', cat })}
      onAction=${(idx, target) => setConfirm({ kind: 'action', idx, target })} />`}
    ${tab === 'board' && html`<div class="board-phone">
      <${SeatMeter} s=${s} />
      ${s.players.filter((p) => p.id !== me?.id).map((p) => html`<${PlayerTile} s=${s} p=${p} />`)}
    </div>`}
    ${tab === 'bunker' && html`<div class="stack"><${CatastrophePanel} s=${s} /><${BunkerPanel} s=${s} /><${LogFeed} s=${s} max=${15} /></div>`}

    ${confirm && html`<${Modal} onClose=${() => setConfirm(null)}>
      <p class="modal-q">${confirm.kind === 'reveal' ? t('reveal_q', { cat: t('cat_' + confirm.cat) })
        : confirm.kind === 'vote' ? t('vote_q', { name: confirm.name })
        : actionOf(me.actions[confirm.idx].id)[s.traitLang][0] + (confirm.target ? ' → ' + findP(s, confirm.target).name : '') + '?'}</p>
      <div class="row"><button class="btn primary" onClick=${doConfirm}>${t('yes')}</button><button class="btn ghost" onClick=${() => setConfirm(null)}>${t('no')}</button></div>
    <//>`}
    ${s.phase === 'results' && html`<${Results} s=${s} dispatch=${dispatch} />`}
  </div>`;
}

function Dossier({ s, me, onReveal, onAction }) {
  const { t } = useT();
  const [targeting, setTargeting] = useState(null); // action idx
  const actPhase = ['reveal', 'discussion', 'voting'].includes(s.phase) && me.alive;
  const others = alive(s).filter((p) => p.id !== me.id);
  return html`<div class="dossier">
    <div class="dossier-sheet">
      <div class="sheet-h"><span>ОСОБОВА СПРАВА / PERSONAL FILE</span><span>№ ${me.id.slice(-4).toUpperCase()}</span></div>
      ${CATS.map((c) => {
        const can = canReveal(s, me, c);
        return html`<${TraitCard} cat=${c} card=${me.cards[c]} lang=${s.traitLang} hidden=${false} fresh=${isFresh(s, me.cards[c])} can=${can} onClick=${can ? () => onReveal(c) : undefined} />`;
      })}
      ${s.phase === 'reveal' && !s.revealed.includes(me.id) && me.alive && html`<div class="dim tap-hint">▶ ${t('tap_reveal')}</div>`}
    </div>

    <section class="panel">
      <div class="panel-h"><span>✦ ${t('actions')}</span></div>
      ${me.actions.map((a, idx) => {
        const def = actionOf(a.id); const [name, desc] = def[s.traitLang];
        return html`<div class=${'action' + (a.used ? ' used' : '')}>
          <div><b>${name}</b><p>${desc}</p></div>
          ${a.used ? html`<span class="chip">${t('used')}</span>`
            : html`<button class="btn sm" disabled=${!actPhase} onClick=${() => def.target ? setTargeting(idx) : onAction(idx)}>${t('use')}</button>`}
        </div>`;
      })}
    </section>

    ${targeting !== null && html`<${Modal} onClose=${() => setTargeting(null)}>
      <p class="modal-q">${t('choose_target')}</p>
      <div class="vote-list">${others.map((p) => html`<button class="vote-b" onClick=${() => { const i = targeting; setTargeting(null); onAction(i, p.id); }}><span class="ava">${p.avatar}</span>${p.name}</button>`)}</div>
      <button class="btn ghost" onClick=${() => setTargeting(null)}>${t('cancel')}</button>
    <//>`}
  </div>`;
}

/** Short popup at the start of each round. Tap anywhere to close; shown once per round per tab. */
function RoundIntro({ s, me }) {
  const { t } = useT();
  const key = `bunker:intro:${s.code}`;
  const [seen, setSeen] = useState(() => { try { return +sessionStorage.getItem(key) || 0; } catch { return 0; } });
  if (s.phase !== 'reveal' || s.round <= seen) return null;
  const close = () => { setSeen(s.round); try { sessionStorage.setItem(key, String(s.round)); } catch {} };
  const k = votesNeeded(s);
  const secs = discussionSec(s.speed, s.round, alive(s).length);
  const time = secs >= 60 ? `${Math.round(secs / 60)} ${t('min')}` : `${secs} ${t('sec')}`;
  const body = s.round === 1 ? t('ri_1', { k }) : s.round === 2 && s.board.length ? t('ri_2') : k > 1 ? t('ri_n2', { k }) : t('ri_n');
  const last = s.round >= totalRounds(s);
  return html`<div class="intro" onClick=${close}>
    <div class="intro-b panel" onClick=${(e) => { e.stopPropagation(); close(); }}>
      <div class="intro-h"><span>${t('round')} ${s.round} ${t('of')} ${totalRounds(s)}</span><button class="x" aria-label=${t('close')}>✕</button></div>
      ${last && html`<div class="intro-last">☢ ${t('ri_last')}</div>`}
      <p class="intro-t">${body}</p>
      <p class="intro-m">⏱ ${t('ri_time', { t: time })}${me && !me.alive ? ' · ' + t('spectator') : ''}</p>
      <div class="intro-tap">${t('got_it')}</div>
    </div>
  </div>`;
}

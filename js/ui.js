// Shared UI pieces for host, admin and player screens.
import { html, useEffect, useState, useRef } from './lib.js';
import { useT } from './i18n.js';
import { CATS } from './content.js';
import { cardText, catastropheOf, roomOf, actionOf, findP, alive, totalRounds } from './engine.js';
import { useNow, transport } from './transport.js';

export function LangSwitch({ value, onChange, label }) {
  return html`<div class="lang" title=${label || ''}>
    ${label && html`<span class="lang-l">${label}</span>`}
    ${['uk', 'en'].map((l) => html`<button class=${'lang-b' + (value === l ? ' on' : '')} onClick=${() => onChange(l)}>${l === 'uk' ? 'УКР' : 'ENG'}</button>`)}
  </div>`;
}

export function UiLang() {
  const { lang, setLang, t } = useT();
  return html`<${LangSwitch} value=${lang} onChange=${setLang} label=${t('ui_lang')} />`;
}

export function Brand({ small }) {
  const { t } = useT();
  return html`<div class=${'brand' + (small ? ' sm' : '')}><span class="brand-ico">☢</span><span class="brand-t flicker">${t('title')}</span></div>`;
}

export function PhaseBadge({ s }) {
  const { t } = useT();
  const showRound = s.round > 0 && s.phase !== 'final';
  return html`<div class="phase"><span class="dot"></span>${t('ph_' + s.phase)}${showRound ? html`<span class="phase-r">· ${t('round')} ${s.round} ${t('of')} ${totalRounds(s)}</span>` : ''}</div>`;
}

export function hint(s, t) {
  if (s.phase === 'reveal') return s.round === 1 ? t('h_reveal_1') : t('h_reveal');
  if (s.phase === 'voting') {
    if (s.revote) return t('h_revote');
    if (s.round === 1) return t('h_voting_1', { k: s.k });
    if (s.round === 2 && s.board.length) return t('h_voting_2') + (s.k > 1 ? ' ' + t('h_voting_k', { k: s.k }) : '');
    if (s.k > 1) return t('h_voting_k', { k: s.k });
    return t('h_voting');
  }
  if (s.phase === 'results' && s.outKind === 'board') return t('h_results_board');
  return t('h_' + s.phase);
}

export function Timer({ end, big }) {
  const now = useNow(250);
  if (!end) return null;
  const left = Math.max(0, Math.ceil((end - now) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  return html`<div class=${'timer' + (big ? ' big' : '') + (left <= 10 ? ' warn' : '')}>${mm}:${ss}</div>`;
}

// ── Geiger-style meter: seats vs alive ──
export function SeatMeter({ s }) {
  const { t } = useT();
  const a = alive(s).length;
  const n = s.players.filter((p) => !p.left).length;
  return html`<div class="meter">
    <div class="meter-lbl"><span>${t('seats')}: <b>${s.seats}</b></span><span>${t('alive')}: <b>${a}</b></span></div>
    <div class="meter-bar">${Array.from({ length: Math.max(n, a) }, (_, i) => html`<i class=${i < s.seats ? 'seat' : i < a ? 'over' : 'gone'}></i>`)}</div>
  </div>`;
}

export function TraitCard({ cat, card, lang, hidden, onClick, can, compact }) {
  const { t } = useT();
  // hidden === false → owner's own view: text visible even before reveal
  const open = !!(card && card.revealed);
  const visible = !!card && (open || hidden === false);
  const cls = 'tcard' + (open ? ' open' : '') + (visible && !open ? ' priv' : '') + (can ? ' can' : '') + (compact ? ' cmp' : '');
  return html`<div class=${cls} onClick=${onClick}>
    <div class="tcard-cat">${t('cat_' + cat)}${can ? html`<span class="tcard-tap">▶</span>` : ''}${open && hidden === false ? html`<span class="tcard-badge">✔ ${t('opened')}</span>` : ''}</div>
    <div class="tcard-v">${visible ? cardText(cat, card, lang) : html`<span class="redact">${t('classified')}</span>`}</div>
  </div>`;
}

export function CatastrophePanel({ s, full }) {
  const { t } = useT();
  const c = catastropheOf(s);
  if (!c) return null;
  const [title, desc] = c[s.traitLang];
  return html`<section class="panel cat-panel">
    <div class="panel-h"><span>⚠ ${t('catastrophe')}</span></div>
    <h2 class="cat-title">${title}</h2>
    ${full !== false && html`<p class="cat-desc">${desc}</p>`}
  </section>`;
}

export function BunkerPanel({ s }) {
  const { t } = useT();
  if (!s.bunker) return null;
  const b = s.bunker;
  return html`<section class="panel bunker-panel">
    <div class="panel-h"><span>▣ ${t('bunker')}</span></div>
    <div class="stats">
      <div><small>${t('area')}</small><b>${b.area} ${t('m2')}</b></div>
      <div><small>${t('stay')}</small><b>${s.catastrophe.months} ${t('months')}</b></div>
      <div><small>${t('food')}</small><b>${b.food} ${t('months')}</b></div>
    </div>
    <div class="rooms">
      ${b.rooms.map((r, i) => html`<div class=${'room' + (r.revealed ? ' open' : '')}>
        <span class="room-n">0${i + 1}</span>
        <span>${r.revealed ? roomOf(r.id)[s.traitLang] : t('locked')}</span>
      </div>`)}
    </div>
  </section>`;
}

/** players currently on the block (round 1 results → round 2) */
export function BlockPanel({ s }) {
  const { t } = useT();
  const ids = s.board.filter((id) => findP(s, id)?.alive);
  if (!ids.length || s.round > 2) return null;
  return html`<section class="panel block-panel">
    <div class="panel-h"><span>☒ ${t('board')}</span><span>${ids.length}</span></div>
    <div class="block-list">${ids.map((id) => { const p = findP(s, id); return html`<span class="block-p"><span class="ava">${p.avatar}</span>${p.name}</span>`; })}</div>
  </section>`;
}

export function LogFeed({ s, max = 8 }) {
  const { t } = useT();
  const name = (id) => findP(s, id)?.name || '';
  const items = s.log.slice(-max).reverse();
  return html`<div class="log">
    <div class="log-h">◉ ${t('radio')}</div>
    ${items.map((e) => {
      const p = { ...e.p };
      if (p.a) p.a = name(p.a);
      if (p.b) p.b = t('on') + ' ' + name(p.b);
      if (p.ids) p.ids = p.ids.map(name).join(', ');
      if (p.cat) p.cat = t('cat_' + p.cat);
      if (p.room) p.room = roomOf(p.room)[s.traitLang];
      if (p.act) p.act = actionOf(p.act)[s.traitLang][0];
      return html`<div class="log-i">${t('l_' + e.k, p)}</div>`;
    })}
  </div>`;
}

export function PlayerTile({ s, p, me }) {
  const { t } = useT();
  const done = (s.phase === 'voting' && s.votes[p.id]) || (s.phase === 'reveal' && s.revealed.includes(p.id));
  const onBlock = p.alive && s.round <= 2 && s.board.includes(p.id);
  const cls = 'ptile' + (p.alive ? '' : ' dead') + (p.left ? ' left' : '') + (me ? ' me' : '') + (onBlock ? ' onblock' : '');
  return html`<div class=${cls}>
    <div class="ptile-h">
      <span class="ava">${p.avatar}</span>
      <span class="pname">${p.name}${me ? html` <em>(${t('you')})</em>` : ''}</span>
      ${onBlock && html`<span class="chip red">${t('board')}</span>`}
      ${done && html`<span class="chip">✓</span>`}
    </div>
    <div class="ptile-cards">
      ${CATS.map((c) => html`<${TraitCard} cat=${c} card=${p.cards[c]} lang=${s.traitLang} compact />`)}
    </div>
    ${p.left ? html`<div class="stamp gray">${t('left')}</div>`
      : !p.alive ? html`<div class="stamp">${t('exiled')}</div>`
      : s.phase === 'final' ? html`<div class="stamp ok">${t('survivor')}</div>` : ''}
  </div>`;
}

/** Grid that picks columns × rows so N tiles fill the box as large as possible. */
export function FitGrid({ n, aspect = 1.2, children }) {
  const ref = useRef(null);
  const [dim, setDim] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setDim({ w: r.width, h: r.height }); };
    measure();
    const raf = requestAnimationFrame(measure);
    addEventListener('resize', measure);
    const ro = 'ResizeObserver' in window ? new ResizeObserver(measure) : null;
    ro && ro.observe(el);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', measure); ro && ro.disconnect(); };
  }, []);
  let style = '';
  if (dim && dim.h > 0 && n > 0) {
    let best = null;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const scale = Math.min(dim.w / c, (dim.h / r) * aspect);
      if (!best || scale > best.scale) best = { c, r, scale };
    }
    style = `--cols:${best.c};--rows:${best.r}`;
  }
  return html`<div class="fitgrid" ref=${ref} style=${style}>${children}</div>`;
}

export function QR({ text, size = '200px' }) {
  const ref = useRef(null);
  useEffect(() => {
    let live = true;
    import('https://esm.sh/qrcode-generator@1.4.4').then((m) => {
      if (!live || !ref.current) return;
      const qrcode = m.default || m;
      const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
      ref.current.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    }).catch(() => { if (ref.current) ref.current.textContent = ''; });
    return () => { live = false; };
  }, [text]);
  const sz = typeof size === 'number' ? size + 'px' : size;
  return html`<div class="qr" style=${`width:${sz};height:${sz}`} ref=${ref}></div>`;
}

export function useLanBase() {
  const [base, setBase] = useState(() => location.origin + location.pathname);
  useEffect(() => {
    if (!/^(localhost|127\.|\[::1\])/.test(location.hostname)) return;
    fetch('/lan.json').then((r) => r.json()).then((j) => j.url && setBase(j.url)).catch(() => {});
  }, []);
  return base;
}

/** true after `ms` without mouse / touch / key activity */
export function useIdle(ms = 3500) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let tm;
    const wake = () => { setIdle(false); clearTimeout(tm); tm = setTimeout(() => setIdle(true), ms); };
    const evs = ['mousemove', 'mousedown', 'touchstart', 'keydown'];
    evs.forEach((e) => addEventListener(e, wake, { passive: true }));
    wake();
    return () => { clearTimeout(tm); evs.forEach((e) => removeEventListener(e, wake)); };
  }, [ms]);
  return idle;
}

/** button that asks for a second tap before acting */
export function ConfirmButton({ label, confirmLabel, onConfirm, cls = 'btn sm ghost', disabled }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const tm = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(tm); }, [armed]);
  return html`<button class=${cls + (armed ? ' danger' : '')} disabled=${disabled}
    onClick=${() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>${armed ? confirmLabel : label}</button>`;
}

export function Modal({ children, onClose }) {
  return html`<div class="modal" onClick=${(e) => e.target === e.currentTarget && onClose && onClose()}><div class="modal-b panel">${children}</div></div>`;
}

export function Loading() {
  const { t } = useT();
  return html`<main class="center-screen"><${Brand} small /><p class="dim blink">${t('loading')}</p></main>`;
}

export function ModeNote() {
  const { t } = useT();
  return html`<p class="note">${t(transport.mode === 'online' ? 'online_note' : 'local_note')}</p>`;
}

export function primaryLabel(s, t) {
  switch (s.phase) {
    case 'lobby': return t('start');
    case 'briefing': return t('to_round', { n: 1 });
    case 'reveal': return t('to_discussion');
    case 'discussion': return t('to_voting');
    case 'voting': return t('close_vote');
    case 'results': return alive(s).length <= s.seats ? t('to_final') : t('to_round', { n: s.round + 1 });
    default: return t('next');
  }
}

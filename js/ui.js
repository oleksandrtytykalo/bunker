// Shared UI pieces for host + player screens.
import { html, useEffect, useState, useRef } from './lib.js';
import { useT } from './i18n.js';
import { CATS } from './content.js';
import { cardText, catastropheOf, roomOf, actionOf, findP, alive } from './engine.js';
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
  return html`<div class="phase"><span class="dot"></span>${t('ph_' + s.phase)}${s.round > 0 && s.phase !== 'final' ? html`<span class="phase-r">· ${t('round')} ${s.round}</span>` : ''}</div>`;
}

export function hint(s, t) {
  if (s.phase === 'reveal') return s.round === 1 ? t('h_reveal_1') : t('h_reveal');
  if (s.phase === 'voting' && s.revote) return t('h_revote');
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
  const a = alive(s).length, total = s.players.length || 1;
  return html`<div class="meter">
    <div class="meter-lbl"><span>${t('seats')}: <b>${s.seats}</b></span><span>${t('alive')}: <b>${a}</b></span></div>
    <div class="meter-bar">${s.players.map((_, i) => html`<i class=${i < s.seats ? 'seat' : i < a ? 'over' : 'gone'}></i>`)}</div>
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
      if (p.cat) p.cat = t('cat_' + p.cat);
      if (p.room) p.room = roomOf(p.room)[s.traitLang];
      if (p.act) p.act = actionOf(p.act)[s.traitLang][0];
      return html`<div class="log-i">${t('l_' + e.k, p)}</div>`;
    })}
  </div>`;
}

export function PlayerTile({ s, p, me, showAll }) {
  const { t } = useT();
  const voted = s.phase === 'voting' && s.votes[p.id];
  const revealedNow = s.phase === 'reveal' && s.revealed.includes(p.id);
  return html`<div class=${'ptile' + (p.alive ? '' : ' dead') + (me ? ' me' : '')}>
    <div class="ptile-h">
      <span class="ava">${p.avatar}</span>
      <span class="pname">${p.name}${me ? html` <em>(${t('you')})</em>` : ''}</span>
      ${voted && html`<span class="chip">✓</span>`}
      ${revealedNow && html`<span class="chip">✓</span>`}
    </div>
    <div class="ptile-cards">
      ${CATS.map((c) => html`<${TraitCard} cat=${c} card=${p.cards[c]} lang=${s.traitLang} compact hidden=${showAll ? false : undefined} />`)}
    </div>
    ${!p.alive && html`<div class="stamp">${t('exiled')}</div>`}
    ${s.phase === 'final' && p.alive && html`<div class="stamp ok">${t('survivor')}</div>`}
  </div>`;
}

export function QR({ text, size = 200 }) {
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
  return html`<div class="qr" style=${`width:${size}px;height:${size}px`} ref=${ref}></div>`;
}

export function useLanBase() {
  const [base, setBase] = useState(() => location.origin + location.pathname);
  useEffect(() => {
    if (!/^(localhost|127\.|\[::1\])/.test(location.hostname)) return;
    fetch('/lan.json').then((r) => r.json()).then((j) => j.url && setBase(j.url)).catch(() => {});
  }, []);
  return base;
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

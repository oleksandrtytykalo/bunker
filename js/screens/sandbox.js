// Demo view: TV (host) and one phone (player) side by side, both live.
import { html, useState } from '../lib.js';
import { useT } from '../i18n.js';
import { UiLang, Brand } from '../ui.js';

export function Sandbox({ code }) {
  const { t } = useT();
  const [view, setView] = useState('host');
  const base = location.pathname;
  return html`<main class="sandbox">
    <header class="sandbox-h">
      <${Brand} small />
      <nav class="tabs sb-tabs">
        <button class=${view === 'host' ? 'on' : ''} onClick=${() => setView('host')}>${t('sandbox_host')}</button>
        <button class=${view === 'player' ? 'on' : ''} onClick=${() => setView('player')}>${t('sandbox_player')}</button>
      </nav>
      <span class="grow"></span>
      <a class="btn ghost sm" href=${`${base}#/play/${code}/new`} target="_blank">${t('open_player_tab')} ↗</a>
      <${UiLang} />
    </header>
    <div class=${'sb-frames show-' + view}>
      <div class="sb-tv"><iframe src=${`${base}#/host/${code}`} title="host"></iframe></div>
      <div class="sb-phone"><div class="phone-shell"><iframe src=${`${base}#/play/${code}/new`} title="player"></iframe></div></div>
    </div>
  </main>`;
}

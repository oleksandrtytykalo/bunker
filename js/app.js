import { html, render, useState, useEffect } from './lib.js';
import { I18nProvider } from './i18n.js';
import { Home } from './screens/home.js';
import { Host } from './screens/host.js';
import { Player } from './screens/player.js';
import { Sandbox } from './screens/sandbox.js';

if (window.self !== window.top) document.documentElement.classList.add('embedded');

function parse() {
  const [, view = '', code = '', extra = ''] = (location.hash || '#/').split('/');
  return { view, code: code.toUpperCase(), fresh: extra === 'new' };
}

function Router() {
  const [r, setR] = useState(parse());
  useEffect(() => { const f = () => setR(parse()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  if (r.view === 'host' && r.code) return html`<${Host} code=${r.code} />`;
  if (r.view === 'play' && r.code) return html`<${Player} code=${r.code} fresh=${r.fresh} />`;
  if (r.view === 'sandbox' && r.code) return html`<${Sandbox} code=${r.code} />`;
  return html`<${Home} />`;
}

render(html`<${I18nProvider}><${Router} /><//>`, document.getElementById('app'));

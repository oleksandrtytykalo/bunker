import { html, useState } from '../lib.js';
import { useT } from '../i18n.js';
import { roomCode, uid } from '../engine.js';
import { transport, hostKey } from '../transport.js';
import { ADMIN_PASS_SHA256 } from '../config.js';
import { Brand, UiLang, ModeNote } from '../ui.js';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function Home() {
  const { t } = useT();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [pass, setPass] = useState('');
  const [passErr, setPassErr] = useState('');

  // create a room (retry on the rare code collision) and remember this device as its host
  const createRoom = async (opts = {}) => {
    const key = uid() + uid();
    for (let i = 0; i < 5; i++) {
      const c = roomCode();
      try { await transport.create(c, { ...opts, hostKey: key }); hostKey.set(c, key); return c; } catch (e) { console.warn(e); }
    }
    throw new Error('create failed');
  };
  const run = async (fn) => {
    if (busy) return;
    setBusy(true); setErr('');
    try { await fn(); } catch { setErr(t('create_fail')); } finally { setBusy(false); }
  };
  const host = () => run(async () => { location.hash = `#/host/${await createRoom()}`; });

  const adminHost = async (e) => {
    e.preventDefault();
    setPassErr('');
    if (!globalThis.crypto || !crypto.subtle) { setPassErr(t('no_crypto')); return; }
    if ((await sha256(pass)) !== ADMIN_PASS_SHA256) { setPassErr(t('admin_wrong')); return; }
    run(async () => { location.hash = `#/host/${await createRoom({ admin: true })}`; });
  };

  const join = async (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 4 || busy) return;
    setBusy(true);
    try {
      if (!(await transport.exists(c))) { setErr(t('no_room')); return; }
      location.hash = `#/play/${c}`;
    } catch { setErr(t('create_fail')); } finally { setBusy(false); }
  };

  return html`<main class=${'home' + (busy ? ' busy' : '')}>
    <div class="home-top"><${UiLang} /></div>
    <div class="home-hero">
      <div class="hazard"></div>
      <${Brand} />
      <p class="tagline">${t('tagline')}</p>
      <div class="hazard"></div>
    </div>

    <div class="home-grid">
      <button class="menu-card" onClick=${host}>
        <span class="mc-ico">📺</span>
        <span class="mc-t">${t('host_new')}</span>
        <span class="mc-d">${t('host_new_d')}</span>
      </button>

      <div class="menu-card admin-card" onClick=${() => !adminOpen && setAdminOpen(true)}>
        <span class="mc-ico">🛡</span>
        <span class="mc-t">${t('admin_host')}</span>
        <span class="mc-d">${t('admin_host_d')}</span>
        ${adminOpen && html`<form class="join-row" onSubmit=${adminHost}>
          <input class="input" type="password" autocomplete="current-password" placeholder=${t('admin_pass')} value=${pass}
            onInput=${(e) => { setPass(e.target.value); setPassErr(''); }} aria-label=${t('admin_pass')} autofocus />
          <button class="btn" type="submit">${t('enter')}</button>
        </form>`}
        ${passErr && html`<div class="err">${passErr}</div>`}
      </div>

      <form class="menu-card join" onSubmit=${join}>
        <span class="mc-ico">📟</span>
        <span class="mc-t">${t('join')}</span>
        <span class="mc-d">${t('join_d')}</span>
        <div class="join-row">
          <input class="input code-in" maxlength="4" placeholder="XXXX" value=${code}
            onInput=${(e) => { setCode(e.target.value.toUpperCase()); setErr(''); }} aria-label=${t('code')} />
          <button class="btn" type="submit">${t('enter')}</button>
        </div>
        ${err && html`<div class="err">${err}</div>`}
      </form>
    </div>

    <${ModeNote} />
  </main>`;
}

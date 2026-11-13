import { html, useState } from '../lib.js';
import { useT } from '../i18n.js';
import { roomCode } from '../engine.js';
import { transport } from '../transport.js';
import { Brand, UiLang, ModeNote } from '../ui.js';

export function Home() {
  const { t } = useT();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // retry on the (rare) room-code collision
  const createRoom = async () => {
    for (let i = 0; i < 5; i++) {
      const c = roomCode();
      try { await transport.create(c); return c; } catch (e) { console.warn(e); }
    }
    throw new Error('create failed');
  };
  const run = (fn) => async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try { await fn(); } catch { setErr(t('create_fail')); } finally { setBusy(false); }
  };
  const host = run(async () => { const c = await createRoom(); location.hash = `#/host/${c}`; });
  const demo = run(async () => {
    const c = await createRoom();
    await transport.dispatch(c, { type: 'addBots', n: 5 });
    location.hash = `#/sandbox/${c}`;
  });
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

      <button class="menu-card" onClick=${demo}>
        <span class="mc-ico">🧪</span>
        <span class="mc-t">${t('demo')}</span>
        <span class="mc-d">${t('demo_d')}</span>
      </button>
    </div>

    <${ModeNote} />
  </main>`;
}

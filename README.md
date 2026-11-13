# БУНКЕР / BUNKER

A party game for phones + TV. Post-apocalyptic field-PDA UI, bilingual (UA/EN), with traits drawn from modern Ukrainian life.

**Play:** https://oleksandrtytykalo.github.io/bunker/ — open on the TV, press "Host a game", players scan the QR.

## Run locally

```bash
python3 serve.py        # http://localhost:8080  ·  phones/TV: http://<your-mac-ip>:8080
```

No build step and nothing to install: Preact + htm and the fonts load from a CDN.

## Routes
- `#/` home: host, join, or demo
- `#/host/CODE` TV / host screen (lobby with QR → board → verdicts → final)
- `#/play/CODE` phone / player screen (join form → dossier, voting, action cards)
- `#/sandbox/CODE` demo: TV + phone side by side, bots fill the room

## Backend (Supabase)
- `supabase/schema.sql` — run once in the SQL editor: `rooms` table (state jsonb + version), RLS policies, realtime, hourly cleanup of rooms idle 2+ days.
- `js/config.js` — project URL + publishable key (public by design). Empty values → local same-device mode.
- `js/transport.js` — every device applies actions with the pure reducer (`js/engine.js`) and writes with optimistic concurrency (`update … where version = v`, retry on conflict); Realtime Postgres Changes push each new state to all screens.
- Known trade-off: the full state reaches every device, so a tech-savvy player could peek at hidden cards in devtools. Moving the reducer into an Edge Function and sending per-player views fixes that.

## Deploy
GitHub Pages serves `main` from the repo root. Push to `main` → live in ~1 min.

## Files
- `js/content.js` — all traits, catastrophes, bunker rooms, action cards (UA + EN, tags, 18+ flag)
- `js/engine.js` — rules: dealing, rounds, reveals, voting/revote/tie, actions, final verdict
- `js/i18n.js` — UI strings (each device picks its own UI language; the host picks the trait language)
- `js/ui.js`, `js/screens/*` — components
- `css/style.css` — the look

# БУНКЕР / BUNKER

A party game for phones + TV. Post-apocalyptic field-PDA UI, bilingual (UA/EN), with traits drawn from modern Ukrainian life.

## Run

```bash
python3 serve.py        # http://localhost:8080  ·  phones/TV: http://<your-mac-ip>:8080
```

No build step and nothing to install: Preact + htm and the fonts load from a CDN.

## Routes
- `#/` home: host, join, or demo
- `#/host/CODE` TV / host screen (lobby with QR → board → verdicts → final)
- `#/play/CODE` phone / player screen (join form → dossier, voting, action cards)
- `#/sandbox/CODE` demo: TV + phone side by side, bots fill the room

## Status: frontend only
`js/transport.js` is the only networking layer. Right now it keeps game state in `localStorage`
and syncs tabs on **the same device** with `BroadcastChannel`. For real phone ↔ TV play, replace
`LocalTransport` with a WebSocket client; the pure reducer in `js/engine.js` can move to the server unchanged.

## Files
- `js/content.js` — all traits, catastrophes, bunker rooms, action cards (UA + EN, tags, 18+ flag)
- `js/engine.js` — rules: dealing, rounds, reveals, voting/revote/tie, actions, final verdict
- `js/i18n.js` — UI strings (each device picks its own UI language; the host picks the trait language)
- `js/ui.js`, `js/screens/*` — components
- `css/style.css` — the look

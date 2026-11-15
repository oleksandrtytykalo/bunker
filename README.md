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
- `#/admin/CODE/KEY` admin panel on a phone
- `#/sandbox/CODE` dev view: TV + phone side by side

## Game flow
- **Round 1:** everyone reveals their profession, discusses, and votes. The top K go **on the block** (5 players → 2, 9 → 3, 15 → 4). Nobody leaves yet.
- **Round 2:** votes may only target players on the block. One player leaves.
- **Round 3+:** open voting. In games of 9+ players, the last ⌊exits/4⌋ rounds remove **two** players (10p: last round; 15p: last two).
- **Pace presets:** fast / slow / extra slow give 12 / 24 / 66 s of discussion per alive player, × a round factor (R1 0.8, R2 1.2, then −0.15 per round, minimum 0.5), rounded to 15 s. The estimate is Σ discussion × 1.5.
- **A player leaves mid-game:** the admin removes them and the bunker loses one seat, so the remaining schedule stays the same.

## Host controls
- The TV screen is display-first. ⚙ (admin panel) is in the top bar; Next sits bottom-left under the side column; **Space / →** = next.
- ⚙ opens the **admin panel**: pace, languages, timer ±30 s / end discussion, tie-breaks, remove player, restart. Lobby settings (bots, trait language, 18+) are on the lobby screen itself.
- Only the device that created the room can control it: it keeps a random key in localStorage, and the room stores only a hash of it. Phone remote control was removed. (Writes are still open to anyone with the public key; real protection needs server-side rules.)
- Traits revealed in the current round glow green; tied players pulse amber; phones get a short popup at the start of each round.
- **Admin host** (home screen) is password-gated for upcoming experimental features. The password is in `.admin-pass` (not committed); `js/config.js` holds only its SHA-256.

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

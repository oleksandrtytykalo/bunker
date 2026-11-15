// ─────────────────────────────────────────────────────────────
//  BUNKER — game engine. Pure reducer: (state, action) → state.
//  Runs on every device today; can move to a server unchanged.
//
//  Flow (accelerating):
//    round 1  — reveal profession, discuss, vote: top K go ON THE BLOCK
//               (nobody leaves yet; K = 2 for 5p, 3 for 9p, 4 for 15p)
//    round 2  — votes may only target players on the block → 1 leaves
//    round 3+ — open voting; the last rounds of big games remove 2
// ─────────────────────────────────────────────────────────────
import { CATS, TRAITS, CATASTROPHES, ROOMS, ACTIONS, BOT_NAMES, AVATARS, byId } from './content.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 16;
const ACTIONS_PER_PLAYER = 2;
const ROOMS_PER_BUNKER = 3;

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const between = (a, b) => a + rnd(b - a + 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const uid = () => Math.random().toString(36).slice(2, 10);
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function roomCode() {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  return Array.from({ length: 4 }, () => L[rnd(L.length)]).join('');
}

// ── pacing maths ─────────────────────────────────────────────
export const seatsFor = (n) => Math.max(1, Math.floor(n / 2));
/** players put on the block after round 1: 5→2, 9→3, 15→4 */
export const blockSize = (n) => clamp(Math.floor((n + 3) / 4), 1, Math.min(4, Math.max(1, n - 1)));
/** exiles per round, indexed by round number. [0]=unused, [1]=0 (block round).
 *  Total exits E = n − seats; in big games (9+) the last floor(E/4) rounds remove two players. */
export function exileSchedule(n, seats = seatsFor(n)) {
  const E = Math.max(0, n - seats);
  const doubles = n >= 9 ? Math.floor(E / 4) : 0;
  return [0, 0, ...Array(E - 2 * doubles).fill(1), ...Array(doubles).fill(2)];
}

/** seconds of discussion per alive player, by game speed */
export const SPEEDS = { fast: 10, slow: 15, xslow: 22 };
/** round 1 medium, round 2 longest, then each round shorter */
const roundFactor = (r) => (r <= 1 ? 0.8 : r === 2 ? 1.2 : Math.max(0.5, 1.2 - 0.15 * (r - 2)));
export function discussionSec(speed, round, aliveCount) {
  const raw = aliveCount * (SPEEDS[speed] || SPEEDS.slow) * roundFactor(round);
  return clamp(Math.round(raw / 15) * 15, 45, 480);
}
/** estimate = Σ discussion × 1.5 (reveals + voting) */
export function estimate(speed, n) {
  n = Math.max(n, MIN_PLAYERS);
  const sched = exileSchedule(n);
  let alive = n, total = 0;
  for (let r = 1; r < sched.length; r++) { total += discussionSec(speed, r, alive); alive -= sched[r]; }
  return { minutes: Math.max(1, Math.round((total * 1.5) / 60)), rounds: sched.length - 1 };
}

export function newGame(code, opts = {}) {
  return {
    code, version: 0, createdAt: Date.now(),
    admin: !!opts.admin, hostKey: opts.hostKey || uid() + uid(),
    phase: 'lobby', round: 0,
    traitLang: 'uk', mature: false, speed: 'slow',
    catastrophe: null, bunker: null, seats: 0, schedule: [],
    players: [], board: [],
    votes: {}, candidates: [], k: 0, revote: 0, tie: [], slots: 0, out: [], outKind: null,
    revealed: [], lastTally: null, timerEnd: null,
    log: [],
  };
}

// ── dealing ──────────────────────────────────────────────────
function pool(cat, mature) { return TRAITS[cat].filter((x) => mature || !x.m); }

function dealBiology() {
  const sex = Math.random() < 0.5 ? 'm' : 'f';
  const age = Math.random() < 0.15 ? between(61, 84) : between(18, 60);
  let x;
  if (Math.random() < 0.4) {
    const notes = TRAITS.biology.filter((n) => n.id !== 'pregnant' || (sex === 'f' && age <= 42));
    x = pick(notes).id;
  }
  return { id: sex, n: age, x, revealed: false };
}

function dealAll(s) {
  const decks = {};
  for (const c of CATS) if (c !== 'biology') decks[c] = shuffle(pool(c, s.mature));
  const actionDeck = shuffle(ACTIONS.map((a) => a.id));
  let ai = 0;
  s.players.forEach((p, i) => {
    p.cards = {};
    for (const c of CATS) {
      if (c === 'biology') { p.cards.biology = dealBiology(); continue; }
      const deck = decks[c];
      p.cards[c] = { id: deck[i % deck.length].id, revealed: false };
    }
    p.actions = Array.from({ length: ACTIONS_PER_PLAYER }, () => ({ id: actionDeck[ai++ % actionDeck.length], used: false }));
    p.alive = true; p.left = false; p.exiledRound = null; p.immuneRound = null; p.doubleRound = null;
  });
  const cat = pick(CATASTROPHES);
  s.catastrophe = { id: cat.id, months: between(cat.months[0], cat.months[1]) };
  s.bunker = {
    area: between(4, 20) * 10,
    food: between(3, Math.max(6, s.catastrophe.months + 6)),
    rooms: shuffle(ROOMS).slice(0, ROOMS_PER_BUNKER).map((r) => ({ id: r.id, revealed: false })),
  };
  s.seats = seatsFor(s.players.length);
  s.schedule = exileSchedule(s.players.length, s.seats);
  s.board = [];
}

// ── helpers ──────────────────────────────────────────────────
export const alive = (s) => s.players.filter((p) => p.alive);
export const findP = (s, id) => s.players.find((p) => p.id === id);
export const totalRounds = (s) => Math.max(s.round, (s.schedule || []).length - 1);
const log = (s, k, p = {}) => { s.log.push({ t: Date.now(), k, p }); if (s.log.length > 60) s.log.shift(); };
const hiddenCats = (p) => CATS.filter((c) => p.cards[c] && !p.cards[c].revealed);

export function canReveal(s, p, cat) {
  if (s.phase !== 'reveal' || !p.alive || s.revealed.includes(p.id)) return false;
  const card = p.cards[cat];
  if (!card || card.revealed) return false;
  if (s.round === 1 && cat !== 'profession') return false;
  return true;
}

function autoReveal(s) {
  for (const p of alive(s)) {
    if (s.revealed.includes(p.id)) continue;
    const opts = (s.round === 1 ? ['profession'] : hiddenCats(p)).filter((c) => !p.cards[c].revealed);
    if (opts.length) { const c = pick(opts); p.cards[c].revealed = true; log(s, 'reveal', { a: p.id, cat: c }); }
    s.revealed.push(p.id);
  }
}

function clearVote(s) {
  s.votes = {}; s.candidates = []; s.k = 0; s.revote = 0;
  s.tie = []; s.slots = 0; s.out = []; s.outKind = null; s.lastTally = null;
}

function beginRound(s) {
  s.round += 1;
  s.phase = 'reveal';
  s.revealed = []; s.timerEnd = null;
  clearVote(s);
  const room = s.bunker.rooms.find((r) => !r.revealed);
  if (room) { room.revealed = true; log(s, 'room', { room: room.id }); }
  log(s, 'round', { n: s.round });
}

/** how many players this round's vote removes (or puts on the block in round 1) */
export function votesNeeded(s) {
  const n = alive(s).length;
  if (s.round === 1) return Math.min(blockSize(n), Math.max(1, n - 1));
  return clamp(s.schedule[s.round] ?? 1, 1, Math.max(1, n - s.seats));
}

function startVoting(s) {
  clearVote(s);
  s.phase = 'voting'; s.timerEnd = null;
  const ids = alive(s).map((p) => p.id);
  const onBlock = s.board.filter((id) => ids.includes(id));
  s.candidates = s.round === 2 && onBlock.length ? onBlock : ids;
  s.k = votesNeeded(s);
}

function exile(s, id) {
  const p = findP(s, id);
  if (!p || !p.alive) return;
  p.alive = false; p.exiledRound = s.round;
  for (const c of CATS) p.cards[c].revealed = true;
  s.out.push(id);
  log(s, 'exiled', { a: id });
}

function tally(s) {
  const t = Object.fromEntries(s.candidates.map((id) => [id, 0]));
  for (const [voter, target] of Object.entries(s.votes)) {
    const v = findP(s, voter), tg = findP(s, target);
    if (!v || !v.alive || !tg || !(target in t)) continue;
    if (tg.immuneRound === s.round) continue;
    t[target] += v.doubleRound === s.round ? 2 : 1;
  }
  return t;
}

function closeVoting(s) {
  const t = tally(s);
  s.lastTally = t;
  const block = s.round === 1;
  const need = s.k - s.out.length;
  const ranked = [...s.candidates].sort((a, b) => t[b] - t[a]);
  let take = [], tied = [];
  if (ranked.length <= need) take = ranked;
  else {
    const cut = t[ranked[need - 1]];
    const above = ranked.filter((id) => t[id] > cut);
    const at = ranked.filter((id) => t[id] === cut);
    if (cut > 0 && above.length + at.length === need) take = ranked.slice(0, need);
    else if (block) take = [...above, ...shuffle(at).slice(0, need - above.length)]; // round 1: random tiebreak
    else { take = above; tied = at; }
  }

  if (block) {
    s.board = take; s.out = [...take]; s.outKind = 'board';
    s.phase = 'results';
    log(s, 'board', { ids: take });
    return;
  }
  s.outKind = 'exile';
  take.forEach((id) => exile(s, id));
  const left = s.k - s.out.length;
  if (left <= 0) { s.phase = 'results'; return; }
  if (s.revote === 0) {
    s.revote = 1; s.candidates = tied; s.votes = {};
    log(s, 'revote', {});
    return; // stays in voting
  }
  s.tie = tied; s.slots = left; s.phase = 'results';
  log(s, 'tie', {});
}

function goFinal(s) {
  s.phase = 'final'; s.timerEnd = null;
  for (const p of alive(s)) for (const c of CATS) p.cards[c].revealed = true;
  for (const r of s.bunker.rooms) r.revealed = true;
  log(s, 'final', {});
}

function applyAction(s, p, idx, targetId) {
  const card = p.actions[idx];
  if (!card || card.used || !p.alive) return false;
  if (!['reveal', 'discussion', 'voting'].includes(s.phase)) return false;
  const def = byId(ACTIONS, card.id);
  const tg = targetId ? findP(s, targetId) : null;
  if (def.target && (!tg || !tg.alive || tg.id === p.id)) return false;
  const swap = (cat) => { const a = p.cards[cat], b = tg.cards[cat]; [a.id, b.id] = [b.id, a.id]; };
  switch (card.id) {
    case 'swap_health': swap('health'); break;
    case 'swap_baggage': swap('baggage'); break;
    case 'reroll_prof': {
      const taken = new Set(s.players.map((x) => x.cards.profession.id));
      const opts = pool('profession', s.mature).filter((x) => !taken.has(x.id));
      tg.cards.profession.id = (opts.length ? pick(opts) : pick(pool('profession', s.mature))).id;
      break;
    }
    case 'expose': {
      const h = hiddenCats(tg);
      if (!h.length) return false;
      const c = pick(h); tg.cards[c].revealed = true;
      log(s, 'reveal', { a: tg.id, cat: c });
      break;
    }
    case 'heal': tg.cards.health.id = 'healthy'; break;
    case 'double_vote': p.doubleRound = s.round; break;
    case 'immunity': p.immuneRound = s.round; break;
    case 'therapy': p.cards.phobia.id = 'none'; break;
    default: return false;
  }
  card.used = true;
  log(s, 'action', { a: p.id, b: tg ? tg.id : '', act: card.id });
  return true;
}

/** a player left mid-game: drop them and take one seat away so the pace stays the same */
function removePlayer(s, id) {
  const p = findP(s, id);
  if (!p) return false;
  if (s.phase === 'lobby') { s.players = s.players.filter((x) => x.id !== id); return true; }
  if (p.left) return false;
  const wasAlive = p.alive;
  p.left = true; p.alive = false;
  if (wasAlive && s.phase !== 'final') s.seats = Math.max(1, s.seats - 1);
  const strip = (arr) => arr.filter((x) => x !== id);
  s.candidates = strip(s.candidates); s.board = strip(s.board); s.tie = strip(s.tie);
  delete s.votes[id];
  for (const [v, tg] of Object.entries(s.votes)) if (tg === id) delete s.votes[v];
  if (s.phase === 'results' && s.tie.length && s.tie.length <= s.slots) {
    [...s.tie].forEach((x) => exile(s, x)); s.tie = []; s.slots = 0;
  }
  log(s, 'left', { a: id, n: s.seats });
  return true;
}

// ── reducer ──────────────────────────────────────────────────
export function reduce(state, a) {
  const s = structuredClone(state);
  const ok = step(s, a);
  if (!ok) return state;
  s.version += 1;
  return s;
}

function step(s, a) {
  switch (a.type) {
    case 'join': {
      if (s.phase !== 'lobby' || s.players.length >= MAX_PLAYERS) return false;
      if (findP(s, a.player.id)) { Object.assign(findP(s, a.player.id), a.player); return true; }
      s.players.push({ id: a.player.id, name: a.player.name.slice(0, 18), avatar: a.player.avatar, bot: !!a.player.bot, cards: {}, actions: [], alive: true });
      log(s, 'join', { a: a.player.id });
      return true;
    }
    case 'addBots': {
      if (s.phase !== 'lobby') return false;
      const used = new Set(s.players.map((p) => p.name));
      const names = shuffle(BOT_NAMES).filter((n) => !used.has(n));
      let added = 0;
      for (let i = 0; i < a.n && s.players.length < MAX_PLAYERS && names.length; i++, added++) {
        s.players.push({ id: 'bot_' + uid(), name: names.pop(), avatar: pick(AVATARS), bot: true, cards: {}, actions: [], alive: true });
      }
      return added > 0;
    }
    case 'kick':
    case 'remove': return removePlayer(s, a.id);
    case 'settings': {
      if ('traitLang' in a) s.traitLang = a.traitLang;
      if ('speed' in a && SPEEDS[a.speed]) s.speed = a.speed;
      if ('mature' in a && s.phase === 'lobby') s.mature = a.mature;
      return true;
    }
    case 'start': {
      if (s.phase !== 'lobby' || s.players.length < MIN_PLAYERS) return false;
      dealAll(s);
      s.phase = 'briefing'; s.round = 0; s.log = [];
      clearVote(s);
      log(s, 'start', {});
      return true;
    }
    case 'reveal': {
      const p = findP(s, a.id);
      if (!p || !canReveal(s, p, a.cat)) return false;
      p.cards[a.cat].revealed = true;
      s.revealed.push(p.id);
      log(s, 'reveal', { a: p.id, cat: a.cat });
      return true;
    }
    case 'useAction': {
      const p = findP(s, a.id);
      return !!p && applyAction(s, p, a.idx, a.target);
    }
    case 'vote': {
      const p = findP(s, a.id);
      if (s.phase !== 'voting' || !p || !p.alive || a.target === p.id || !s.candidates.includes(a.target)) return false;
      s.votes[p.id] = a.target;
      return true;
    }
    case 'next': return next(s);
    case 'hostExile': {
      if (s.phase !== 'results' || !s.tie.includes(a.id)) return false;
      exile(s, a.id);
      s.tie = s.tie.filter((x) => x !== a.id);
      s.slots -= 1;
      if (s.slots <= 0) { s.tie = []; s.slots = 0; }
      return true;
    }
    case 'extendTimer': {
      if (s.phase !== 'discussion') return false;
      const now = Date.now();
      s.timerEnd = Math.max(now, Math.max(now, s.timerEnd || now) + a.sec * 1000);
      return true;
    }
    case 'reset': {
      const keep = s.players.filter((p) => !p.left)
        .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, bot: p.bot, cards: {}, actions: [], alive: true }));
      Object.assign(s, newGame(s.code, { admin: s.admin, hostKey: s.hostKey }), {
        players: keep, traitLang: s.traitLang, mature: s.mature, speed: s.speed, version: s.version,
      });
      return true;
    }
    default: return false;
  }
}

// host's big "next" button
function next(s) {
  const inGame = ['reveal', 'discussion', 'voting', 'results'].includes(s.phase);
  if (inGame && alive(s).length <= s.seats && !s.tie.length) { goFinal(s); return true; }
  switch (s.phase) {
    case 'briefing': beginRound(s); return true;
    case 'reveal':
      autoReveal(s);
      s.phase = 'discussion';
      s.timerEnd = Date.now() + discussionSec(s.speed, s.round, alive(s).length) * 1000;
      return true;
    case 'discussion': startVoting(s); return true;
    case 'voting': closeVoting(s); return true;
    case 'results':
      if (s.tie.length) return false; // host must pick
      beginRound(s);
      return true;
    default: return false;
  }
}

// ── card text ────────────────────────────────────────────────
function years(n, lang) {
  if (lang === 'en') return `${n} y.o.`;
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'рік' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'роки' : 'років';
  return `${n} ${w}`;
}

export function cardText(cat, card, lang) {
  if (!card) return '';
  if (cat === 'biology') {
    const sex = lang === 'uk' ? (card.id === 'f' ? 'Жінка' : 'Чоловік') : (card.id === 'f' ? 'Female' : 'Male');
    const note = card.x ? byId(TRAITS.biology, card.x) : null;
    return `${sex}, ${years(card.n, lang)}${note ? ' · ' + note[lang] : ''}`;
  }
  const entry = byId(TRAITS[cat], card.id);
  return entry ? entry[lang] : card.id;
}

export const catastropheOf = (s) => s.catastrophe && byId(CATASTROPHES, s.catastrophe.id);
export const roomOf = (id) => byId(ROOMS, id);
export const actionOf = (id) => byId(ACTIONS, id);

// ── final verdict ────────────────────────────────────────────
function tagsOf(p) {
  const out = [];
  for (const c of CATS) {
    const card = p.cards[c];
    if (c === 'biology') { const n = card.x && byId(TRAITS.biology, card.x); if (n) out.push(...n.tags); continue; }
    const en = byId(TRAITS[c], card.id); if (en) out.push(...en.tags);
  }
  return out;
}

function fertile(p) {
  const b = p.cards.biology, tags = tagsOf(p);
  if (tags.includes('infertile')) return false;
  if (b.x === 'pregnant') return true;
  return b.id === 'f' ? b.n >= 18 && b.n <= 45 : b.n >= 18 && b.n <= 60;
}

export function evaluate(s) {
  const surv = alive(s);
  const tags = surv.flatMap(tagsOf);
  const roomTags = s.bunker.rooms.flatMap((r) => roomOf(r.id).tags);
  const all = [...tags, ...roomTags];
  const count = (t) => all.filter((x) => x === t).length;
  const cat = catastropheOf(s);
  const checks = [];

  const pregnant = surv.some((p) => p.cards.biology.x === 'pregnant');
  const f = surv.some((p) => p.cards.biology.id === 'f' && fertile(p));
  const m = surv.some((p) => p.cards.biology.id === 'm' && fertile(p));
  checks.push({ k: 'repro', ok: (f && m) || pregnant });

  const foodOk = s.bunker.food >= s.catastrophe.months || count('food') >= 2 || (count('food') >= 1 && s.bunker.food * 2 >= s.catastrophe.months);
  checks.push({ k: 'food', ok: foodOk });

  for (const need of cat.needs) if (need !== 'food') checks.push({ k: 'need_' + need, ok: count(need) > 0 });

  checks.push({ k: 'health', ok: tags.filter((t) => t === 'weak').length <= Math.floor(surv.length / 2) });
  checks.push({ k: 'peace', ok: count('danger') === 0 });
  checks.push({ k: 'morale', ok: count('morale') > 0 });

  const score = checks.filter((c) => c.ok).length / checks.length;
  const verdict = score >= 0.85 ? 'thrive' : score >= 0.6 ? 'survive' : score >= 0.35 ? 'struggle' : 'extinct';
  return { checks, score, verdict };
}

// UNO room server.
//
// Serves the static client AND the WebSocket on one port, so the link a host
// shares is the same origin the game loads from. The authoritative game runs
// here (reusing the browser engine in js/uno.js unchanged), and each client
// only ever receives its own hand — opponents' cards are sent as opaque ids.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { Game, botChoose, bestColor, isWildValue, face } from '../js/uno.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8090;

/**
 * Best LAN address for this machine, so the host can copy a link that actually
 * works for friends on the same wifi ("localhost" only works on this device).
 */
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return 'localhost';
}
const LAN = lanAddress();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// ── static files ──────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  const full = path.join(ROOT, rel);
  // never serve outside the project, and keep node_modules/server private
  if (!full.startsWith(ROOT) || rel.startsWith('/server') ||
      (rel.startsWith('/node_modules') && !rel.startsWith('/node_modules/'))) {
    res.writeHead(403).end('forbidden'); return;
  }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
});

// ── rooms ─────────────────────────────────────────────────────────────
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I/O/0/1
const rooms = new Map();
const MAX_SEATS = 4;

function newCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

function lobbyState(room) {
  return {
    t: 'lobby',
    code: room.code,
    shareBase: `http://${LAN}:${PORT}`,
    lanHost: LAN,
    variant: room.variant,
    started: room.started,
    seats: room.seats.map(s => ({ name: s.name, bot: s.bot, connected: !!(s.ws && s.ws.readyState === 1) })),
  };
}

function broadcastLobby(room) {
  for (const s of room.seats) if (s.ws) send(s.ws, { ...lobbyState(room), you: s.seat, isHost: s.seat === room.hostSeat });
}

/** Per-seat view: your own hand in full, everyone else's as opaque ids. */
function snapshotFor(room, seat) {
  const g = room.game;
  return {
    you: seat,
    numPlayers: g.numPlayers,
    current: g.current,
    dir: g.dir,
    side: g.side,
    variant: g.variant,
    activeColor: g.activeColor,
    winner: g.winner,
    eliminated: [...g.eliminated],
    log: g.log.slice(),
    top: g.top,
    names: room.seats.map(s => s.name),
    bots: room.seats.map(s => s.bot),
    deckCount: g.deck.length,
    hands: g.hands.map((h, p) => (p === seat ? h : h.map(c => ({ id: c.id, hidden: true })))),
  };
}

function pushState(room, type, effect = null) {
  for (const s of room.seats) {
    if (!s.ws) continue;
    send(s.ws, { t: type, effect, snapshot: snapshotFor(room, s.seat) });
  }
}

function seatIsBot(room, i) {
  const s = room.seats[i];
  return s.bot || !s.ws || s.ws.readyState !== 1;
}

/** Run a bot turn, then keep going while the next seat is also a bot. */
function scheduleBots(room) {
  clearTimeout(room.botTimer);
  const g = room.game;
  if (!g || g.winner != null) return;
  if (!seatIsBot(room, g.current)) return;
  room.botTimer = setTimeout(() => {
    if (!room.game || room.game.winner != null) return;
    const choice = botChoose(g);
    let effect = null;
    if (choice.action === 'draw') {
      const r = g.drawTurn();
      if (r.playable) {
        const wild = isWildValue(g.faceOf(r.drew).value);
        effect = g.playCard(r.drew.id, wild ? bestColor(g, g.hands[g.current]) : null);
      }
      pushState(room, effect ? 'moved' : 'drew', effect);
    } else {
      effect = g.playCard(choice.cardId, choice.color);
      pushState(room, 'moved', effect);
    }
    if (g.winner != null) { pushState(room, 'ended'); return; }
    scheduleBots(room);
  }, 950);
}

function startGame(room) {
  // any unclaimed seat becomes a bot
  for (let i = room.seats.length; i < room.desiredSeats; i++) {
    room.seats.push({ seat: i, name: `Bot ${i}`, bot: true, ws: null });
  }
  room.started = true;
  room.game = new Game(room.seats.length, 'online', room.variant);
  // the engine's default naming is for local play ("You" / "Bot 1"); in a room
  // the log is shared, so every line must name the actual player
  room.game.playerName = i => (room.seats[i] ? room.seats[i].name : `Player ${i + 1}`);
  pushState(room, 'started');
  scheduleBots(room);
}

// ── socket handling ───────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  let room = null, seat = -1;

  const fail = msg => send(ws, { t: 'error', msg });

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'create') {
      const code = newCode();
      room = {
        code, hostSeat: 0, variant: m.variant || 'classic',
        desiredSeats: Math.min(MAX_SEATS, Math.max(2, m.seats || 4)),
        seats: [], started: false, game: null, botTimer: null,
      };
      rooms.set(code, room);
      seat = 0;
      room.seats.push({ seat: 0, name: (m.name || 'Host').slice(0, 14), bot: false, ws });
      broadcastLobby(room);
      return;
    }

    if (m.t === 'join') {
      const r = rooms.get(String(m.code || '').toUpperCase().trim());
      if (!r) return fail('Room not found');
      if (r.started) {
        // let a returning player reclaim a seat whose human dropped
        const open = r.seats.find(s => s.bot === false && (!s.ws || s.ws.readyState !== 1));
        if (!open) return fail('That game already started');
        open.ws = ws; room = r; seat = open.seat;
        send(ws, { ...lobbyState(room), you: seat, isHost: seat === room.hostSeat });
        send(ws, { t: 'started', effect: null, snapshot: snapshotFor(room, seat) });
        broadcastLobby(room);
        return;
      }
      if (r.seats.length >= r.desiredSeats) return fail('Room is full');
      room = r; seat = r.seats.length;
      r.seats.push({ seat, name: (m.name || `Player ${seat + 1}`).slice(0, 14), bot: false, ws });
      broadcastLobby(room);
      return;
    }

    if (!room) return fail('Not in a room');

    if (m.t === 'variant' && seat === room.hostSeat && !room.started) {
      room.variant = m.variant; broadcastLobby(room); return;
    }
    if (m.t === 'seats' && seat === room.hostSeat && !room.started) {
      room.desiredSeats = Math.min(MAX_SEATS, Math.max(2, m.seats));
      if (room.seats.length > room.desiredSeats) room.desiredSeats = room.seats.length;
      broadcastLobby(room); return;
    }
    if (m.t === 'start') {
      if (seat !== room.hostSeat) return fail('Only the host can start');
      if (room.started) return;
      startGame(room); return;
    }

    // ── in-game intents ──
    const g = room.game;
    if (!g || g.winner != null) return;
    if (g.current !== seat) return fail('Not your turn');

    if (m.t === 'play') {
      const effect = g.playCard(m.cardId, m.color);
      if (!effect) return fail('Illegal card');
      pushState(room, 'moved', effect);
      if (g.winner != null) { pushState(room, 'ended'); return; }
      scheduleBots(room);
      return;
    }
    if (m.t === 'draw') {
      const r = g.drawTurn();
      pushState(room, 'drew', { drawnId: r.drew ? r.drew.id : null, playable: !!r.playable });
      if (!r.playable) scheduleBots(room);
      return;
    }
    if (m.t === 'pass') {
      g.passTurn();
      pushState(room, 'passed');
      scheduleBots(room);
      return;
    }
  });

  ws.on('close', () => {
    if (!room || seat < 0) return;
    const s = room.seats[seat];
    if (s) s.ws = null;
    if (!room.started) {
      // drop them from the lobby and renumber
      room.seats = room.seats.filter(x => x.seat !== seat);
      room.seats.forEach((x, i) => { x.seat = i; });
      if (!room.seats.length) { clearTimeout(room.botTimer); rooms.delete(room.code); return; }
      room.hostSeat = 0;
      broadcastLobby(room);
    } else {
      // mid-game: a bot takes over so the round can finish
      if (s) { s.bot = true; s.name = `${s.name} (bot)`; }
      if (room.game) { room.game.addLog(`${s ? s.name : 'A player'} left — bot took over`); pushState(room, 'moved', null); }
      if (room.seats.every(x => !x.ws)) { clearTimeout(room.botTimer); rooms.delete(room.code); return; }
      scheduleBots(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`UNO server ready`);
  console.log(`  this machine : http://localhost:${PORT}/game.html`);
  console.log(`  same wifi    : http://${LAN}:${PORT}/game.html`);
  console.log('Create a room in-game and share the link it shows.');
});

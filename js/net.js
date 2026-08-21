// Thin WebSocket wrapper. Emits named events; callers subscribe with on().

const listeners = new Map();
let ws = null;

export const on = (type, fn) => {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(fn);
};
const emit = (type, payload) => (listeners.get(type) || []).forEach(fn => fn(payload));

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const DEFAULT_PORT = '8090';
const onLocalhost = () => LOCAL_HOSTS.includes(location.hostname);

export let serverHost = null;

/**
 * Where to look for the room server, in order.
 * Normally it is the page's own origin (npm start serves the client too), but
 * during development the page is often opened from another local server — an
 * IDE preview, a python http.server — in which case fall back to the default
 * port so it still connects instead of failing mysteriously.
 */
function candidates() {
  const out = [];
  const override = new URLSearchParams(location.search).get('server');
  if (override) out.push(override);
  if (location.host) out.push(location.host);
  if (onLocalhost() && location.port !== DEFAULT_PORT) out.push(`${location.hostname}:${DEFAULT_PORT}`);
  return [...new Set(out)];
}

function describeFailure(tried) {
  if (!onLocalhost()) {
    return 'This site has no room server — multiplayer needs a Node/WebSocket host ' +
           '(Render, Railway, Fly). Locally, run: npm start';
  }
  if (location.port !== DEFAULT_PORT) {
    return `No room server on ${tried.join(' or ')}. Open the game from ` +
           `http://localhost:${DEFAULT_PORT}/game.html — that is where "npm start" serves it.`;
  }
  return 'Room server is not running — start it with: npm start';
}

function wire(sock) {
  sock.addEventListener('close', () => emit('close'));
  sock.addEventListener('message', e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    emit(m.t, m);
  });
}

export function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return Promise.resolve();
  const tried = candidates();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= tried.length) { reject(new Error(describeFailure(tried))); return; }
      const host = tried[i++];
      const sock = new WebSocket(`${proto}//${host}`);
      let settled = false;
      const giveUp = () => { if (settled) return; settled = true; try { sock.close(); } catch {} tryNext(); };
      const timer = setTimeout(giveUp, 2500);
      sock.addEventListener('open', () => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        ws = sock; serverHost = host; wire(sock); emit('open'); resolve();
      });
      sock.addEventListener('error', () => { clearTimeout(timer); giveUp(); });
      sock.addEventListener('close', () => { clearTimeout(timer); giveUp(); });
    };
    tryNext();
  });
}

export const isConnected = () => !!ws && ws.readyState === 1;
export function send(msg) { if (isConnected()) ws.send(JSON.stringify(msg)); }
export function close() { if (ws) { ws.close(); ws = null; } }

export const createRoom = (name, variant, seats) => send({ t: 'create', name, variant, seats });
export const joinRoom   = (code, name)           => send({ t: 'join', code, name });
export const setVariant = variant                => send({ t: 'variant', variant });
export const setSeats   = seats                  => send({ t: 'seats', seats });
export const startRoom  = ()                     => send({ t: 'start' });
export const playCard   = (cardId, color)        => send({ t: 'play', cardId, color });
export const drawCard   = ()                     => send({ t: 'draw' });
export const passTurn   = ()                     => send({ t: 'pass' });

/**
 * Cheap availability check for the menu: open a socket, note whether it
 * connected, close it again. Used to show "Play with Friends" as unavailable on
 * hosts that cannot run the room server (e.g. Vercel) instead of letting the
 * button fail only after a click.
 */
export function probe(timeoutMs = 2500) {
  const tried = candidates();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new Promise(resolve => {
    let i = 0;
    const tryNext = () => {
      if (i >= tried.length) { resolve(false); return; }
      const sock = new WebSocket(`${proto}//${tried[i++]}`);
      let settled = false;
      const finish = ok => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        try { sock.close(); } catch {}
        ok ? resolve(true) : tryNext();
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      sock.addEventListener('open', () => finish(true));
      sock.addEventListener('error', () => finish(false));
      sock.addEventListener('close', () => finish(false));
    };
    tryNext();
  });
}

// Thin WebSocket wrapper. Emits named events; callers subscribe with on().

const listeners = new Map();
let ws = null;

export const on = (type, fn) => {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(fn);
};
const emit = (type, payload) => (listeners.get(type) || []).forEach(fn => fn(payload));

export function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return Promise.resolve();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => { emit('open'); resolve(); });
    ws.addEventListener('error', () => reject(new Error('Could not reach the room server')));
    ws.addEventListener('close', () => emit('close'));
    ws.addEventListener('message', e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      emit(m.t, m);
    });
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

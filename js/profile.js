// Wallet, inventory and shop catalogue. Persisted in localStorage so a demo
// survives refreshes.

const KEY = 'uno.profile.v1';

export const COIN_BUNDLES = [
  { id: 'b1', coins: 500,   price: '$0.99'  },
  { id: 'b2', coins: 1500,  price: '$2.49', tag: 'Popular' },
  { id: 'b3', coins: 5000,  price: '$6.99', tag: 'Best value' },
  { id: 'b4', coins: 15000, price: '$14.99' },
];

// ── card back skins ───────────────────────────────────────────────────
export const SKINS = [
  { id: 'classic', name: 'Classic',  price: 0,    desc: 'The original black back.' },
  { id: 'carbon',  name: 'Carbon',   price: 800,  desc: 'Woven carbon-fibre weave.' },
  { id: 'neon',    name: 'Neon Grid',price: 1400, desc: 'Glowing synthwave grid.' },
  { id: 'gold',    name: 'Gold Leaf',price: 2600, desc: 'Brushed gold foil.' },
];

// ── table themes (felt / rail / trim — seat neon stays fixed so seats
//    remain readable) ─────────────────────────────────────────────────
export const THEMES = [
  { id: 'midnight', name: 'Midnight', price: 0,
    felt: '#111116', rail: 0x4a4a55, frame: 0x3c3c45, wood: 0x5c3418, bezel: 0x15151a },
  { id: 'emerald',  name: 'Emerald Club', price: 900,
    felt: '#0b1a12', rail: 0x33564a, frame: 0x24382f, wood: 0x46301a, bezel: 0x0f1d16 },
  { id: 'crimson',  name: 'Crimson Room', price: 1600,
    felt: '#190c0c', rail: 0x59383a, frame: 0x3d2628, wood: 0x50301c, bezel: 0x1d1012 },
  { id: 'royal',    name: 'Royal Violet', price: 2400,
    felt: '#0f0c1e', rail: 0x413c78, frame: 0x2b2851, wood: 0x453055, bezel: 0x141031 },
];

// ── avatars shown on the seat labels ──────────────────────────────────
export const AVATARS = [
  { id: 'none',   name: 'None',    price: 0,    glyph: '' },
  { id: 'fox',    name: 'Fox',     price: 400,  glyph: '🦊' },
  { id: 'robot',  name: 'Robot',   price: 400,  glyph: '🤖' },
  { id: 'crown',  name: 'Royalty', price: 1100, glyph: '👑' },
  { id: 'dragon', name: 'Dragon',  price: 2000, glyph: '🐉' },
];

// ── unlockable game modes ─────────────────────────────────────────────
export const MODES = [
  { id: 'classic', name: 'Classic UNO', price: 0,
    desc: 'The game you know. 108 cards.' },
  { id: 'flip', name: 'UNO Flip', price: 3000,
    desc: 'Double-sided deck. Flip cards swap the whole table to the brutal dark side.' },
  { id: 'nomercy', name: 'UNO No Mercy', price: 5000,
    desc: 'Draw 6, Draw 10, Skip Everyone, Discard All — and you are out at 25 cards.' },
];

const DEFAULT_PROFILE = {
  coins: 750,                 // enough to feel the store immediately
  skins: ['classic'],
  themes: ['midnight'],
  avatars: ['none'],
  modes: ['classic'],
  activeSkin: 'classic',
  activeTheme: 'midnight',
  activeAvatar: 'none',
  stats: { played: 0, won: 0, earned: 0 },
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const p = JSON.parse(raw);
    // merge so older saves pick up new fields instead of breaking
    return {
      ...DEFAULT_PROFILE, ...p,
      stats: { ...DEFAULT_PROFILE.stats, ...(p.stats || {}) },
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
  return p;
}

export const catalogFor = kind =>
  kind === 'skin' ? SKINS : kind === 'theme' ? THEMES : kind === 'avatar' ? AVATARS : MODES;

const ownedKey = kind =>
  kind === 'skin' ? 'skins' : kind === 'theme' ? 'themes' : kind === 'avatar' ? 'avatars' : 'modes';

export const owns = (p, kind, id) => (p[ownedKey(kind)] || []).includes(id);

/** Spend coins to unlock an item. Returns {ok, reason}. */
export function buy(p, kind, id) {
  const item = catalogFor(kind).find(x => x.id === id);
  if (!item) return { ok: false, reason: 'Unknown item' };
  if (owns(p, kind, id)) return { ok: false, reason: 'Already owned' };
  if (p.coins < item.price) return { ok: false, reason: 'Not enough coins' };
  p.coins -= item.price;
  p[ownedKey(kind)] = [...(p[ownedKey(kind)] || []), id];
  save(p);
  return { ok: true, item };
}

/** Equip an owned cosmetic. */
export function equip(p, kind, id) {
  if (!owns(p, kind, id)) return { ok: false, reason: 'Not owned' };
  if (kind === 'skin')   p.activeSkin = id;
  if (kind === 'theme')  p.activeTheme = id;
  if (kind === 'avatar') p.activeAvatar = id;
  save(p);
  return { ok: true };
}

/**
 * Simulated top-up. This is a demo economy — no real payment is processed and
 * no card details are ever collected.
 */
export function redeemBundle(p, bundleId) {
  const b = COIN_BUNDLES.find(x => x.id === bundleId);
  if (!b) return { ok: false, reason: 'Unknown bundle' };
  p.coins += b.coins;
  save(p);
  return { ok: true, coins: b.coins };
}

const VARIANT_MULTIPLIER = { classic: 1, flip: 1.5, nomercy: 2 };

/** Coins awarded at the end of a round. */
export function awardForResult(p, { won, numPlayers, variant, cardsLeft = 0 }) {
  const mult = VARIANT_MULTIPLIER[variant] ?? 1;
  let amount;
  if (won) {
    amount = Math.round((120 + 60 * (numPlayers - 1)) * mult);
  } else {
    // consolation, smaller the more cards you were stuck with
    amount = Math.max(10, Math.round((45 - 2 * cardsLeft) * mult));
  }
  p.coins += amount;
  p.stats.played += 1;
  if (won) p.stats.won += 1;
  p.stats.earned += amount;
  save(p);
  return amount;
}

export const fmt = n => n.toLocaleString('en-US');

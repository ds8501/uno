// UNO rules engine — Classic, Flip and No Mercy.
//
// Card shapes:
//   classic / nomercy : { id, color, value }
//   flip              : { id, light: {color,value}, dark: {color,value} }
// Use face(card, side) to read whichever side is currently up.

export const LIGHT_COLORS = ['red', 'yellow', 'green', 'blue'];
export const DARK_COLORS  = ['pink', 'teal', 'orange', 'purple'];
export const COLORS = LIGHT_COLORS;          // kept for existing callers

export const VARIANTS = ['classic', 'flip', 'nomercy'];
export const ELIMINATE_AT = 25;              // No Mercy hand limit

let _id = 0;
const nextId = () => _id++;

export function face(card, side) {
  return card.light ? (side === 'dark' ? card.dark : card.light) : card;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── deck builders ─────────────────────────────────────────────────────
function buildClassicDeck() {
  const d = [];
  for (const c of LIGHT_COLORS) {
    d.push({ id: nextId(), color: c, value: '0' });
    for (let n = 1; n <= 9; n++) for (let k = 0; k < 2; k++) d.push({ id: nextId(), color: c, value: String(n) });
    for (const a of ['skip', 'reverse', 'draw2']) for (let k = 0; k < 2; k++) d.push({ id: nextId(), color: c, value: a });
  }
  for (let i = 0; i < 4; i++) { d.push({ id: nextId(), color: 'wild', value: 'wild' }); d.push({ id: nextId(), color: 'wild', value: 'wild4' }); }
  return d;
}

function buildNoMercyDeck() {
  const d = [];
  for (const c of LIGHT_COLORS) {
    d.push({ id: nextId(), color: c, value: '0' });
    for (let n = 1; n <= 9; n++) for (let k = 0; k < 2; k++) d.push({ id: nextId(), color: c, value: String(n) });
    for (const a of ['skip', 'reverse', 'draw2']) for (let k = 0; k < 2; k++) d.push({ id: nextId(), color: c, value: a });
    for (const a of ['draw6', 'draw10', 'skipall', 'revdraw4', 'discardall']) d.push({ id: nextId(), color: c, value: a });
  }
  for (let i = 0; i < 4; i++) { d.push({ id: nextId(), color: 'wild', value: 'wild' }); d.push({ id: nextId(), color: 'wild', value: 'wild6' }); }
  for (let i = 0; i < 2; i++) { d.push({ id: nextId(), color: 'wild', value: 'wild10' }); d.push({ id: nextId(), color: 'wild', value: 'wild4' }); }
  return d;
}

function buildFlipDeck() {
  const light = [], dark = [], lightWild = [], darkWild = [];
  for (const c of LIGHT_COLORS) {
    for (let n = 1; n <= 9; n++) for (let k = 0; k < 2; k++) light.push({ color: c, value: String(n) });
    for (const a of ['skip', 'reverse', 'draw1', 'flip']) for (let k = 0; k < 2; k++) light.push({ color: c, value: a });
  }
  for (const c of DARK_COLORS) {
    for (let n = 1; n <= 9; n++) for (let k = 0; k < 2; k++) dark.push({ color: c, value: String(n) });
    for (const a of ['skipall', 'reverse', 'draw5', 'flip']) for (let k = 0; k < 2; k++) dark.push({ color: c, value: a });
  }
  for (let i = 0; i < 4; i++) {
    lightWild.push({ color: 'wild', value: 'wild' });
    lightWild.push({ color: 'wild', value: 'wild2' });
    darkWild.push({ color: 'wild', value: 'wild' });
    darkWild.push({ color: 'wild', value: 'wildcolor' });
  }
  // a physical card pairs one light face with one dark face
  shuffle(light); shuffle(dark); shuffle(lightWild); shuffle(darkWild);
  const deck = [];
  const n = Math.min(light.length, dark.length);
  for (let i = 0; i < n; i++) deck.push({ id: nextId(), light: light[i], dark: dark[i] });
  const w = Math.min(lightWild.length, darkWild.length);
  for (let i = 0; i < w; i++) deck.push({ id: nextId(), light: lightWild[i], dark: darkWild[i] });
  return deck;
}

export function buildDeck(variant = 'classic') {
  if (variant === 'flip') return buildFlipDeck();
  if (variant === 'nomercy') return buildNoMercyDeck();
  return buildClassicDeck();
}

// how many cards each action inflicts on the next player
const DRAW_AMOUNT = {
  draw1: 1, draw2: 2, draw5: 5, draw6: 6, draw10: 10,
  wild2: 2, wild4: 4, wild6: 6, wild10: 10,
};

export const isWildValue = v =>
  v === 'wild' || v === 'wild2' || v === 'wild4' || v === 'wild6' || v === 'wild10' || v === 'wildcolor';

// ── the game ──────────────────────────────────────────────────────────
export class Game {
  constructor(numPlayers, mode, variant = 'classic') {
    this.numPlayers = numPlayers;
    this.mode = mode;               // 'ai' | 'hotseat'
    this.variant = variant;
    this.reset();
  }

  reset() {
    this.side = 'light';
    this.eliminated = new Set();
    this.deck = shuffle(buildDeck(this.variant));
    this.hands = Array.from({ length: this.numPlayers }, () => this.deck.splice(0, 7));
    // opening card must be playable-on: no wilds, and no Flip to avoid an
    // instant side change before anyone has moved
    let first, guard = 0;
    do {
      first = this.deck.shift(); this.deck.push(first);
      guard++;
    } while (guard < 300 && (face(first, 'light').color === 'wild' || face(first, 'light').value === 'flip'));
    this.deck.pop();
    this.discard = [first];
    this.activeColor = face(first, this.side).color;
    this.current = 0;
    this.dir = 1;
    this.winner = null;
    this.log = [];
    this.addLog(`Game start — top card is ${describe(first, this.side)}`);
  }

  get top() { return this.discard[this.discard.length - 1]; }
  topFace() { return face(this.top, this.side); }
  palette() { return this.side === 'dark' ? DARK_COLORS : LIGHT_COLORS; }
  faceOf(card) { return face(card, this.side); }

  addLog(m) { this.log.unshift(m); if (this.log.length > 6) this.log.pop(); }

  canPlay(card) {
    const f = face(card, this.side);
    if (f.color === 'wild') return true;
    if (f.color === this.activeColor) return true;
    if (f.value === this.topFace().value) return true;
    return false;
  }

  hasLegalMove(p) { return this.hands[p].some(c => this.canPlay(c)); }

  playerName(i) {
    if (this.mode === 'hotseat') return `Player ${i + 1}`;
    return i === 0 ? 'You' : `Bot ${i}`;
  }

  activeCount() { return this.numPlayers - this.eliminated.size; }

  drawFromDeck() {
    if (this.deck.length === 0) {
      const top = this.discard.pop();
      this.deck = shuffle(this.discard);
      this.discard = [top];
    }
    return this.deck.shift();
  }

  giveCards(player, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = this.drawFromDeck();
      if (!c) break;
      this.hands[player].push(c); out.push(c);
    }
    this.checkElimination(player);
    return out;
  }

  /** No Mercy: hit the hand limit and you are out of the round. */
  checkElimination(player) {
    if (this.variant !== 'nomercy') return false;
    if (this.eliminated.has(player)) return false;
    if (this.hands[player].length < ELIMINATE_AT) return false;
    this.eliminated.add(player);
    this.deck.push(...this.hands[player]);
    this.hands[player] = [];
    this.addLog(`${this.playerName(player)} hit ${ELIMINATE_AT} cards and is OUT`);
    const left = [...Array(this.numPlayers).keys()].filter(i => !this.eliminated.has(i));
    if (left.length === 1) this.winner = left[0];
    return true;
  }

  advance(steps = 1) {
    const n = this.numPlayers;
    let moved = 0, guard = 0;
    while (moved < steps && guard++ < 500) {
      this.current = (this.current + this.dir + n) % n;
      if (!this.eliminated.has(this.current)) moved++;
    }
  }

  /** Make sure whoever is "current" is still in the round. */
  settleCurrent() {
    let guard = 0;
    while (this.eliminated.has(this.current) && guard++ < 500) {
      this.current = (this.current + this.dir + this.numPlayers) % this.numPlayers;
    }
  }

  playCard(cardId, chosenColor) {
    const hand = this.hands[this.current];
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx === -1) return null;
    const card = hand[idx];
    if (!this.canPlay(card)) return null;

    const f = face(card, this.side);
    hand.splice(idx, 1);
    this.discard.push(card);
    const effect = { card, face: f, drew: null, drewCount: 0, skipped: null,
                     flipped: false, eliminated: [], discarded: 0, skippedAll: false };

    this.activeColor = f.color === 'wild'
      ? (chosenColor || this.palette()[0])
      : f.color;

    this.addLog(`${this.playerName(this.current)} played ${describe(card, this.side)}` +
                (f.color === 'wild' ? ` → ${this.activeColor}` : ''));

    if (hand.length === 0) { this.winner = this.current; return effect; }

    const before = this.eliminated.size;

    switch (f.value) {
      case 'flip': {
        this.side = this.side === 'dark' ? 'light' : 'dark';
        this.activeColor = face(this.top, this.side).color;
        effect.flipped = true;
        this.addLog(`Deck flipped to the ${this.side} side — colour is now ${this.activeColor}`);
        this.advance(1);
        break;
      }
      case 'reverse': {
        if (this.activeCount() === 2) { this.advance(2); }
        else { this.dir *= -1; this.advance(1); }
        break;
      }
      case 'skip': {
        this.advance(1); effect.skipped = this.current; this.advance(1);
        break;
      }
      case 'skipall': {
        // everyone else loses their turn; the player goes again
        effect.skippedAll = true;
        this.addLog(`${this.playerName(this.current)} skipped everyone`);
        break;
      }
      case 'discardall': {
        const colour = this.activeColor;
        const keep = hand.filter(c => face(c, this.side).color !== colour);
        effect.discarded = hand.length - keep.length;
        if (effect.discarded > 0) {
          this.deck.push(...hand.filter(c => face(c, this.side).color === colour));
          this.hands[this.current] = keep;
          this.addLog(`${this.playerName(this.current)} discarded ${effect.discarded} ${colour} card(s)`);
        }
        if (this.hands[this.current].length === 0) { this.winner = this.current; return effect; }
        this.advance(1);
        break;
      }
      case 'revdraw4': {
        this.dir *= -1;
        this.advance(1);
        this.giveCards(this.current, 4);
        effect.drew = this.current; effect.drewCount = 4;
        this.addLog(`${this.playerName(this.current)} draws 4 & is skipped`);
        this.advance(1);
        break;
      }
      case 'wildcolor': {
        // draw until you turn up the called colour (capped so it can't stall)
        this.advance(1);
        let got = 0;
        for (let i = 0; i < 12; i++) {
          const c = this.giveCards(this.current, 1)[0];
          got++;
          if (!c || face(c, this.side).color === this.activeColor) break;
        }
        effect.drew = this.current; effect.drewCount = got;
        this.addLog(`${this.playerName(this.current)} drew ${got} hunting for ${this.activeColor}`);
        this.advance(1);
        break;
      }
      default: {
        const amount = DRAW_AMOUNT[f.value];
        if (amount) {
          this.advance(1);
          this.giveCards(this.current, amount);
          effect.drew = this.current; effect.drewCount = amount;
          this.addLog(`${this.playerName(this.current)} draws ${amount} & is skipped`);
          this.advance(1);
        } else {
          this.advance(1);
        }
      }
    }

    if (this.eliminated.size > before) effect.eliminated = [...this.eliminated];
    this.settleCurrent();
    return effect;
  }

  drawTurn() {
    const drew = this.giveCards(this.current, 1)[0];
    this.addLog(`${this.playerName(this.current)} drew a card`);
    if (this.eliminated.has(this.current)) { this.settleCurrent(); return { drew, playable: false }; }
    if (drew && this.canPlay(drew)) return { drew, playable: true };
    this.advance(1);
    return { drew, playable: false };
  }

  passTurn() { this.advance(1); }
}

// ── bot ───────────────────────────────────────────────────────────────
const AGGRESSION = ['draw10', 'wild10', 'draw6', 'wild6', 'draw5', 'wild4', 'skipall', 'draw2', 'wild2', 'draw1'];

export function botChoose(game) {
  const hand = game.hands[game.current];
  const legal = hand.filter(c => game.canPlay(c));
  if (legal.length === 0) return { action: 'draw' };

  const val = c => game.faceOf(c).value;
  // punish first when the next player is close to going out, else keep wilds back
  const nextIdx = (game.current + game.dir + game.numPlayers) % game.numPlayers;
  const nextLow = (game.hands[nextIdx]?.length ?? 9) <= 2;

  let pick;
  if (nextLow) {
    pick = legal.slice().sort((a, b) => {
      const ai = AGGRESSION.indexOf(val(a)), bi = AGGRESSION.indexOf(val(b));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })[0];
  } else {
    const plain = legal.filter(c => game.faceOf(c).color !== 'wild');
    pick = (plain.length ? plain : legal)[0];
  }

  let color = null;
  if (game.faceOf(pick).color === 'wild') color = bestColor(game, hand);
  return { action: 'play', cardId: pick.id, color };
}

export function bestColor(game, hand) {
  const pal = game.palette();
  const counts = Object.fromEntries(pal.map(c => [c, 0]));
  for (const c of hand) {
    const col = game.faceOf(c).color;
    if (counts[col] !== undefined) counts[col]++;
  }
  return pal.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
}

// ── labels ────────────────────────────────────────────────────────────
const NAMES = {
  skip: 'Skip', reverse: 'Reverse', draw1: '+1', draw2: '+2', draw5: '+5',
  draw6: '+6', draw10: '+10', skipall: 'Skip All', revdraw4: 'Rev +4',
  discardall: 'Discard All', flip: 'Flip', wild: 'Wild', wild2: 'Wild +2',
  wild4: 'Wild +4', wild6: 'Wild +6', wild10: 'Wild +10', wildcolor: 'Wild Colour',
};

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function describe(card, side = 'light') {
  const f = face(card, side);
  const label = NAMES[f.value] || f.value;
  return f.color === 'wild' ? label : `${cap(f.color)} ${label}`;
}

// kept for older call sites
export function canPlay(card, top, activeColor, side = 'light') {
  const f = face(card, side), t = face(top, side);
  return f.color === 'wild' || f.color === activeColor || f.value === t.value;
}

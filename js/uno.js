// UNO game logic — prototype (lightweight rules)
// A card: { color: 'red'|'yellow'|'green'|'blue'|'wild', value: '0'..'9'|'skip'|'reverse'|'draw2'|'wild'|'wild4', id: number }

export const COLORS = ['red', 'yellow', 'green', 'blue'];

let _id = 0;
const card = (color, value) => ({ color, value, id: _id++ });

export function buildDeck() {
  const deck = [];
  for (const c of COLORS) {
    deck.push(card(c, '0'));
    for (let n = 1; n <= 9; n++) { deck.push(card(c, String(n))); deck.push(card(c, String(n))); }
    for (const a of ['skip', 'reverse', 'draw2']) { deck.push(card(c, a)); deck.push(card(c, a)); }
  }
  for (let i = 0; i < 4; i++) { deck.push(card('wild', 'wild')); deck.push(card('wild', 'wild4')); }
  return deck;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Can `c` be played on top of the current discard given the active color?
export function canPlay(c, top, activeColor) {
  if (c.color === 'wild') return true;
  if (c.color === activeColor) return true;
  if (c.value === top.value) return true;
  return false;
}

export function isActionValue(v) {
  return v === 'skip' || v === 'reverse' || v === 'draw2' || v === 'wild4';
}

export class Game {
  constructor(numPlayers, mode) {
    this.numPlayers = numPlayers;
    this.mode = mode; // 'ai' | 'hotseat'
    this.reset();
  }

  reset() {
    this.deck = shuffle(buildDeck());
    this.hands = Array.from({ length: this.numPlayers }, () => this.deck.splice(0, 7));
    // First non-wild card starts the discard.
    let first;
    do { first = this.deck.shift(); this.deck.push(first); } while (first.color === 'wild');
    // remove it properly
    this.deck.pop();
    this.discard = [first];
    this.activeColor = first.color;
    this.current = 0;
    this.dir = 1; // 1 = clockwise
    this.winner = null;
    this.log = [];
    this.pendingDraw = 0; // reserved (not stacking in prototype)
    this.addLog(`Game start — top card is ${describe(first)}`);
  }

  get top() { return this.discard[this.discard.length - 1]; }

  addLog(msg) { this.log.unshift(msg); if (this.log.length > 6) this.log.pop(); }

  drawFromDeck() {
    if (this.deck.length === 0) {
      // recycle discard (keep top)
      const top = this.discard.pop();
      this.deck = shuffle(this.discard);
      this.discard = [top];
    }
    return this.deck.shift();
  }

  // Player draws n cards. Returns the drawn cards.
  giveCards(player, n) {
    const out = [];
    for (let i = 0; i < n; i++) { const c = this.drawFromDeck(); if (c) { this.hands[player].push(c); out.push(c); } }
    return out;
  }

  playerName(i) {
    if (this.mode === 'hotseat') return `Player ${i + 1}`;
    return i === 0 ? 'You' : `Bot ${i}`;
  }

  advance(steps = 1) {
    this.current = (this.current + this.dir * steps + this.numPlayers) % this.numPlayers;
  }

  // Play a card from current player's hand. `chosenColor` required for wilds.
  // Returns an effect summary for the renderer.
  playCard(cardId, chosenColor) {
    const hand = this.hands[this.current];
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx === -1) return null;
    const c = hand[idx];
    if (!canPlay(c, this.top, this.activeColor)) return null;

    hand.splice(idx, 1);
    this.discard.push(c);
    const effect = { card: c, skipped: null, drew: null, drewCount: 0, reversed: false };

    // color
    if (c.color === 'wild') this.activeColor = chosenColor || COLORS[0];
    else this.activeColor = c.color;

    this.addLog(`${this.playerName(this.current)} played ${describe(c)}${c.color === 'wild' ? ' → ' + this.activeColor : ''}`);

    // win check before applying effects to others
    if (hand.length === 0) { this.winner = this.current; return effect; }

    // apply effects
    switch (c.value) {
      case 'reverse':
        if (this.numPlayers === 2) { effect.reversed = true; this.advance(2); } // acts as skip
        else { this.dir *= -1; effect.reversed = true; this.advance(1); }
        break;
      case 'skip': {
        this.advance(1); effect.skipped = this.current; this.advance(1); break;
      }
      case 'draw2': {
        this.advance(1);
        const drew = this.giveCards(this.current, 2);
        effect.drew = this.current; effect.drewCount = 2;
        this.addLog(`${this.playerName(this.current)} draws 2 & is skipped`);
        this.advance(1);
        break;
      }
      case 'wild4': {
        this.advance(1);
        const drew = this.giveCards(this.current, 4);
        effect.drew = this.current; effect.drewCount = 4;
        this.addLog(`${this.playerName(this.current)} draws 4 & is skipped`);
        this.advance(1);
        break;
      }
      default:
        this.advance(1);
    }
    return effect;
  }

  // Current player draws one from the deck (no auto-play in prototype).
  drawTurn() {
    const drew = this.giveCards(this.current, 1)[0];
    this.addLog(`${this.playerName(this.current)} drew a card`);
    // If drawn card is playable, let them keep the turn to play it; otherwise pass.
    if (drew && canPlay(drew, this.top, this.activeColor)) {
      return { drew, playable: true };
    }
    this.advance(1);
    return { drew, playable: false };
  }

  passTurn() { this.advance(1); }

  hasLegalMove(player) {
    return this.hands[player].some(c => canPlay(c, this.top, this.activeColor));
  }
}

// Simple bot: play first legal card; pick color it holds most of for wilds.
export function botChoose(game) {
  const hand = game.hands[game.current];
  const legal = hand.filter(c => canPlay(c, game.top, game.activeColor));
  if (legal.length === 0) return { action: 'draw' };
  // prefer non-wild so wilds are saved
  const nonWild = legal.filter(c => c.color !== 'wild');
  const pick = (nonWild.length ? nonWild : legal)[0];
  let color = null;
  if (pick.color === 'wild') {
    const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
    for (const c of hand) if (counts[c.color] !== undefined) counts[c.color]++;
    color = COLORS.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  }
  return { action: 'play', cardId: pick.id, color };
}

export function describe(c) {
  const names = { skip: 'Skip', reverse: 'Reverse', draw2: '+2', wild: 'Wild', wild4: 'Wild +4' };
  const label = names[c.value] || c.value;
  return c.color === 'wild' ? label : `${cap(c.color)} ${label}`;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

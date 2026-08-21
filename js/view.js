// Wraps a server snapshot in the same read-only surface the renderer expects
// from a local Game, so app.js can treat online and offline play alike.

import { face, LIGHT_COLORS, DARK_COLORS } from './uno.js';

export function makeView(snap) {
  return {
    online: true,
    mode: 'online',
    you: snap.you,
    numPlayers: snap.numPlayers,
    current: snap.current,
    dir: snap.dir,
    side: snap.side,
    variant: snap.variant,
    activeColor: snap.activeColor,
    winner: snap.winner,
    eliminated: new Set(snap.eliminated || []),
    log: snap.log || [],
    hands: snap.hands,
    deckCount: snap.deckCount,
    _top: snap.top,
    _names: snap.names || [],

    get top() { return this._top; },
    topFace() { return face(this._top, this.side); },
    faceOf(card) { return face(card, this.side); },
    palette() { return this.side === 'dark' ? DARK_COLORS : LIGHT_COLORS; },
    playerName(i) { return i === this.you ? 'You' : (this._names[i] || `Player ${i + 1}`); },

    canPlay(card) {
      if (!card || card.hidden) return false;      // opponents' cards are opaque
      const f = face(card, this.side);
      if (f.color === 'wild') return true;
      if (f.color === this.activeColor) return true;
      return f.value === this.topFace().value;
    },
    hasLegalMove(p) { return this.hands[p].some(c => this.canPlay(c)); },
  };
}

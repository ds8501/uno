// Simple bot AI. Picks a legal move with light heuristics, chooses a color,
// and remembers to shout UNO. Returns an action descriptor the hook applies.

import { canPlay, isWild } from './deck.js'
import { topCard } from './engine.js'

const COLORS = ['red', 'yellow', 'green', 'blue']

// Choose the color the bot holds most of (best follow-up options).
function bestColor(hand) {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 }
  for (const c of hand) if (!isWild(c)) counts[c.color]++
  let best = 'red', max = -1
  for (const col of COLORS) {
    if (counts[col] > max) { max = counts[col]; best = col }
  }
  return best
}

// Decide a bot's move for the current state.
// Returns one of:
//   { type: 'play', cardId, color? }
//   { type: 'draw' }
export function decideMove(state) {
  const me = state.players[state.currentIdx]
  const top = topCard(state)
  const legal = me.hand.filter((c) => canPlay(c, top, state.activeColor))

  // If a card was just drawn and it's the only legal one, play/pass sensibly.
  if (legal.length === 0) return { type: 'draw' }

  // Heuristic priority:
  // 1. dump action cards (skip/reverse/draw2) when opponent close to winning
  // 2. otherwise play a matching-color number to keep options
  // 3. save wilds for when nothing else matches
  const nonWild = legal.filter((c) => !isWild(c))
  const wilds = legal.filter((c) => isWild(c))

  const anyOpponentClose = state.players.some(
    (p) => p.id !== me.id && p.hand.length <= 2
  )

  let choice
  if (anyOpponentClose) {
    choice =
      nonWild.find((c) => c.value === 'draw2') ||
      nonWild.find((c) => c.value === 'skip') ||
      nonWild.find((c) => c.value === 'reverse') ||
      nonWild[0] ||
      wilds.find((c) => c.value === 'wild4') ||
      wilds[0]
  } else {
    // prefer number cards, keep action cards for later
    choice =
      nonWild.find((c) => /^[0-9]$/.test(c.value)) ||
      nonWild[0] ||
      wilds[0]
  }

  if (isWild(choice)) {
    return { type: 'play', cardId: choice.id, color: bestColor(me.hand) }
  }
  return { type: 'play', cardId: choice.id }
}

// Should the bot shout UNO? (after playing down to 1 card)
export function shouldCallUno(state, botId) {
  const p = state.players.find((x) => x.id === botId)
  return p && p.hand.length === 1 && !p.saidUno
}

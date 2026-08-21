// UNO deck construction and card helpers.
// Colors use stable keys so themes can reskin them without touching logic.

export const COLORS = ['red', 'yellow', 'green', 'blue']

// value can be: '0'..'9', 'skip', 'reverse', 'draw2' (colored)
//               'wild', 'wild4' (wild)
export const ACTION_VALUES = ['skip', 'reverse', 'draw2']
export const WILD_VALUES = ['wild', 'wild4']

let _id = 0
const nextId = () => `c${_id++}`

export function buildDeck() {
  _id = 0
  const deck = []

  for (const color of COLORS) {
    // one 0 per color
    deck.push(card(color, '0'))
    // two each of 1-9
    for (let n = 1; n <= 9; n++) {
      deck.push(card(color, String(n)))
      deck.push(card(color, String(n)))
    }
    // two each of skip / reverse / draw2
    for (const a of ACTION_VALUES) {
      deck.push(card(color, a))
      deck.push(card(color, a))
    }
  }

  // 4 wild + 4 wild draw four
  for (let i = 0; i < 4; i++) {
    deck.push(card('wild', 'wild'))
    deck.push(card('wild', 'wild4'))
  }

  return shuffle(deck)
}

function card(color, value) {
  return { id: nextId(), color, value }
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function isWild(c) {
  return c.color === 'wild'
}

export function isAction(c) {
  return ACTION_VALUES.includes(c.value) || WILD_VALUES.includes(c.value)
}

// Can `card` be played on top of the discard pile, given the active color?
export function canPlay(card, topCard, activeColor) {
  if (isWild(card)) return true
  if (card.color === activeColor) return true
  if (card.value === topCard.value) return true
  return false
}

// Points for end-of-round scoring (kept for future season-pass / stats use).
export function cardPoints(c) {
  if (WILD_VALUES.includes(c.value)) return 50
  if (ACTION_VALUES.includes(c.value)) return 20
  return parseInt(c.value, 10) || 0
}

const SYMBOL = {
  skip: '⊘',
  reverse: '⇄',
  draw2: '+2',
  wild: '★',
  wild4: '+4',
}

export function cardLabel(c) {
  return SYMBOL[c.value] || c.value
}

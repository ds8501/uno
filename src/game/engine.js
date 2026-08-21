// Pure-ish UNO game engine. All functions take a state and return a NEW state,
// so it's trivial to later move authoritative logic to a server and stream
// state diffs over WebSocket/STOMP. No React in here.

import { buildDeck, shuffle, canPlay, isWild, cardLabel } from './deck.js'

const HAND_SIZE = 7

export function createGame(players) {
  let drawPile = buildDeck()
  const hands = players.map(() => [])

  // deal 7 to each
  for (let i = 0; i < HAND_SIZE; i++) {
    for (let p = 0; p < players.length; p++) {
      hands[p].push(drawPile.pop())
    }
  }

  // flip first card — keep it simple/robust: start on a plain number card
  let first
  while (true) {
    first = drawPile.pop()
    if (!isWild(first) && /^[0-9]$/.test(first.value)) break
    drawPile.unshift(first) // send oddball to the bottom, try again
  }

  return {
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      avatar: p.avatar,
      hand: hands[i],
      saidUno: false,
    })),
    drawPile,
    discardPile: [first],
    activeColor: first.color,
    currentIdx: 0,
    direction: 1,
    status: 'playing',       // 'playing' | 'choosingColor' | 'finished'
    pendingWild: null,        // { playerId, cardId } while a human picks color
    winnerId: null,
    log: [{ t: 'system', text: `Game on! First card: ${describe(first)}.` }],
    turnCount: 0,
    lastEvent: null,          // small hint for UI animations
  }
}

export function topCard(state) {
  return state.discardPile[state.discardPile.length - 1]
}

export function currentPlayer(state) {
  return state.players[state.currentIdx]
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id)
}

export function playableCards(state, playerId) {
  const p = playerById(state, playerId)
  if (!p) return []
  const top = topCard(state)
  return p.hand.filter((c) => canPlay(c, top, state.activeColor)).map((c) => c.id)
}

function describe(c) {
  const col = c.color === 'wild' ? '' : cap(c.color) + ' '
  return `${col}${cardLabel(c)}`
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// Pull N cards for a player, reshuffling the discard pile if we run dry.
function drawInto(state, playerIdx, n) {
  let { drawPile, discardPile } = state
  drawPile = [...drawPile]
  discardPile = [...discardPile]
  const hand = [...state.players[playerIdx].hand]

  for (let i = 0; i < n; i++) {
    if (drawPile.length === 0) {
      if (discardPile.length <= 1) break // truly out of cards
      const top = discardPile.pop()
      drawPile = shuffle(discardPile)
      discardPile = [top]
    }
    hand.push(drawPile.pop())
  }

  const players = state.players.map((p, i) =>
    i === playerIdx ? { ...p, hand } : p
  )
  return { ...state, drawPile, discardPile, players }
}

function nextIdx(state, from, steps) {
  const n = state.players.length
  let idx = from
  for (let s = 0; s < steps; s++) idx = (idx + state.direction + n) % n
  return idx
}

// Attempt to play a card. If it's a wild and no color chosen yet, returns a
// state in 'choosingColor' status (for humans). Bots pass chosenColor directly.
export function playCard(state, playerId, cardId, chosenColor = null) {
  if (state.status === 'finished') return state
  const pIdx = state.players.findIndex((p) => p.id === playerId)
  if (pIdx !== state.currentIdx) return state

  const player = state.players[pIdx]
  const card = player.hand.find((c) => c.id === cardId)
  if (!card) return state
  if (!canPlay(card, topCard(state), state.activeColor)) return state

  if (isWild(card) && !chosenColor) {
    // pause for color selection (human path)
    return { ...state, status: 'choosingColor', pendingWild: { playerId, cardId } }
  }

  // remove card from hand
  const newHand = player.hand.filter((c) => c.id !== cardId)
  let players = state.players.map((p, i) =>
    i === pIdx ? { ...p, hand: newHand, saidUno: newHand.length === 1 ? p.saidUno : false } : p
  )

  let next = {
    ...state,
    players,
    discardPile: [...state.discardPile, card],
    activeColor: isWild(card) ? chosenColor : card.color,
    status: 'playing',
    pendingWild: null,
    turnCount: state.turnCount + 1,
  }

  const log = [...state.log, { t: 'play', text: `${player.name} played ${describe({ ...card, color: isWild(card) ? chosenColor : card.color })}.` }]

  // win check
  if (newHand.length === 0) {
    return {
      ...next,
      status: 'finished',
      winnerId: playerId,
      log: [...log, { t: 'system', text: `🏆 ${player.name} wins!` }],
      lastEvent: { type: 'win', playerId },
    }
  }

  // apply card effect + advance turn
  let event = { type: card.value, by: playerId }
  switch (card.value) {
    case 'skip': {
      const skipped = nextIdx(next, next.currentIdx, 1)
      next.currentIdx = nextIdx(next, next.currentIdx, 2)
      log.push({ t: 'system', text: `${next.players[skipped].name} was skipped.` })
      break
    }
    case 'reverse': {
      next.direction = -state.direction
      if (next.players.length === 2) {
        // acts like skip in 2-player
        next.currentIdx = nextIdx(next, next.currentIdx, 2)
      } else {
        next.currentIdx = nextIdx(next, next.currentIdx, 1)
      }
      log.push({ t: 'system', text: `Direction reversed ${next.direction === 1 ? '↻' : '↺'}.` })
      break
    }
    case 'draw2': {
      const victim = nextIdx(next, next.currentIdx, 1)
      next = drawInto(next, victim, 2)
      log.push({ t: 'system', text: `${next.players[victim].name} draws 2 & is skipped.` })
      next.currentIdx = nextIdx(next, next.currentIdx, 2)
      break
    }
    case 'wild4': {
      const victim = nextIdx(next, next.currentIdx, 1)
      next = drawInto(next, victim, 4)
      log.push({ t: 'system', text: `${next.players[victim].name} draws 4! Color → ${cap(chosenColor)}.` })
      next.currentIdx = nextIdx(next, next.currentIdx, 2)
      break
    }
    case 'wild': {
      log.push({ t: 'system', text: `Color changed to ${cap(chosenColor)}.` })
      next.currentIdx = nextIdx(next, next.currentIdx, 1)
      break
    }
    default: {
      next.currentIdx = nextIdx(next, next.currentIdx, 1)
    }
  }

  return { ...next, log, lastEvent: event }
}

// Resolve the color for a paused wild (human picked a color).
export function chooseColor(state, color) {
  if (state.status !== 'choosingColor' || !state.pendingWild) return state
  const { playerId, cardId } = state.pendingWild
  return playCard({ ...state, status: 'playing', pendingWild: null }, playerId, cardId, color)
}

// Draw a single card for the current player. If it's playable, the turn stays
// (returns { ...state, drawnCardId }). Otherwise the turn passes automatically.
export function drawCard(state, playerId) {
  if (state.status !== 'playing') return state
  const pIdx = state.players.findIndex((p) => p.id === playerId)
  if (pIdx !== state.currentIdx) return state

  const before = state.players[pIdx].hand.length
  let next = drawInto(state, pIdx, 1)
  const drawn = next.players[pIdx].hand[before] // the card we just added
  const player = next.players[pIdx]

  const log = [...next.log, { t: 'system', text: `${player.name} drew a card.` }]

  // reset any prior UNO claim since hand grew
  next = {
    ...next,
    players: next.players.map((p, i) => (i === pIdx ? { ...p, saidUno: false } : p)),
  }

  if (drawn && canPlay(drawn, topCard(next), next.activeColor)) {
    // let them decide to play it or pass
    return { ...next, log, drawnCardId: drawn.id, lastEvent: { type: 'draw', by: playerId } }
  }

  // not playable → pass turn
  return {
    ...next,
    log: [...log, { t: 'system', text: `${player.name} passes.` }],
    currentIdx: nextIdx(next, next.currentIdx, 1),
    drawnCardId: null,
    lastEvent: { type: 'draw', by: playerId },
  }
}

// Explicitly pass after drawing a (playable) card.
export function passTurn(state, playerId) {
  if (state.status !== 'playing') return state
  const pIdx = state.players.findIndex((p) => p.id === playerId)
  if (pIdx !== state.currentIdx) return state
  return {
    ...state,
    currentIdx: nextIdx(state, state.currentIdx, 1),
    drawnCardId: null,
    log: [...state.log, { t: 'system', text: `${state.players[pIdx].name} passes.` }],
  }
}

export function callUno(state, playerId) {
  const p = playerById(state, playerId)
  if (!p || p.hand.length !== 1) return state
  return {
    ...state,
    players: state.players.map((x) => (x.id === playerId ? { ...x, saidUno: true } : x)),
    log: [...state.log, { t: 'uno', text: `${p.name} shouts UNO! 🔔` }],
    lastEvent: { type: 'uno', playerId },
  }
}

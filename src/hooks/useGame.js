import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createGame,
  playCard,
  drawCard,
  chooseColor,
  passTurn,
  callUno,
  playableCards,
} from '../game/engine.js'
import { decideMove, shouldCallUno } from '../game/bots.js'

// Drives a single UNO match: holds engine state, exposes human actions, and
// runs an automatic loop for bot players. Designed so the same action surface
// could later be backed by a server instead of local bots.
export function useGame(seatPlayers, humanId) {
  const [state, setState] = useState(() => createGame(seatPlayers))
  const [emotes, setEmotes] = useState([]) // floating emote bubbles per seat
  const timers = useRef([])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => () => clearTimers(), [])

  const restart = useCallback(() => {
    clearTimers()
    setState(createGame(seatPlayers))
  }, [seatPlayers])

  // ---- Human actions ----
  const human = {
    play: (cardId, color = null) =>
      setState((s) => playCard(s, humanId, cardId, color)),
    pickColor: (color) => setState((s) => chooseColor(s, color)),
    draw: () => setState((s) => drawCard(s, humanId)),
    pass: () => setState((s) => passTurn(s, humanId)),
    uno: () => setState((s) => callUno(s, humanId)),
  }

  const pushEmote = useCallback((playerId, emoji) => {
    const key = Math.random().toString(36).slice(2)
    setEmotes((e) => [...e, { key, playerId, emoji }])
    const t = setTimeout(() => {
      setEmotes((e) => e.filter((x) => x.key !== key))
    }, 1600)
    timers.current.push(t)
  }, [])

  // ---- Bot loop ----
  useEffect(() => {
    if (state.status === 'finished') return
    const cur = state.players[state.currentIdx]
    if (!cur.isBot) return
    if (state.status !== 'playing') return

    // small delay so moves feel human & readable
    const think = 750 + Math.random() * 700
    const t = setTimeout(() => {
      setState((s) => {
        // re-check it's still this bot's turn
        const c = s.players[s.currentIdx]
        if (!c.isBot || s.status !== 'playing') return s

        const move = decideMove(s)
        let ns = s
        if (move.type === 'play') {
          ns = playCard(s, c.id, move.cardId, move.color || null)
          // bot shouts UNO right after reaching one card
          if (shouldCallUno(ns, c.id)) {
            ns = callUno(ns, c.id)
          }
        } else {
          ns = drawCard(s, c.id)
          // if the drawn card is playable, bot plays it immediately
          if (ns.drawnCardId && ns.currentIdx === s.currentIdx) {
            const legal = playableCards(ns, c.id)
            if (legal.includes(ns.drawnCardId)) {
              const drawnCard = ns.players[s.currentIdx].hand.find(
                (x) => x.id === ns.drawnCardId
              )
              const color =
                drawnCard && drawnCard.color === 'wild'
                  ? decideMove(ns).color || 'red'
                  : null
              ns = playCard(ns, c.id, ns.drawnCardId, color)
              if (shouldCallUno(ns, c.id)) ns = callUno(ns, c.id)
            } else {
              ns = passTurn(ns, c.id)
            }
          }
        }
        return ns
      })
    }, think)

    timers.current.push(t)
    return () => clearTimeout(t)
  }, [state.currentIdx, state.status, state.turnCount])

  // occasional bot banter
  useEffect(() => {
    if (state.status !== 'playing') return
    const bots = state.players.filter((p) => p.isBot)
    if (!bots.length) return
    const t = setTimeout(() => {
      if (Math.random() < 0.35) {
        const bot = bots[Math.floor(Math.random() * bots.length)]
        const set = ['😏', '🔥', '🤔', '😂', '👀']
        pushEmote(bot.id, set[Math.floor(Math.random() * set.length)])
      }
    }, 2500)
    timers.current.push(t)
    return () => clearTimeout(t)
  }, [state.turnCount])

  const myLegal = playableCards(state, humanId)

  return { state, emotes, human, restart, pushEmote, myLegal }
}

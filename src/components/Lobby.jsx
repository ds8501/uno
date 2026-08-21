import { useState } from 'react'
import Chat from './Chat.jsx'
import ThemePicker from './ThemePicker.jsx'
import { getTheme } from '../data/themes.js'

const BOT_NAMES = ['Aria', 'Bolt', 'Coco', 'Dash', 'Echo', 'Fizz', 'Gizmo']
const BOT_AVATARS = ['🤖', '👾', '🐲', '🦑', '🦜', '🦖', '🐺']

// Pre-game room: shareable code, player seats (4–8), add bots, chat, theme,
// and start. Bots stand in for "friends who haven't joined yet" in the demo.
export default function Lobby({
  code, profile, players, setPlayers, theme, setTheme,
  messages, onSend, onEmote, onStart, onLeave, onUnlock,
}) {
  const [copied, setCopied] = useState(false)
  const t = getTheme(theme)
  const shareUrl = `${location.origin}${location.pathname}?room=${code}`

  const addBot = () => {
    if (players.length >= 8) return
    const used = players.map((p) => p.name)
    const name = BOT_NAMES.find((n) => !used.includes(n)) || `Bot ${players.length}`
    const idx = BOT_NAMES.indexOf(name)
    setPlayers([
      ...players,
      { id: `bot-${Date.now()}`, name, avatar: BOT_AVATARS[idx] || '🤖', isBot: true },
    ])
  }

  const removeBot = (id) => setPlayers(players.filter((p) => p.id !== id))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard may be blocked; ignore */ }
  }

  const canStart = players.length >= 2 // 2+ to demo; real min could be 4

  return (
    <div className={`min-h-full w-full bg-gradient-to-br ${t.table} text-white`}>
      <div className="mx-auto max-w-6xl px-5 py-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button onClick={onLeave} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">
            ← Leave
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-black/40 px-4 py-2 text-center backdrop-blur">
              <div className="text-[10px] uppercase tracking-widest text-white/50">Room code</div>
              <div className="text-2xl font-black tracking-[0.3em]" style={{ color: t.accent }}>{code}</div>
            </div>
            <button
              onClick={copy}
              className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-black transition hover:brightness-105"
            >
              {copied ? '✓ Copied!' : '🔗 Copy invite'}
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* seats + controls */}
          <section className="space-y-6">
            <div className="rounded-3xl bg-black/25 p-5 ring-1 ring-white/10 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-extrabold">Players <span className="text-white/50">({players.length}/8)</span></h2>
                <button
                  onClick={addBot}
                  disabled={players.length >= 8}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold transition hover:bg-white/20 disabled:opacity-40"
                >
                  + Add bot
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {players.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10"
                  >
                    <span className="text-2xl">{p.avatar}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">
                        {p.name}
                        {p.id === profile.id && <span className="ml-1 text-xs text-yellow-300">(you)</span>}
                      </div>
                      <div className="text-[11px] text-white/50">
                        {i === 0 ? '👑 Host' : p.isBot ? '🤖 Bot' : 'Guest'}
                      </div>
                    </div>
                    {p.isBot && (
                      <button
                        onClick={() => removeBot(p.id)}
                        className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-red-500/40"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}

                {/* empty seats */}
                {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex items-center gap-3 rounded-xl border-2 border-dashed border-white/10 px-3 py-2.5 text-white/40"
                  >
                    <span className="text-2xl">🪑</span>
                    <span className="text-sm">Waiting for player…</span>
                  </div>
                ))}
              </div>

              <button
                onClick={onStart}
                disabled={!canStart}
                className="mt-5 w-full rounded-xl bg-yellow-400 py-4 text-lg font-black text-black shadow-lg transition hover:brightness-105 disabled:opacity-40"
              >
                ▶ Start Game
              </button>
              {!canStart && (
                <p className="mt-2 text-center text-xs text-white/50">Add at least one more player or bot to start.</p>
              )}
            </div>

            <div className="rounded-3xl bg-black/25 p-5 ring-1 ring-white/10 backdrop-blur-sm">
              <h2 className="mb-3 text-lg font-extrabold">Table skin</h2>
              <ThemePicker
                selected={theme}
                owned={profile.owned}
                coins={profile.coins}
                onSelect={setTheme}
                onUnlock={onUnlock}
                compact
              />
            </div>
          </section>

          {/* chat */}
          <section className="h-[560px]">
            <Chat messages={messages} onSend={onSend} onEmote={onEmote} />
          </section>
        </div>
      </div>
    </div>
  )
}

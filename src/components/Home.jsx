import { useState } from 'react'
import ThemePicker from './ThemePicker.jsx'
import { getTheme } from '../data/themes.js'

const AVATARS = ['🦊', '🐼', '🐸', '🐵', '🦁', '🐯', '🐨', '🐧', '🦄', '🐙']

// Random 5-char room code for the shareable link/social flow.
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function Home({ profile, onCreate, onJoin, onUnlock }) {
  const [name, setName] = useState(profile.name)
  const [avatar, setAvatar] = useState(profile.avatar)
  const [theme, setTheme] = useState(profile.theme)
  const [joinCode, setJoinCode] = useState('')
  const [mode, setMode] = useState(null) // null | 'join'

  const t = getTheme(theme)
  const canGo = name.trim().length > 0

  const start = (code) => {
    const p = { name: name.trim() || 'Player', avatar, theme }
    if (mode === 'join') onJoin(code || joinCode.trim().toUpperCase(), p)
    else onCreate(randomCode(), p)
  }

  return (
    <div className={`min-h-full w-full bg-gradient-to-br ${t.table} text-white`}>
      <div className="mx-auto max-w-5xl px-5 py-8">
        {/* header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black tracking-tight">UNO</span>
            <span className="text-2xl font-black" style={{ color: t.accent }}>FIESTA</span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-sm font-bold backdrop-blur">
            🪙 <span>{profile.coins}</span>
            <span className="ml-1 text-white/50 font-medium">coins</span>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left: identity + play */}
          <section className="rounded-3xl bg-black/25 p-6 backdrop-blur-sm ring-1 ring-white/10">
            <h1 className="text-2xl font-extrabold">Play UNO with friends</h1>
            <p className="mt-1 text-sm text-white/70">
              Real-time rooms for 4–8 players · festival packs · chat &amp; emotes.
            </p>

            {/* name */}
            <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-white/50">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={14}
              placeholder="Enter a nickname"
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 font-semibold outline-none placeholder:text-white/40 focus:border-yellow-400"
            />

            {/* avatar */}
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-white/50">Avatar</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAvatar(a)}
                  className={`h-10 w-10 rounded-full text-xl transition ${
                    avatar === a ? 'bg-yellow-400 scale-110' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>

            {/* actions */}
            <div className="mt-6 space-y-3">
              <button
                disabled={!canGo}
                onClick={() => { setMode('create'); start() }}
                className="w-full rounded-xl bg-yellow-400 py-3.5 text-lg font-black text-black shadow-lg transition hover:brightness-105 disabled:opacity-40"
              >
                🎮 Create Room
              </button>

              {mode === 'join' ? (
                <div className="flex gap-2">
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={5}
                    placeholder="CODE"
                    className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-center text-lg font-black tracking-[0.3em] outline-none placeholder:text-white/30 focus:border-yellow-400"
                  />
                  <button
                    disabled={!canGo || joinCode.trim().length < 4}
                    onClick={() => start()}
                    className="shrink-0 rounded-xl bg-white/15 px-5 font-bold transition hover:bg-white/25 disabled:opacity-40"
                  >
                    Join
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setMode('join')}
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-3.5 font-bold transition hover:bg-white/10"
                >
                  🔗 Join with a code
                </button>
              )}
            </div>

            <p className="mt-4 text-center text-xs text-white/40">
              No sign-up needed. Share the room link and play instantly.
            </p>
          </section>

          {/* Right: skins / packs */}
          <section className="rounded-3xl bg-black/25 p-6 backdrop-blur-sm ring-1 ring-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Card Packs</h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                Classic free · festival packs premium
              </span>
            </div>
            <p className="mt-1 text-sm text-white/60">Pick a look for your table.</p>

            <div className="mt-4">
              <ThemePicker
                selected={theme}
                owned={profile.owned}
                coins={profile.coins}
                onSelect={setTheme}
                onUnlock={onUnlock}
              />
            </div>

            <div className="mt-5 rounded-xl bg-white/5 p-3 text-xs text-white/60">
              <span className="font-bold text-yellow-300">💡 Monetization (later):</span> cosmetic pack
              purchases, a Season Pass for rotating festival themes, and rewarded ads for coins —
              all cosmetic, no wagering.
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

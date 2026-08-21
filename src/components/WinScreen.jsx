import { getTheme } from '../data/themes.js'

// End-of-round screen. Awards mock coins (the rewarded-ad / progression hook).
export default function WinScreen({ winner, isMe, theme, coinsEarned, onRematch, onHome, onWatchAd }) {
  const t = getTheme(theme)
  return (
    <div className={`min-h-full w-full bg-gradient-to-br ${t.table} text-white`}>
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <div className="animate-pop text-7xl">{isMe ? '🏆' : winner.avatar}</div>
        <h1 className="mt-4 text-3xl font-black">
          {isMe ? 'You win! 🎉' : `${winner.name} wins`}
        </h1>
        <p className="mt-1 text-white/60">{isMe ? 'Clutch finish.' : 'Better luck next round!'}</p>

        <div className="mt-6 w-full rounded-2xl bg-black/30 p-5 ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <span className="text-white/70">Coins earned</span>
            <span className="text-xl font-black text-yellow-300">🪙 +{coinsEarned}</span>
          </div>
          <button
            onClick={onWatchAd}
            className="mt-4 w-full rounded-xl border border-yellow-400/40 bg-yellow-400/10 py-3 text-sm font-bold text-yellow-200 transition hover:bg-yellow-400/20"
          >
            ▶ Watch ad to double coins (+{coinsEarned})
          </button>
          <p className="mt-1 text-[11px] text-white/40">Rewarded ads are optional & cosmetic-only.</p>
        </div>

        <div className="mt-6 flex w-full gap-3">
          <button onClick={onHome} className="flex-1 rounded-xl bg-white/10 py-3.5 font-bold transition hover:bg-white/20">
            🏠 Home
          </button>
          <button onClick={onRematch} className="flex-1 rounded-xl bg-yellow-400 py-3.5 font-black text-black transition hover:brightness-105">
            🔁 Rematch
          </button>
        </div>
      </div>
    </div>
  )
}

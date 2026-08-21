import { THEME_LIST } from '../data/themes.js'

// Skin/pack selector. Classic is free; festival packs are premium (the
// monetization hook). Owned packs are selectable; locked ones show a price and
// trigger the (mock) unlock flow — swap `onUnlock` for a real store later.
export default function ThemePicker({ selected, owned, coins, onSelect, onUnlock, compact = false }) {
  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'}`}>
      {THEME_LIST.map((t) => {
        const isOwned = !t.premium || owned.includes(t.id)
        const isSel = selected === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => (isOwned ? onSelect(t.id) : onUnlock(t))}
            className={`group relative overflow-hidden rounded-xl border-2 p-3 text-left transition
              ${isSel ? 'border-yellow-400 ring-2 ring-yellow-400/50' : 'border-white/10 hover:border-white/30'}
              bg-gradient-to-br ${t.table}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{t.emoji}</span>
              {!isOwned && (
                <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-yellow-300 backdrop-blur">
                  🔒 {t.seasonPass ? 'PASS' : 'PREMIUM'}
                </span>
              )}
              {isOwned && t.premium && (
                <span className="rounded-full bg-emerald-500/80 px-2 py-0.5 text-[10px] font-bold text-white">
                  OWNED
                </span>
              )}
            </div>

            <div className="mt-2 font-bold text-white leading-tight">{t.name}</div>
            <div className="text-[11px] text-white/60">{t.tagline}</div>

            {/* color swatches */}
            <div className="mt-2 flex gap-1">
              {Object.values(t.colors).map((c) => (
                <span key={c.hex} className="h-3 w-3 rounded-full ring-1 ring-white/40" style={{ background: c.hex }} />
              ))}
            </div>

            {!isOwned && (
              <div className="mt-2 flex items-center gap-1 text-xs font-bold text-yellow-300">
                <span>🪙 {t.price}</span>
                <span className="text-white/50 font-medium">· tap to unlock</span>
              </div>
            )}

            {isSel && (
              <div className="absolute right-2 top-2 rounded-full bg-yellow-400 px-1.5 text-xs font-black text-black">✓</div>
            )}
          </button>
        )
      })}
    </div>
  )
}

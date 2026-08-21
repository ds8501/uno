import { COLORS } from '../game/deck.js'

// Overlay shown when a human plays a wild card and must pick the next color.
export default function ColorPicker({ theme, onPick }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="animate-pop rounded-3xl bg-slate-900 p-6 ring-1 ring-white/15">
        <h3 className="mb-4 text-center text-lg font-extrabold text-white">Pick a color</h3>
        <div className="grid grid-cols-2 gap-3">
          {COLORS.map((c) => {
            const col = theme.colors[c]
            return (
              <button
                key={c}
                onClick={() => onPick(c)}
                style={{ background: col.hex }}
                className="flex h-24 w-24 flex-col items-center justify-center rounded-2xl font-black text-white shadow-lg ring-2 ring-white/50 transition hover:scale-110"
              >
                <span className="text-3xl">{col.icon}</span>
                <span className="mt-1 text-xs">{col.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

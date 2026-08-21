import Card from './Card.jsx'

// An opponent around the table: avatar, name, face-down card count, turn glow,
// UNO badge, and any floating emote bubble.
export default function PlayerSeat({ player, theme, isCurrent, emote }) {
  const count = player.hand.length
  const fan = Math.min(count, 5)

  return (
    <div className="relative flex flex-col items-center gap-1">
      {emote && (
        <div className="animate-emote pointer-events-none absolute -top-6 z-20 text-3xl">{emote}</div>
      )}

      {/* mini face-down fan */}
      <div className="flex -space-x-6">
        {Array.from({ length: fan }).map((_, i) => (
          <Card key={i} faceDown size="sm" theme={theme} style={{ transform: `rotate(${(i - (fan - 1) / 2) * 6}deg)` }} />
        ))}
      </div>

      <div
        className={`mt-1 flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold backdrop-blur transition
          ${isCurrent ? 'bg-yellow-400 text-black animate-turn' : 'bg-black/40 text-white'}`}
      >
        <span className="text-lg">{player.avatar}</span>
        <span className="max-w-[80px] truncate">{player.name}</span>
        <span className={`rounded-full px-1.5 text-xs ${isCurrent ? 'bg-black/20' : 'bg-white/15'}`}>{count}</span>
      </div>

      {count === 1 && (
        <div className="absolute -bottom-3 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white shadow animate-pop">
          UNO!
        </div>
      )}
    </div>
  )
}

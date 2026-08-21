import { cardLabel, isWild } from '../game/deck.js'

// A single UNO card. `theme` recolors it. `faceDown` renders the back.
// `size` = 'sm' | 'md' | 'lg'. `playable`/`dimmed` drive interactivity styling.
export default function Card({
  card,
  theme,
  faceDown = false,
  size = 'md',
  playable = false,
  dimmed = false,
  highlight = false,
  onClick,
  style,
}) {
  const dims = {
    sm: 'w-10 h-14 text-base rounded-md',
    md: 'w-16 h-24 text-2xl rounded-lg',
    lg: 'w-24 h-36 text-4xl rounded-xl',
  }[size]

  if (faceDown) {
    return (
      <div
        className={`${dims} relative shrink-0 border-2 border-white/20 bg-gradient-to-br from-slate-800 to-slate-950 shadow-lg flex items-center justify-center overflow-hidden`}
        style={style}
      >
        <div className="absolute inset-1 rounded-[inherit] border border-white/10" />
        <span
          className="font-black tracking-tighter -rotate-12 select-none"
          style={{ color: theme?.accent || '#facc15' }}
        >
          UNO
        </span>
      </div>
    )
  }

  const wild = isWild(card)
  const face = wild ? '#1e1e24' : theme.colors[card.color].hex
  const label = cardLabel(card)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{ background: face, ...style }}
      className={`${dims} relative shrink-0 border-2 border-white/70 shadow-lg flex items-center justify-center font-black text-white select-none
        transition-transform duration-150
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        ${playable ? 'hover:-translate-y-3 hover:shadow-2xl ring-2 ring-yellow-300/90' : ''}
        ${dimmed ? 'opacity-40 saturate-50' : ''}
        ${highlight ? 'animate-pop' : ''}`}
    >
      {/* white oval center */}
      <span className="absolute inset-2 rounded-[50%] bg-white/15" />
      {wild ? (
        <WildGlyph small={size === 'sm'} />
      ) : (
        <>
          <span className="absolute top-1 left-1.5 text-[0.6em] leading-none drop-shadow">{label}</span>
          <span className="relative drop-shadow-[0_2px_2px_rgba(0,0,0,0.4)]">{label}</span>
          <span className="absolute bottom-1 right-1.5 text-[0.6em] leading-none rotate-180 drop-shadow">{label}</span>
        </>
      )}
    </button>
  )
}

// Four-color wheel for wild cards.
function WildGlyph({ small }) {
  const s = small ? 'w-5 h-5' : 'w-9 h-9'
  return (
    <span className={`relative ${s} rounded-full overflow-hidden rotate-45 shadow-inner`}>
      <span className="absolute top-0 left-0 w-1/2 h-1/2 bg-red-500" />
      <span className="absolute top-0 right-0 w-1/2 h-1/2 bg-yellow-400" />
      <span className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-green-500" />
      <span className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-blue-500" />
    </span>
  )
}

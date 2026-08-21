import { useEffect, useRef, useState } from 'react'
import { EMOTES, QUICK_CHATS } from '../data/emotes.js'

// In-room chat with quick-chat lines and emote buttons.
// `messages` = [{ id, name, avatar, text, system }]. `onSend(text)`, `onEmote(emoji)`.
export default function Chat({ messages, onSend, onEmote, compact = false }) {
  const [text, setText] = useState('')
  const [tab, setTab] = useState('chat') // 'chat' | 'quick' | 'emote'
  const scroller = useRef(null)

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = () => {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText('')
  }

  return (
    <div className="flex h-full flex-col rounded-2xl bg-black/30 ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-center gap-1 border-b border-white/10 p-2 text-xs font-bold">
        {['chat', 'quick', 'emote'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 capitalize transition ${
              tab === t ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            {t === 'emote' ? '😀 Emotes' : t === 'quick' ? '⚡ Quick' : '💬 Chat'}
          </button>
        ))}
      </div>

      <div ref={scroller} className="no-scrollbar flex-1 space-y-1.5 overflow-y-auto p-3 text-sm">
        {messages.length === 0 && (
          <p className="text-center text-xs text-white/40">Say hi 👋</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.system ? 'text-center text-[11px] text-white/40' : ''}>
            {m.system ? (
              <span>{m.text}</span>
            ) : (
              <span>
                <span className="mr-1">{m.avatar}</span>
                <span className="font-bold text-yellow-300">{m.name}:</span>{' '}
                <span className="text-white/90">{m.text}</span>
              </span>
            )}
          </div>
        ))}
      </div>

      {tab === 'chat' && (
        <div className="flex gap-2 border-t border-white/10 p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            maxLength={120}
            placeholder="Type a message…"
            className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/40 focus:bg-white/15"
          />
          <button onClick={send} className="shrink-0 rounded-lg bg-yellow-400 px-3 font-bold text-black">
            ➤
          </button>
        </div>
      )}

      {tab === 'quick' && (
        <div className="grid grid-cols-2 gap-1.5 border-t border-white/10 p-2">
          {QUICK_CHATS.map((q) => (
            <button
              key={q}
              onClick={() => onSend(q)}
              className="rounded-lg bg-white/10 px-2 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/20"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {tab === 'emote' && (
        <div className="grid grid-cols-4 gap-1.5 border-t border-white/10 p-2">
          {EMOTES.map((e) => (
            <button
              key={e.id}
              onClick={() => onEmote(e.emoji)}
              title={e.label}
              className="rounded-lg bg-white/10 py-2 text-2xl transition hover:bg-white/20 hover:scale-110"
            >
              {e.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

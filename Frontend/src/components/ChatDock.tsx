import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { api, type ChatLink, type ChatMessage } from '../api/client'

type DockMessage = ChatMessage & {
  links?: ChatLink[]
  provider?: string
  health?: string | null
}

const NODE_CHIPS = [
  'Node 1477',
  'Why is it critical?',
  'Where should it go?',
]

const HELP_CHIPS = [
  'How does ComputePulse work?',
  'List all features',
  'How do I run the demo?',
  'What is Warnings?',
]

function renderReply(text: string) {
  // Lightweight markdown-ish: **bold**, line breaks, bullets
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const html = line
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^_(.+)_$/, '<em>$1</em>')
    if (!line.trim()) return <br key={`br-${i}`} />
    if (line.trimStart().startsWith('- ')) {
      return (
        <div
          key={`li-${i}`}
          className="chat-dock-li"
          dangerouslySetInnerHTML={{
            __html: `• ${html.replace(/^\s*-\s*/, '')}`,
          }}
        />
      )
    }
    if (/^\d+\.\s/.test(line.trim())) {
      return (
        <div
          key={`ol-${i}`}
          className="chat-dock-li"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )
    }
    return (
      <p
        key={`p-${i}`}
        className="chat-dock-p"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  })
}

export function ChatDock() {
  const { seed, critical, watch } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<DockMessage[]>([
    {
      role: 'assistant',
      content:
        'I am ComputePulse Advisor. Ask about a **node number** (status, why critical/watch/healthy, safer hosts), or how to use any feature.',
      provider: 'Template',
    },
  ])
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, busy])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim()
      if (!message || busy) return
      setError(null)
      setInput('')
      const history: ChatMessage[] = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }))

      setMessages((prev) => [...prev, { role: 'user', content: message }])
      setBusy(true)
      try {
        const res = await api.chat({
          message,
          history,
          seed,
          critical,
          watch,
        })
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: res.reply,
            links: res.links,
            health: res.health,
            provider: res.llm_used
              ? 'Groq'
              : 'Template',
          },
        ])
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Chat failed'
        setError(msg)
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              'I could not reach the advisor API. Check that the backend is running, then try again.',
            provider: 'Error',
          },
        ])
      } finally {
        setBusy(false)
      }
    },
    [busy, critical, messages, seed, watch],
  )

  return (
    <div className="chat-dock">
      {open ? (
        <div className="chat-dock-panel" role="dialog" aria-label="ComputePulse Advisor">
          <header className="chat-dock-head">
            <div>
              <strong>Advisor</strong>
              <span>Nodes · features · how-to</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>

          <div className="chat-dock-chips" aria-label="Suggestions">
            <span className="chat-dock-chip-label">Nodes</span>
            {NODE_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className="chat-dock-chip"
                disabled={busy}
                onClick={() => void send(c)}
              >
                {c}
              </button>
            ))}
            <span className="chat-dock-chip-label">Help</span>
            {HELP_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className="chat-dock-chip"
                disabled={busy}
                onClick={() => void send(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="chat-dock-messages">
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`chat-dock-bubble chat-dock-${m.role}`}
              >
                {m.role === 'assistant' ? (
                  <div className="chat-dock-meta">
                    <Sparkles size={12} />
                    {m.provider ?? 'Advisor'}
                    {m.health ? ` · ${m.health}` : ''}
                  </div>
                ) : null}
                <div className="chat-dock-body">
                  {m.role === 'assistant'
                    ? renderReply(m.content)
                    : m.content}
                </div>
                {m.links && m.links.length > 0 ? (
                  <div className="chat-dock-links">
                    {m.links.slice(0, 8).map((link) => (
                      <button
                        key={`${link.path}-${link.label}`}
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          navigate(link.path)
                          setOpen(false)
                        }}
                      >
                        Open {link.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? (
              <div className="chat-dock-bubble chat-dock-assistant">
                <div className="chat-dock-meta">Thinking…</div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {error ? (
            <p className="chat-dock-error" role="alert">
              {error}
            </p>
          ) : null}

          <form
            className="chat-dock-compose"
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a node or a feature…"
              disabled={busy}
              aria-label="Chat message"
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        className="chat-dock-toggle btn btn-primary"
        aria-expanded={open}
        aria-label={open ? 'Close advisor chat' : 'Open advisor chat'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />}
        <span>{open ? 'Close' : 'Advisor'}</span>
      </button>
    </div>
  )
}

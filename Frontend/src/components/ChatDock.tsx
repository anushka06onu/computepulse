import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageCircle,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import {
  api,
  type ChatLink,
  type ChatMessage,
  type ChatResponse,
} from '../api/client'

type ChatRecommendation = NonNullable<ChatResponse['recommendation']>

type DockMessage = ChatMessage & {
  links?: ChatLink[]
  recommendation?: ChatRecommendation | null
  provider?: string
  health?: string | null
}

const STARTER_SUGGESTIONS = [
  'Node 1477',
  'Why is it critical?',
  'Where should it go?',
  'How does ComputePulse work?',
  'How do I run the demo?',
  'What is Warnings?',
]

const FOLLOW_UPS_DEFAULT = [
  'List all features',
  'How do I run the demo?',
  'What is Warnings?',
  'Node 1477',
]

function followUpsFor(content: string, hasNodeReco: boolean): string[] {
  const text = content.toLowerCase()
  if (hasNodeReco) {
    return [
      'Why is it critical?',
      'Where should it go?',
      'Open Job Placement',
      'What is Warnings?',
    ].filter((s) => !text.includes(s.toLowerCase().slice(0, 12)))
  }
  if (text.includes('demo') || text.includes('playbook')) {
    return [
      'What is Warnings?',
      'How does Job Placement work?',
      'List all features',
      'Node 1477',
    ]
  }
  if (text.includes('warning')) {
    return [
      'How do I run the demo?',
      'Where should it go?',
      'List all features',
      'Node 1477',
    ]
  }
  if (text.includes('feature') || text.includes('computepulse work')) {
    return [
      'How do I run the demo?',
      'What is Warnings?',
      'What is Job Placement?',
      'Node 1477',
    ]
  }
  return FOLLOW_UPS_DEFAULT
}

const SAFE_PATH = /^\/(app\/[\w\-./]*|)$/

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatInline(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^_(.+)_$/, '<em>$1</em>')
}

/** Drop Recommend prose when structured recommendation card is shown. */
function stripRecommendBlock(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let skipping = false
  for (const line of lines) {
    if (/^\*\*Recommend:\*\*/i.test(line.trim()) || /^Recommend:/i.test(line.trim())) {
      skipping = true
      continue
    }
    if (skipping) {
      // Continue skip through bullet list / blank lines until next **Section:**
      if (/^\*\*[A-Za-z]/.test(line.trim()) && !/^\*\*Recommend/i.test(line.trim())) {
        skipping = false
        out.push(line)
      }
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function renderReply(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const escaped = escapeHtml(line)
    const html = formatInline(escaped)
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

function isSafePath(path: string): boolean {
  return SAFE_PATH.test(path)
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
        'Hi — I am the ComputePulse Advisor. Ask about any **node** (status, risk drivers, safer hosts) or how to use a feature. Pick a suggestion below to get started.',
      provider: 'Template',
    },
  ])
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open, busy])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const go = useCallback(
    (path: string) => {
      if (!isSafePath(path)) return
      navigate(path)
      setOpen(false)
      toggleRef.current?.focus()
    },
    [navigate],
  )

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
            recommendation: res.recommendation,
            health: res.health,
            provider: res.llm_used ? 'Groq' : 'Template',
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
        <div
          ref={panelRef}
          className="chat-dock-panel"
          role="dialog"
          aria-modal="true"
          aria-label="ComputePulse Advisor"
        >
          <header className="chat-dock-head">
            <div className="chat-dock-head-id">
              <span className="chat-dock-avatar" aria-hidden>
                <Sparkles size={16} strokeWidth={2.25} />
              </span>
              <div className="chat-dock-head-copy">
                <strong>ComputePulse Advisor</strong>
                <p className="chat-dock-head-status">
                  <span className="chat-dock-status-dot" aria-hidden />
                  Ready to help
                </p>
              </div>
            </div>
            <button
              type="button"
              className="chat-dock-close"
              aria-label="Close chat"
              onClick={() => {
                setOpen(false)
                toggleRef.current?.focus()
              }}
            >
              <X size={15} strokeWidth={2.25} />
            </button>
          </header>

          <div className="chat-dock-messages">
            {messages.map((m, i) => {
              const reco = m.recommendation
              const hasReco =
                !!reco &&
                ((reco.candidates && reco.candidates.length > 0) ||
                  (reco.target_node_ids && reco.target_node_ids.length > 0))
              const bodyText =
                m.role === 'assistant' && hasReco
                  ? stripRecommendBlock(m.content)
                  : m.content
              const recoIds = new Set(
                (reco?.candidates?.map((c) => c.node_id) ??
                  reco?.target_node_ids ??
                  []).map(Number),
              )
              const extraLinks = (m.links ?? []).filter((link) => {
                const match = link.path.match(/\/nodes\/(\d+)/)
                if (match && recoIds.has(Number(match[1]))) return false
                return isSafePath(link.path)
              })
              const isLatestAssistant =
                m.role === 'assistant' &&
                !busy &&
                i === messages.length - 1
              const tips = isLatestAssistant
                ? messages.length <= 1
                  ? STARTER_SUGGESTIONS
                  : followUpsFor(m.content, hasReco)
                : []

              return (
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
                      ? renderReply(bodyText)
                      : m.content}
                  </div>
                  {hasReco && reco ? (
                    <div className="chat-dock-recommend">
                      <strong className="chat-dock-recommend-title">
                        Recommendation
                      </strong>
                      {reco.why ? (
                        <p className="chat-dock-recommend-why">{reco.why}</p>
                      ) : null}
                      <ul className="chat-dock-recommend-list">
                        {(reco.candidates && reco.candidates.length > 0
                          ? reco.candidates.slice(0, 5)
                          : (reco.target_node_ids ?? []).slice(0, 5).map((id) => ({
                              node_id: id,
                              placement_score: 0,
                              fused_risk: 0,
                              why: '',
                            }))
                        ).map((c) => (
                          <li key={c.node_id}>
                            <div className="chat-dock-recommend-row">
                              <div>
                                <span className="chat-dock-recommend-node">
                                  Node {c.node_id}
                                </span>
                                {c.placement_score ? (
                                  <span className="chat-dock-recommend-meta">
                                    score {c.placement_score}
                                    {c.fused_risk != null
                                      ? ` · fused ${c.fused_risk}%`
                                      : ''}
                                  </span>
                                ) : null}
                                {c.why ? (
                                  <span className="chat-dock-recommend-reason">
                                    {c.why}
                                  </span>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => go(`/app/nodes/${c.node_id}`)}
                              >
                                Open
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {extraLinks.length > 0 ? (
                    <div className="chat-dock-links">
                      {extraLinks.slice(0, 8).map((link) => (
                        <button
                          key={`${link.path}-${link.label}`}
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => go(link.path)}
                        >
                          Open {link.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {tips.length > 0 ? (
                    <div
                      className="chat-dock-followups"
                      aria-label="Suggested next questions"
                    >
                      <span className="chat-dock-followups-label">
                        Suggested next
                      </span>
                      <div className="chat-dock-followups-row">
                        {tips.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="chat-dock-chip"
                            disabled={busy}
                            onClick={() => {
                              if (c === 'Open Job Placement') {
                                go('/app/placement')
                                return
                              }
                              void send(c)
                            }}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {busy ? (
              <div className="chat-dock-bubble chat-dock-assistant">
                <div className="chat-dock-typing" aria-label="Advisor is typing">
                  <span />
                  <span />
                  <span />
                </div>
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
        ref={toggleRef}
        type="button"
        className={`chat-dock-toggle${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-label={open ? 'Close advisor chat' : 'Open advisor chat'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chat-dock-toggle-icon" aria-hidden>
          {open ? <X size={17} strokeWidth={2.25} /> : <MessageCircle size={17} strokeWidth={2.25} />}
        </span>
        <span className="chat-dock-toggle-label">
          {open ? 'Close' : 'Advisor'}
        </span>
      </button>
    </div>
  )
}


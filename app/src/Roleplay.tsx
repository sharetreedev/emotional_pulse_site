import React, { type FormEvent, useRef, useState } from 'react'
import { Conversation } from '@elevenlabs/client'
import './Roleplay.css'

type Message = {
  id: string
  role: 'agent' | 'user'
  text: string
  isAssessmentFeedback?: boolean
}

type AppStatus = 'idle' | 'connecting' | 'connected' | 'error'

const KNOWN_CHARACTERS = ['Alex', 'Jordan', 'Riley', 'Sam', 'Nina', 'Daniel', 'Michael']

function extractCharacterName(text: string): string | null {
  const isConfirmation = /speak(?:ing)? with|talk(?:ing)? (?:to|with)|i(?:'ll| will) be(?: playing)?|playing|connect you with|introduce you to|you(?:'d| will| would)(?: like to)? (?:speak|talk)|here(?:'s| is) (?:Alex|Sam|Riley|Jordan|Nina|Daniel|Michael)/i.test(text)
  if (!isConfirmation) return null
  for (const name of KNOWN_CHARACTERS) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text)) return name
  }
  return null
}

function isReadyToStartMessage(text: string): boolean {
  return /are you ready|ready to (?:begin|start)|shall we begin|want to begin|ready to start|confirm.*ready|just to confirm|ready when you are/i.test(text)
}

const SCENARIO_READY = 'Scenario ready'

function CharacterCard({ text, name }: { text: string; name: string | null }) {
  const [typedName, setTypedName] = React.useState('')
  const [typedFooter, setTypedFooter] = React.useState('')

  React.useEffect(() => {
    if (!name) return
    setTypedName('')
    setTypedFooter('')
    let i = 0
    const nameInterval = setInterval(() => {
      i += 1
      setTypedName(name.slice(0, i))
      if (i >= name.length) {
        clearInterval(nameInterval)
        let j = 0
        const footerInterval = setInterval(() => {
          j += 1
          setTypedFooter(SCENARIO_READY.slice(0, j))
          if (j >= SCENARIO_READY.length) clearInterval(footerInterval)
        }, 60)
      }
    }, 80)
    return () => clearInterval(nameInterval)
  }, [name])

  return (
    <div className="character-card-wrap">
      <div className="char-card">
        <div className="char-card-header">
          <span className="char-badge">You're about to speak with</span>
        </div>
        {name && (
          <p className="char-name">
            {typedName}
            <span className="char-name-cursor" />
          </p>
        )}
        <p className="char-scenario">{text}</p>
        {typedFooter && (
          <div className="char-footer">
            <span className="char-ready-dot" />
            {typedFooter}
          </div>
        )}
      </div>
    </div>
  )
}

const NAME_PATTERN = new RegExp(`\\b(${KNOWN_CHARACTERS.join('|')})\\b`, 'g')

function boldCharacterNames(text: string): React.ReactNode {
  const parts = text.split(NAME_PATTERN)
  return parts.map((part, i) =>
    KNOWN_CHARACTERS.includes(part) ? (
      <strong key={i} className="character-name-bold">
        {part}
      </strong>
    ) : (
      part
    ),
  )
}

const FEEDBACK_SECTION_PATTERN =
  /(?:^|\n)\s*(what landed well|what to sharpen|one thing to try(?: next time)?)\s*[:\-–—]\s*/gi

const WRITTEN_NUMBER_PATTERN =
  /\b(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|Twenty)\.\s+/gi

const FEEDBACK_OUTRO_PATTERN =
  /that's the end of the session.*?take what's useful\.?/i

type ParsedFeedback = {
  intro: string
  items: string[]
  outro?: string
}

function isFeedbackMessage(text: string): boolean {
  return /what landed well|what to sharpen|try next time|how it went|here'?s (?:my )?feedback|walk you through|great work today|nice work today|well done today|that's the end of the session/i.test(
    text,
  )
}

function isAssessmentPromptMessage(text: string): boolean {
  return /that'?s the end of the roleplay|end of the roleplay|role[- ]?play assessment|check your (?:role[- ]?play )?assessment/i.test(
    text,
  )
}

function parseWrittenNumberBullets(text: string, minItems = 2): ParsedFeedback | null {
  const matches = [...text.matchAll(new RegExp(WRITTEN_NUMBER_PATTERN.source, 'gi'))]
  if (matches.length < minItems) return null

  const intro = text.slice(0, matches[0].index ?? 0).trim()
  const items = matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length
      const end = matches[index + 1]?.index ?? text.length
      return text.slice(start, end).trim()
    })
    .filter(Boolean)

  if (items.length < minItems) return null

  let outro: string | undefined
  const lastItem = items[items.length - 1]
  const outroMatch = lastItem.match(FEEDBACK_OUTRO_PATTERN)
  if (outroMatch) {
    outro = outroMatch[0].trim()
    items[items.length - 1] = lastItem.replace(FEEDBACK_OUTRO_PATTERN, '').trim()
  }

  return { intro, items: items.filter(Boolean), outro }
}

function parseFeedbackBullets(text: string, force = false): ParsedFeedback | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const writtenNumbers = parseWrittenNumberBullets(trimmed, force ? 1 : 2)
  if (writtenNumbers) return writtenNumbers

  const sectionMatches = [...trimmed.matchAll(FEEDBACK_SECTION_PATTERN)]
  if (sectionMatches.length >= 2) {
    const items: string[] = []
    const intro = trimmed.slice(0, sectionMatches[0].index ?? 0).trim()

    sectionMatches.forEach((match, index) => {
      const label = match[1]
      const start = (match.index ?? 0) + match[0].length
      const end = sectionMatches[index + 1]?.index ?? trimmed.length
      const body = trimmed.slice(start, end).trim()
      items.push(`${label}: ${body}`)
    })

    return { intro, items }
  }

  const lines = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const items: string[] = []
  const introLines: string[] = []

  for (const line of lines) {
    const bulletMatch = line.match(/^(?:[-•*●]|\d+[.)])\s+(.+)$/)
    if (bulletMatch) {
      items.push(bulletMatch[1].trim())
      continue
    }

    if (items.length === 0) {
      introLines.push(line)
      continue
    }

    items[items.length - 1] += ` ${line}`
  }

  if (items.length >= 2) {
    return { intro: introLines.join(' '), items }
  }

  if (isFeedbackMessage(trimmed)) {
    const inlineItems = trimmed.match(/(?:^|\s)(?:[-•*●]|\d+[.)])\s+[^•\n]+/g)
    if (inlineItems && inlineItems.length >= 2) {
      return {
        intro: introLines.join(' '),
        items: inlineItems.map((item) => item.replace(/^\s*(?:[-•*●]|\d+[.)])\s+/, '').trim()),
      }
    }
  }

  if (force && trimmed) {
    return { intro: '', items: [trimmed] }
  }

  return null
}

const FEEDBACK_ITEM_COLORS = ['#91A27D', '#7a8a68', '#d08a6e', '#ca501c', '#9b9d93']

function FeedbackCard({ text }: { text: string }) {
  const feedback = parseFeedbackBullets(text, true)

  return (
    <div className="feedback-card-wrap">
      <div className="feedback-card">
        <div className="feedback-card-header">
          <span className="feedback-card-badge">Role-play assessment</span>
        </div>
        {feedback?.intro && <p className="feedback-intro">{boldCharacterNames(feedback.intro)}</p>}
        <ul className="feedback-list">
          {(feedback?.items ?? [text]).map((item, index) => (
            <li
              key={index}
              className="feedback-list-item"
              style={
                { '--item-accent': FEEDBACK_ITEM_COLORS[index % FEEDBACK_ITEM_COLORS.length] } as React.CSSProperties
              }
            >
              <span className="feedback-item-number">{index + 1}</span>
              <span className="feedback-item-text">{boldCharacterNames(item)}</span>
            </li>
          ))}
        </ul>
        {feedback?.outro && <p className="feedback-outro">{boldCharacterNames(feedback.outro)}</p>}
      </div>
    </div>
  )
}

export type RoleplayProps = {
  agentId: string
  title?: string
  subtitle?: string
}

export default function Roleplay({ agentId, title = 'Roleplay Practice', subtitle }: RoleplayProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [composerValue, setComposerValue] = useState('')
  const [appStatus, setAppStatus] = useState<AppStatus>('idle')
  const [sessionStarted, setSessionStarted] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [greetingReceived, setGreetingReceived] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [characterIntroMsgId, setCharacterIntroMsgId] = useState<string | null>(null)
  const [activeCharacter, setActiveCharacter] = useState<string | null>(null)
  const [isMicMuted, setIsMicMuted] = useState(true)
  const [sessionEndReason, setSessionEndReason] = useState<'user' | 'agent' | null>(null)
  const [showHint, setShowHint] = useState(false)

  const convRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const greetingReceivedRef = useRef(false)
  const userMessageCountRef = useRef(0)
  const agentMessageCountRef = useRef(0)
  const userEndedRef = useRef(false)
  const assessmentPromptPendingRef = useRef(false)
  const awaitingFeedbackRef = useRef(false)
  const feedbackMsgIdRef = useRef<string | null>(null)

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
  }

  const appendMessage = (
    role: 'agent' | 'user',
    text: string,
    id?: string,
    meta?: Pick<Message, 'isAssessmentFeedback'>,
  ) => {
    const msgId = id ?? `${role}-${Date.now()}`
    setMessages((prev) => {
      const exists = prev.find((m) => m.id === msgId)
      if (exists) {
        return prev.map((m) =>
          m.id === msgId
            ? { ...m, text, isAssessmentFeedback: m.isAssessmentFeedback || meta?.isAssessmentFeedback }
            : m,
        )
      }
      return [...prev, { id: msgId, role, text, ...meta }]
    })
    scrollToBottom()
  }

  const startSession = async () => {
    setSessionStarted(true)
    setAppStatus('connecting')
    try {
      const conv = await Conversation.startSession({
        agentId,
        onConnect: () => {
          setAppStatus('connected')
          try {
            convRef.current?.setMicMuted(true)
          } catch {
            /* ignore */
          }
        },
        onDisconnect: () => {
          setAppStatus('idle')
          setIsSpeaking(false)
          setIsMicMuted(true)
          if (!userEndedRef.current) {
            setSessionEndReason('user')
            setSessionEnded(true)
          }
        },
        onError: (msg) => {
          setAppStatus('error')
          appendMessage('agent', `Connection error: ${msg}`)
        },
        onModeChange: ({ mode }) => setIsSpeaking(mode === 'speaking'),
        onMessage: ({ message, role }) => {
          if (role === 'agent') {
            agentMessageCountRef.current += 1
            const isFirst = !greetingReceivedRef.current
            if (isFirst) {
              greetingReceivedRef.current = true
              setGreetingReceived(true)
              appendMessage('agent', message, 'agent-greeting')
            } else {
              const isAssessmentFeedback = awaitingFeedbackRef.current
              if (isAssessmentFeedback) awaitingFeedbackRef.current = false

              let msgId: string
              if (isAssessmentFeedback) {
                if (!feedbackMsgIdRef.current) feedbackMsgIdRef.current = `agent-feedback-${Date.now()}`
                msgId = feedbackMsgIdRef.current
              } else {
                feedbackMsgIdRef.current = null
                msgId = `agent-${Date.now()}`
              }

              if (isAssessmentPromptMessage(message)) {
                assessmentPromptPendingRef.current = true
              }

              const detectedName = extractCharacterName(message)
              if (detectedName) setActiveCharacter(detectedName)
              if (isReadyToStartMessage(message)) {
                setCharacterIntroMsgId((prev) => prev ?? msgId)
              }
              appendMessage('agent', message, msgId, { isAssessmentFeedback })
            }
          } else if (role === 'user' && message.trim()) {
            if (assessmentPromptPendingRef.current) {
              assessmentPromptPendingRef.current = false
              awaitingFeedbackRef.current = true
            }
            appendMessage('user', message, `user-voice-${Date.now()}`)
          }
          scrollToBottom()
        },
      })
      convRef.current = conv
    } catch (err) {
      setAppStatus('error')
      appendMessage(
        'agent',
        `Could not connect: ${err instanceof Error ? err.message : 'Please refresh and try again.'}`,
      )
    }
  }

  const toggleMic = () => {
    if (!convRef.current) return
    const newMuted = !isMicMuted
    try {
      convRef.current.setMicMuted(newMuted)
    } catch {
      /* ignore */
    }
    setIsMicMuted(newMuted)
  }

  const endSession = async () => {
    userEndedRef.current = true
    setSessionEndReason('user')
    if (convRef.current) {
      try {
        await convRef.current.endSession()
      } catch {
        /* ignore */
      }
      convRef.current = null
    }
    setIsSpeaking(false)
    setIsMicMuted(true)
    setAppStatus('idle')
    setSessionEnded(true)
  }

  const restartSession = () => {
    setMessages([])
    setComposerValue('')
    setSessionStarted(false)
    setSessionEnded(false)
    setGreetingReceived(false)
    setCharacterIntroMsgId(null)
    setActiveCharacter(null)
    greetingReceivedRef.current = false
    userMessageCountRef.current = 0
    agentMessageCountRef.current = 0
    setIsSpeaking(false)
    setIsMicMuted(true)
    setSessionEndReason(null)
    userEndedRef.current = false
    assessmentPromptPendingRef.current = false
    awaitingFeedbackRef.current = false
    feedbackMsgIdRef.current = null
    setAppStatus('idle')
  }

  const sendMessage = () => {
    const text = composerValue.trim()
    if (!text || !convRef.current) return
    if (assessmentPromptPendingRef.current) {
      assessmentPromptPendingRef.current = false
      awaitingFeedbackRef.current = true
    }
    userMessageCountRef.current += 1
    appendMessage('user', text)
    setComposerValue('')
    convRef.current.sendUserMessage(text)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    sendMessage()
  }

  const inputLocked = !greetingReceived || appStatus !== 'connected' || sessionEnded

  return (
    <div className="rp-shell">
      <main className={`chat-card${activeCharacter ? ` char-${activeCharacter.toLowerCase()}` : ''}`}>
        <header className="chat-header">
          <div className={`agent-orb ${isSpeaking ? 'speaking' : ''}`}>
            <div className="orb-core" />
            <div className="orb-ring ring-1" />
            <div className="orb-ring ring-2" />
            <div className="orb-ring ring-3" />
          </div>
          <div className="header-text">
            <h1>{title}</h1>
            {subtitle && <p className="header-sub">{subtitle}</p>}
          </div>
          <div className="header-actions">
            {sessionStarted && !sessionEnded && appStatus === 'connected' && (
              <button
                type="button"
                className={`mic-button ${isMicMuted ? 'muted' : 'active'}`}
                onClick={toggleMic}
                aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
                title={isMicMuted ? 'Unmute mic' : 'Mute mic'}
              >
                {isMicMuted ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </button>
            )}
            {sessionStarted && !sessionEnded && (appStatus === 'connected' || appStatus === 'connecting') && (
              <button
                type="button"
                className="end-button"
                onClick={() => void endSession()}
                aria-label="End session"
                title="End session"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                End
              </button>
            )}
            <div className="status-badge">
              {appStatus === 'connecting' && (
                <span className="badge connecting">
                  <span className="badge-dot" />
                  Connecting
                </span>
              )}
              {appStatus === 'connected' && (
                <span className="badge connected">
                  <span className="badge-dot pulse" />
                  Live
                </span>
              )}
              {appStatus === 'error' && <span className="badge error">Error</span>}
              {sessionEnded && <span className="badge ended">Ended</span>}
            </div>
          </div>
        </header>

        {!sessionStarted ? (
          <div className="start-screen">
            <div className="start-orb-wrap" aria-hidden="true">
              <div className="start-orb" />
              <div className="start-orb-ring r1" />
              <div className="start-orb-ring r2" />
              <div className="start-orb-ring r3" />
            </div>
            <h2 className="start-title">Ready to practise?</h2>
            <p className="start-body">
              A short voice roleplay to sharpen your Mental Health First Response skills. Your coach guides
              you through the scenario and gives you feedback at the end.
            </p>
            <button type="button" className="start-button" onClick={() => void startSession()}>
              Begin session
              <span className="start-arrow">→</span>
            </button>
          </div>
        ) : (
          <>
            <section className="chat-window" role="log" aria-live="polite">
              {messages.length === 0 && (
                <div className="chat-empty">
                  {appStatus === 'connecting' && (
                    <div className="connecting-state">
                      <div className="connecting-orb" />
                      <p>Connecting to your coach…</p>
                    </div>
                  )}
                </div>
              )}

              {(() => {
                let characterActive = false
                return messages.map((msg) => {
                  if (msg.id === characterIntroMsgId) {
                    characterActive = true
                    return <CharacterCard key={msg.id} text={msg.text} name={activeCharacter} />
                  }
                  if (msg.isAssessmentFeedback && msg.role === 'agent') {
                    return <FeedbackCard key={msg.id} text={msg.text} />
                  }
                  const applyTheme =
                    msg.role === 'agent' && characterActive && activeCharacter && !msg.isAssessmentFeedback
                  return (
                    <div key={msg.id} className={`message ${msg.role}`}>
                      {msg.role === 'agent' && (
                        <div className="msg-avatar agent-avatar">
                          <div className="mini-orb" />
                        </div>
                      )}
                      <div className={`message-bubble${applyTheme ? ` char-${activeCharacter!.toLowerCase()}` : ''}`}>
                        <p>{msg.role === 'agent' ? boldCharacterNames(msg.text) : msg.text}</p>
                      </div>
                      {msg.role === 'user' && (
                        <div className="msg-avatar user-avatar">
                          <span>MHFR</span>
                        </div>
                      )}
                    </div>
                  )
                })
              })()}

              {isSpeaking && appStatus === 'connected' && (
                <div className="message agent speaking-row">
                  <div className="msg-avatar agent-avatar">
                    <div className="mini-orb" />
                  </div>
                  <div className="speaking-indicator">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </section>

            {sessionEnded && sessionEndReason !== 'agent' && (
              <div className="ended-overlay">
                <div className="ended-icon" aria-hidden="true">
                  ✓
                </div>
                <p className="ended-title">Session complete</p>
                <p className="ended-body">
                  Your conversation has ended. You can review the transcript above or start a fresh session
                  whenever you're ready.
                </p>
                <button type="button" className="restart-button" onClick={restartSession}>
                  Start new session
                </button>
              </div>
            )}

            {sessionEnded && sessionEndReason === 'agent' && (
              <div className="agent-end-backdrop" role="dialog" aria-modal="true" aria-label="Session ended by coach">
                <div className="agent-end-modal">
                  <div className="agent-end-icon" aria-hidden="true">
                    ⚠
                  </div>
                  <p className="agent-end-title">Session ended by the coach</p>
                  <p className="agent-end-body">
                    This session was ended by the Roleplay Coach. This can happen when the conversation falls
                    outside the scope of the practice scenario — for example, if the interaction involved
                    inappropriate language, harassment, or content that cannot be supported in this training
                    environment.
                  </p>
                  <p className="agent-end-note">
                    Please review the transcript and start a new session when you're ready.
                  </p>
                  <button type="button" className="restart-button" onClick={restartSession}>
                    Start new session
                  </button>
                </div>
              </div>
            )}

            {!sessionEnded && (
              <form className="composer" onSubmit={handleSubmit}>
                <div className={`composer-inner ${!inputLocked ? 'active' : ''}`}>
                  <input
                    aria-label="Send a message"
                    placeholder={inputLocked ? 'Waiting for your coach…' : 'Type your reply…'}
                    value={composerValue}
                    onChange={(e) => setComposerValue(e.target.value)}
                    disabled={inputLocked}
                    autoFocus={greetingReceived}
                  />
                  <button
                    type="button"
                    className="hint-button"
                    onClick={() => setShowHint((v) => !v)}
                    aria-label="Show keyboard shortcuts"
                    title="Help"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </button>
                  <button
                    type="submit"
                    className="send-button"
                    disabled={inputLocked || !composerValue.trim()}
                    aria-label="Send"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>

                {showHint && (
                  <div className="hint-popup" role="dialog" aria-label="Keyboard shortcuts">
                    <button className="hint-popup-close" type="button" onClick={() => setShowHint(false)} aria-label="Close">
                      ✕
                    </button>
                    <p className="hint-popup-title">How to use</p>
                    <ul className="hint-popup-list">
                      <li>
                        <kbd>Enter</kbd> Send your message
                      </li>
                      <li>
                        <kbd>Shift + Enter</kbd> New line
                      </li>
                      <li>
                        Use the <strong>mic button</strong> in the header to unmute and speak
                      </li>
                      <li>
                        Use the <strong>End</strong> button to finish the session at any time
                      </li>
                    </ul>
                  </div>
                )}
              </form>
            )}
          </>
        )}
      </main>
    </div>
  )
}

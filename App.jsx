import { useState, useRef, useEffect } from "react"
import { sendMessage } from "./api"
import styles from "./App.module.css"

const BASE_URL = "http://localhost:8000"

function now() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

const intentMap = {
  joke:     { label: "Joke",       emoji: "😂" },
  quote:    { label: "Quote",      emoji: "✨" },
  dict:     { label: "Dictionary", emoji: "📖" },
  currency: { label: "Currency",   emoji: "💱" },
}

function intentLabel(intent) {
  const entry = intentMap[intent]
  return entry ? `${entry.emoji} ${entry.label}` : intent
}

export default function App() {
  // sessions: { [intent]: sessionId }
  const [sessions, setSessions] = useState({})

  // allMessages: { [intent]: Message[] }
  const [allMessages, setAllMessages] = useState({})

  const [activeIntent, setActiveIntent] = useState(null)
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState(null)

  const messagesRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [allMessages, isTyping, activeIntent])

  // Current visible messages
  const messages = activeIntent ? (allMessages[activeIntent] || []) : []

  // Load history from backend and switch to that chat
  async function loadChat(intent) {
    const sessionId = sessions[intent]
    if (!sessionId) return
    setError(null)

    try {
      const res = await fetch(`${BASE_URL}/history/${sessionId}`)
      if (!res.ok) throw new Error("Failed to load history")
      const data = await res.json()

      const loaded = data.messages.map((msg) => ({
        role: msg.role === "assistant" ? "bot" : msg.role,
        text: msg.content,
        intent: msg.role === "assistant" ? intent : undefined,
        time: now(),
      }))

      setAllMessages(prev => ({ ...prev, [intent]: loaded }))
      setActiveIntent(intent)
    } catch (err) {
      setError("Failed to load chat history")
    }

    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // Delete a chat session
  async function deleteChat(intent) {
    const sessionId = sessions[intent]
    if (!sessionId) return

    try {
      await fetch(`${BASE_URL}/session/${sessionId}`, { method: "DELETE" })
    } catch (_) {
      // continue even if backend delete fails
    }

    setSessions(prev => {
      const updated = { ...prev }
      delete updated[intent]
      return updated
    })

    setAllMessages(prev => {
      const updated = { ...prev }
      delete updated[intent]
      return updated
    })

    if (activeIntent === intent) {
      const remaining = Object.keys(sessions).filter(k => k !== intent)
      setActiveIntent(remaining.length > 0 ? remaining[0] : null)
    }
  }

  // Send a message
  const handleSend = async (text) => {
    if (!text.trim() || isTyping) return

    const cleanText = text.trim()
    setInput("")
    setIsTyping(true)
    setError(null)

    // Pass the existing session ID for the active intent (null = let backend create one)
    const currentSessionId = activeIntent ? (sessions[activeIntent] ?? null) : null

    // Optimistically add user message to current view
    const userMsg = { role: "user", text: cleanText, time: now() }
    const pendingKey = activeIntent || "__pending__"

    setAllMessages(prev => ({
      ...prev,
      [pendingKey]: [...(prev[pendingKey] || []), userMsg],
    }))

    try {
      const data = await Promise.race([
        sendMessage(currentSessionId, cleanText),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Request timed out. Is Ollama running?")),
            30000
          )
        ),
      ])

      const detectedIntent = data.intent
      const sessionId = data.session_id

      // Save session ID for this intent
      setSessions(prev => ({ ...prev, [detectedIntent]: sessionId }))

      const botMsg = {
        role: "bot",
        text: data.response,
        intent: detectedIntent,
        time: now(),
      }

      setAllMessages(prev => {
        const updated = { ...prev }

        // Move pending messages to the detected intent bucket
        if (pendingKey === "__pending__") {
          const pending = updated["__pending__"] || []
          updated[detectedIntent] = [
            ...(updated[detectedIntent] || []),
            ...pending,
            botMsg,
          ]
          delete updated["__pending__"]
        } else if (pendingKey !== detectedIntent) {
          // Intent switched mid-conversation — unlikely but handled
          const moved = updated[pendingKey] || []
          updated[detectedIntent] = [
            ...(updated[detectedIntent] || []),
            ...moved,
            botMsg,
          ]
          delete updated[pendingKey]
        } else {
          updated[detectedIntent] = [
            ...(updated[detectedIntent] || []),
            botMsg,
          ]
        }

        return updated
      })

      setActiveIntent(detectedIntent)

    } catch (e) {
      console.error(e)
      setError(e.message || "Something went wrong.")

      // Roll back the optimistic user message
      setAllMessages(prev => {
        const updated = { ...prev }
        const msgs = updated[pendingKey] || []
        if (msgs.length > 0) {
          updated[pendingKey] = msgs.slice(0, -1)
        }
        return updated
      })
    } finally {
      setIsTyping(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend(input)
    }
  }

  const chatIntents = Object.keys(sessions)

  return (
    <div className={styles.shell}>
      <div className={styles.app}>

        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <p className={styles.sidebarTitle}>Chats</p>
            <p className={styles.sidebarSub}>Auto-detected by AI</p>
          </div>

          <div className={styles.chatList}>
            {chatIntents.length === 0 ? (
              <p className={styles.emptyHint}>Send a message to start</p>
            ) : (
              chatIntents.map((intent) => (
                <div
                  key={intent}
                  className={`${styles.chatItem} ${activeIntent === intent ? styles.activeChatItem : ""}`}
                  onClick={() => loadChat(intent)}
                >
                  <span className={styles.chatItemLabel}>
                    {intentLabel(intent)}
                  </span>
                  <button
                    className={styles.deleteBtn}
                    title="Delete chat"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteChat(intent)
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Chat section */}
        <div className={styles.chatSection}>

          {/* Header */}
          <header className={styles.chatHeader}>
            <div>
              <p className={styles.headerName}>
                {activeIntent
                  ? `${intentLabel(activeIntent)} Chat`
                  : "Unifier Chat 🤖"}
              </p>
              <p className={styles.headerStatus}>
                {isTyping ? "Typing..." : "Online"}
              </p>
            </div>
          </header>

          {/* Messages */}
          <div className={styles.messages} ref={messagesRef}>
            {messages.length === 0 && !isTyping && (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>🤖</span>
                <p>Ask anything — jokes, quotes, definitions, or currency conversions</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`${styles.msgRow} ${msg.role === "user" ? styles.msgUser : styles.msgBot}`}
              >
                <div className={styles.msgAvatar}>
                  {msg.role === "bot" ? "🤖" : "U"}
                </div>
                <div>
                  {msg.intent && (
                    <p className={styles.intentTag}>
                      {intentLabel(msg.intent)}
                    </p>
                  )}
                  <div
                    className={`${styles.msgBubble} ${
                      msg.role === "user" ? styles.bubbleUser : styles.bubbleBot
                    }`}
                  >
                    {msg.text}
                  </div>
                  <p className={`${styles.msgTime} ${msg.role === "user" ? styles.timeRight : ""}`}>
                    {msg.time}
                  </p>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className={`${styles.msgRow} ${styles.msgBot}`}>
                <div className={styles.msgAvatar}>🤖</div>
                <div className={`${styles.msgBubble} ${styles.bubbleBot} ${styles.typingBubble}`}>
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                </div>
              </div>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className={styles.errorBanner}>
              ⚠️ {error}
            </div>
          )}

          {/* Input */}
          <div className={styles.inputArea}>
            <div className={styles.inputRow}>
              <textarea
                ref={inputRef}
                className={styles.inputBox}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                rows={1}
                disabled={isTyping}
              />
              <button
                className={styles.sendBtn}
                onClick={() => handleSend(input)}
                disabled={!input.trim() || isTyping}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

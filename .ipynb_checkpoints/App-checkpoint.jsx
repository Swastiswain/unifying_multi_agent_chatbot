import { useState, useRef, useEffect } from "react"
import { sendMessage } from "./api"
import styles from "./App.module.css"

function now() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

const intentMap = {
  joke: "😂 Joke",
  quote: "✨ Quote",
  dict: "📖 Dictionary",
  currency: "💱 Currency",
}

export default function App() {
  const [sessions, setSessions] = useState({})
  const [activeIntent, setActiveIntent] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState(null)

  const messagesRef = useRef(null)

  // ✅ Auto scroll
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop =
        messagesRef.current.scrollHeight
    }
  }, [messages, isTyping])

  // ✅ Delete chat
  async function deleteChat(intent) {
    const sessionId = sessions[intent]
    if (!sessionId) return

    try {
      await fetch(`http://localhost:8000/session/${sessionId}`, {
        method: "DELETE",
      })

      setSessions(prev => {
        const updated = { ...prev }
        delete updated[intent]
        return updated
      })

      if (activeIntent === intent) {
        setMessages([])
        setActiveIntent(null)
      }

    } catch (err) {
      setError("Failed to delete chat")
    }
  }

  // ✅ Load history
  async function loadChat(intent) {
    const sessionId = sessions[intent]
    if (!sessionId) return

    try {
      const res = await fetch(
        `http://localhost:8000/history/${sessionId}`
      )
      const data = await res.json()

      setMessages(
        data.messages.map((msg) => ({
          role: msg.role,
          text: msg.content,
          time: now(),
        }))
      )

      setActiveIntent(intent)
    } catch (err) {
      setError("Failed to load chat history")
    }
  }

  // ✅ Send message (FIXED)
  const handleSend = async (text) => {
    if (!text.trim()) return

    const cleanText = text.trim()

    const userMsg = {
      role: "user",
      text: cleanText,
      time: now(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput("")
    setIsTyping(true)
    setError(null)

    try {
      console.log("Sending:", cleanText)

      // 🔥 IMPORTANT FIX: pass activeIntent instead of null
      const data = await Promise.race([
        sendMessage(activeIntent, cleanText),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), 10000)
        )
      ])

      console.log("Received:", data)

      // ✅ Save session
      setSessions(prev => ({
        ...prev,
        [data.intent]: data.session_id,
      }))

      setActiveIntent(data.intent)

      const botMsg = {
        role: "bot",
        text: data.response,
        intent: data.intent,
        time: now(),
      }

      setMessages(prev => [...prev, botMsg])

    } catch (e) {
      console.error(e)
      setError(e.message || "Something went wrong.")
    } finally {
      setIsTyping(false)   // 🔥 ALWAYS RESET
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend(input)
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.app}>

        {/* Sidebar */}
        <div className={styles.sidebar}>
          <h3>Chats</h3>

          {Object.keys(sessions).map((intent) => (
            <div
              key={intent}
              className={`${styles.chatItem} ${
                activeIntent === intent ? styles.activeChat : ""
              }`}
            >
              <span onClick={() => loadChat(intent)}>
                {intentMap[intent]}
              </span>

              <button
                className={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  deleteChat(intent)
                }}
              >
                ❌
              </button>
            </div>
          ))}
        </div>

        {/* Chat Section */}
        <div className={styles.chatSection}>

          {/* Header */}
          <header className={styles.chatHeader}>
            <p className={styles.headerName}>
              {activeIntent
                ? `${intentMap[activeIntent]} Chat`
                : "Unifier Chat 🤖"}
            </p>
            <p className={styles.headerStatus}>
              {isTyping ? "Typing..." : "Online"}
            </p>
          </header>

          {/* Messages */}
          <div className={styles.messages} ref={messagesRef}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`${styles.msgRow} ${
                  msg.role === "user"
                    ? styles.msgUser
                    : styles.msgBot
                }`}
              >
                <div className={styles.msgAvatar}>
                  {msg.role === "bot" ? "🤖" : "U"}
                </div>

                <div>
                  {msg.intent && (
                    <p className={styles.intentTag}>
                      {intentMap[msg.intent]}
                    </p>
                  )}

                  <div
                    className={`${styles.msgBubble} ${
                      msg.role === "user"
                        ? styles.bubbleUser
                        : styles.bubbleBot
                    }`}
                  >
                    {msg.text}
                  </div>

                  <p className={styles.msgTime}>
                    {msg.time}
                  </p>
                </div>
              </div>
            ))}

            {/* Typing animation */}
            {isTyping && (
              <div className={`${styles.msgRow} ${styles.msgBot}`}>
                <div className={styles.msgAvatar}>🤖</div>
                <div className={`${styles.msgBubble} ${styles.typingBubble}`}>
                  <span className={styles.dot}></span>
                  <span className={styles.dot}></span>
                  <span className={styles.dot}></span>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className={styles.errorBanner}>
              {error}
            </div>
          )}

          {/* Input */}
          <div className={styles.inputArea}>
            <div className={styles.inputRow}>
              <textarea
                className={styles.inputBox}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                rows={1}
              />

              <button
                className={styles.sendBtn}
                onClick={() => handleSend(input)}
                disabled={!input.trim()}   // 🔥 FIXED (removed isTyping block)
              >
                ➤
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
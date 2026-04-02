const BASE_URL = "http://localhost:8000"

export async function createSession(botId) {
  const res = await fetch(`${BASE_URL}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot_id: botId }),
  })
  const data = await res.json()
  return data.session_id
}

export async function sendMessage(sessionId, message) {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message: message
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || "Server error")
  }

  return await res.json()
}

export async function getHistory(sessionId) {
  const res = await fetch(`${BASE_URL}/history/${sessionId}`)
  return await res.json()
}
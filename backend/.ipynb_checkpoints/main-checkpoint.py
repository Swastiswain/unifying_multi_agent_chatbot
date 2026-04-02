from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
from bots import classify_intent
from database import init_db, save_message, get_history, get_sessions, create_session
from bots import get_bot_response
import time

app = FastAPI(title="Multi-Bot Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    init_db()

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str

class NewSessionRequest(BaseModel):
    bot_id: str

@app.get("/")
def root():
    return {"status": "running", "message": "Multi-Bot Chatbot API"}

@app.get("/bots")
def list_bots():
    return {
        "bots": [
            {"id": "joke",     "name": "Joke Bot",       "desc": "Tell me a joke",   "icon": "😄"},
            {"id": "quote",    "name": "Quote Bot",       "desc": "Daily inspiration","icon": "✦"},
            {"id": "dictionary",     "name": "Dictionary Bot",  "desc": "Word meanings",    "icon": "📖"},
            {"id": "currency", "name": "Currency Bot",    "desc": "FX conversions",   "icon": "💱"},
        ]
    }

@app.post("/session")
def new_session(req: NewSessionRequest):
    session_id = create_session("unifier")
    return {"session_id": session_id}

@app.get("/history/{session_id}")
def chat_history(session_id: str):
    messages = get_history(session_id)
    if messages is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "messages": messages}

@app.get("/sessions/{bot_id}")
def bot_sessions(bot_id: str):
    sessions = get_sessions(bot_id)
    return {"bot_id": bot_id, "sessions": sessions}

@app.post("/chat")
async def chat(req: ChatRequest):
    start = time.time()

    intent = classify_intent(req.message)

    # Use existing session or create new one
    if req.session_id:
        session_id = req.session_id
    else:
        session_id = create_session(intent)

    save_message(session_id, "user", req.message)
    history = get_history(session_id)

    response = await get_bot_response(intent, req.message, history)
    save_message(session_id, "assistant", response)

    print("✅ Done | Total:", round(time.time() - start, 2), "s")

    return {
        "session_id": session_id,
        "intent": intent,
        "response": response
    }
@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    from database import delete_session as db_delete
    db_delete(session_id)
    return {"status": "deleted", "session_id": session_id}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
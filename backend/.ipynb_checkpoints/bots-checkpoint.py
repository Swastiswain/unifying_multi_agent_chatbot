import os
import asyncio
from functools import lru_cache

from transformers import pipeline
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.output_parsers import StrOutputParser

# ==============================
# 📍 CONFIG
# ==============================

BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, "intent_model")

OLLAMA_MODEL = "llama3"   # faster than llama3.2

# ==============================
# ⚡ FAST RULE-BASED INTENT (FIRST LAYER)
# ==============================

def rule_based_intent(message: str):
    msg = message.lower()

    if any(word in msg for word in ["joke", "funny", "laugh"]):
        return "joke"

    if any(word in msg for word in ["quote", "motivate", "inspire"]):
        return "quote"

    if any(word in msg for word in ["define", "meaning", "what is", "explain"]):
        return "dict"

    if any(word in msg for word in ["usd", "inr", "currency", "convert"]):
        return "currency"

    return None


# ==============================
# 🤖 LOAD ML MODEL (FALLBACK)
# ==============================

try:
    intent_classifier = pipeline(
        "text-classification",
        model=MODEL_PATH,
        tokenizer=MODEL_PATH
    )
except Exception as e:
    print("⚠️ Model load failed:", e)
    intent_classifier = None


LABEL_MAP = {
    "LABEL_0": "joke",
    "LABEL_1": "quote",
    "LABEL_2": "dict",
    "LABEL_3": "currency"
}


def classify_intent(message: str) -> str:
    # 🔥 Step 1: Try fast rule-based
    rule_intent = rule_based_intent(message)
    if rule_intent:
        return rule_intent

    # 🔥 Step 2: ML fallback
    if intent_classifier:
        result = intent_classifier(message)[0]
        label = result["label"]
        return LABEL_MAP.get(label, "joke")

    return "joke"


# ==============================
# 🧠 SYSTEM PROMPTS
# ==============================

SYSTEM_PROMPTS = {
    "joke": "You are a funny assistant. Tell short, clean jokes.",
    "quote": "You are an inspirational assistant. Give motivational quotes.",
    "dict": "You are a dictionary assistant. Explain meanings clearly in simple terms.",
    "currency": "You are a currency assistant. Give approximate conversions clearly.",
    "default": "You are a helpful assistant."
}


# ==============================
# ⚡ LLM CHAIN CACHE
# ==============================

chains = {}


@lru_cache(maxsize=4)
def build_chain(bot_id: str):
    llm = ChatOllama(
        model=OLLAMA_MODEL,
        temperature=0.7,
        base_url="http://localhost:11434"
    )

    system_prompt = SYSTEM_PROMPTS.get(bot_id, SYSTEM_PROMPTS["default"])

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder(variable_name="history"),
        ("human", "{input}")
    ])

    chain = prompt | llm | StrOutputParser()
    return chain


# ==============================
# 🚀 RESPONSE GENERATOR
# ==============================

async def get_bot_response(bot_id: str, message: str, history: list) -> str:

    # ✅ Limit history (performance)
    history = history[-5:] if history else []

    lc_history = []
    for msg in history:
        if msg["role"] == "user":
            lc_history.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            lc_history.append(AIMessage(content=msg["content"]))

    chain = build_chain(bot_id)

    try:
        # 🔥 Run blocking LLM in thread
        response = await asyncio.wait_for(
            asyncio.to_thread(
                chain.invoke,
                {
                    "input": message,
                    "history": lc_history
                }
            ),
            timeout=12
        )

        return response

    except asyncio.TimeoutError:
        return "⚠️ Server is busy. Please try again."

    except Exception as e:
        print("❌ Error:", e)
        return "⚠️ Something went wrong."


# ==============================
# 🔥 WARMUP (IMPORTANT)
# ==============================

def warmup():
    try:
        print("🔥 Warming up LLM...")
        chain = build_chain("joke")
        chain.invoke({"input": "hi", "history": []})
        print("✅ LLM Ready")
    except Exception as e:
        print("Warmup failed:", e)


warmup()
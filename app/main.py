from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker
from jose import JWTError, jwt 
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
import httpx
import os
import uuid
import json
from app.embedding import add_pdf_to_db, retrieve_context

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "mistral:latest"


#[[[[[[[[[[[[[[[[[[[[CONFIG]]]]]]]]]]]]]]]]]]]]
Database_URL = "sqlite:///./test.db"
SECRET_KEY = "superseacdfsdjfbjlnl"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

#[[[[[[[[[[[[[[[DataBase Setup]]]]]]]]]]]]]]
engine = create_engine(
    Database_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker()
app = FastAPI(title="Local LLM API", version="1.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------- Schemas --------
class ChatRequest(BaseModel):
    message: str
    system_prompt: str | None = None

class ChatResponse(BaseModel):
    response: str

# -------- Ollama Client --------
async def ask_ollama(message: str, system_prompt: str | None = None, model: str = MODEL):
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": message})

    payload = {
        "model": model,
        "messages": messages,
        "stream": False
    }
    
    timeout = httpx.Timeout(
        connect=10.0,
        read=None,  # Wait as long as needed for generation
        write=30.0,
        pool=None
    )

    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(OLLAMA_URL, json=payload)
        r.raise_for_status()
        data = r.json()
        return data["message"]["content"]

# -------- Routes ----------
@app.get("/")
def health():
    return {"Status": "StudyGPT is running"}

# -------------Chat With Ollama----------------
@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    answer = await ask_ollama(req.message, req.system_prompt)
    return {"response": answer}

# -------------Ask Question (WebSocket)----------------------
@app.websocket("/ask")
async def ask_llm(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            question = await websocket.receive_text()
            context = await retrieve_context(question)
            
            system_prompt = (
                "You are a helpful assistant for students. "
                "Use the following context to answer the question, "
                "if answer is not in context, say: 'Not Found in notes':\n\n"
                f"Context: {context}"
            )
            
            # Using the same ask_ollama logic to maintain consistency
            answer = await ask_ollama(question, system_prompt)
            await websocket.send_text(answer)
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        await websocket.send_text(f"Error: {str(e)}")
    
@app.post("/add_pdf")
async def add_pdf(file: UploadFile = File(...)):
    doc_id = str(uuid.uuid4())
    content = await file.read()
    
    async def progress_generator():
        async for progress in add_pdf_to_db(content, doc_id):
            yield json.dumps(progress) + "\n"
            
    return StreamingResponse(progress_generator(), media_type="application/x-ndjson")

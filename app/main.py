from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from db import SessionLocal, engine, Base
from jose import JWTError, jwt 
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
import httpx
import jwt
from sqlalchemy.orm import Session
from typing import List
import os
import uuid
import bcrypt
import json
from models import users
from app.embedding import add_pdf_to_db, retrieve_context
from app.config import DATABASE_URL, MODEL, OLLAMA_URL, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES

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
        try:
            r = await client.post(OLLAMA_URL, json=payload)
            r.raise_for_status()
            data = r.json()
            return data["message"]["content"]
        except httpx.ConnectError:
            print(f"Error: Could not connect to Ollama at {OLLAMA_URL}. Ensure Ollama is running.")
            return "Error: Backend could not connect to the LLM service."
        except httpx.TimeoutException:
            print(f"Error: Ollama request timed out.")
            return "Error: The LLM service took too long to respond."
        except httpx.HTTPStatusError as e:
            print(f"Error: Ollama returned an error status: {e.response.status_code}")
            return f"Error: The LLM service returned an error ({e.response.status_code})."
        except Exception as e:
            print(f"Error: An unexpected error occurred while calling Ollama: {str(e)}")
            return "Error: An unexpected error occurred in the backend."

# -------- Routes ----------
@app.get("/")
def health():
    return {"Status": "StudyGPT is running"}

# -------------Auth----------------
def verify_password(plain_password:str, hashed_password:str):
    return bcrypt.check_password_hash(hashed_password, plain_password)

def get_password_hash(password):
    return bcrypt.generate_password_hash(password)

async def create_user(username: str, email: str, password: str):
    user = users(username=username, email=email, password=get_password_hash(password))
    db = SessionLocal()
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def token_data(user : users):
    return {
        "username": user.username,
        "email": user.email,
        "id": user.id,
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    }


    

# -------------Chat With Ollama----------------
@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    answer = await ask_ollama(req.message, req.system_prompt)
    return {"response": answer}

# -------------Ask Question (WebSocket)----------------------
@app.websocket("/ask")
async def ask_llm(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connection established")
    try:
        while True:
            try:
                question = await websocket.receive_text()
                print(f"Received question: {question}")
                
                try:
                    context = await retrieve_context(question)
                except Exception as e:
                    print(f"Context retrieval failed: {str(e)}")
                    context = "" # Fallback to no context
                
                print(f"Context: {'Found' if context else 'None'}")
                
                # If the context is completely empty, don't even ask the LLM. 
                # This explicitly prevents the AI from answering using its own knowledge.
                if not context or not context.strip():
                    await websocket.send_text("Not Found in notes.")
                    print("Sent 'Not Found in notes' directly because context was empty.")
                    continue
                
                system_prompt = (
                    "You are a helpful assistant for students. "
                    "You MUST answer the question strictly using ONLY the provided context below.\n"
                    "If the exact answer is not in the context, strictly say: 'Not Found in notes'.\n\n"
                    f"Context: {context}"
                )
                
                answer = await ask_ollama(question, system_prompt)
                await websocket.send_text(answer)
                print("Answer sent successfully")
            except Exception as inner_e:
                import traceback
                error_trace = traceback.format_exc()
                print(f"Error processing message:\n{error_trace}")
                await websocket.send_text(f"Backend Error: {str(inner_e) or type(inner_e).__name__}")
    except WebSocketDisconnect:
        print("Client disconnected normally")
    except Exception as outer_e:
        print(f"WebSocket fatal error: {str(outer_e)}")
    finally:
        print("WebSocket connection closed")
    
@app.post("/add_pdf")
async def add_pdf(file: UploadFile = File(...)):
    doc_id = str(uuid.uuid4())
    content = await file.read()
    
    async def progress_generator():
        async for progress in add_pdf_to_db(content, doc_id):
            yield json.dumps(progress) + "\n"
            
    return StreamingResponse(progress_generator(), media_type="application/x-ndjson")

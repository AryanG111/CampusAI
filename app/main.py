from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Depends, HTTPException, status, Query, WebSocketException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from app.db import SessionLocal, engine, Base
from jose import JWTError, jwt 
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
import httpx
from sqlalchemy.orm import Session
from typing import List

from app.db import SessionLocal, engine, Base
from app.models import users, UserRole, ChatSession, ChatMessage
from app.embedding import add_pdf_to_db, retrieve_context, get_all_documents, delete_document
from app.config import DATABASE_URL, MODEL, OLLAMA_URL, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, TEACHER_EMAIL, TEACHER_USERNAME, TEACHER_PASSWORD

# Create database tables
Base.metadata.create_all(bind=engine)
import os
import uuid
import bcrypt
import json
app = FastAPI(title="Local LLM API", version="1.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# -------- Schemas --------
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: UserRole = UserRole.STUDENT

class UserRead(BaseModel):
    id: int
    username: str
    email: str
    role: UserRole
    
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None

class ChatRequest(BaseModel):
    message: str
    system_prompt: str | None = None
    session_id: str | None = None

class SessionCreate(BaseModel):
    title: str | None = None

class SessionRead(BaseModel):
    id: str
    title: str
    created_at: datetime
    class Config: from_attributes = True

class MessageRead(BaseModel):
    role: str
    content: str
    created_at: datetime
    class Config: from_attributes = True

class ChatResponse(BaseModel):
    response: str

class DocUpdate(BaseModel):
    doc_name: str

# -------- Ollama Client --------
async def ask_ollama_stream(message: str, system_prompt: str | None = None, history: List[dict] | None = None, model: str = MODEL):
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": message})

    payload = {
        "model": model,
        "messages": messages,
        "stream": True
    }
    
    timeout = httpx.Timeout(
        connect=10.0,
        read=None,
        write=30.0,
        pool=None
    )

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            async with client.stream("POST", OLLAMA_URL, json=payload) as response:
                if response.status_code != 200:
                    await response.aread()
                    raise Exception(f"HTTP {response.status_code}: {response.text}")
                async for chunk in response.aiter_lines():
                    if chunk:
                        try:
                            data = json.loads(chunk)
                            if "message" in data and "content" in data["message"]:
                                yield data["message"]["content"]
                        except json.JSONDecodeError:
                            pass
        except Exception as e:
            print(f"Error streaming from Ollama: {e}")
            yield f"\n[Error connecting to AI service]"

# -------- Ollama Client --------
async def ask_ollama(message: str, system_prompt: str | None = None, history: List[dict] | None = None, model: str = MODEL):
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": message})

    payload = {
        "model": model,
        "messages": messages,
        "stream": False
    }
    
    timeout = httpx.Timeout(
        connect=10.0,
        read=45.0,  # Prevent infinite hangs on cloud models
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
            error_detail = e.response.text
            print(f"Error: Ollama returned an error status: {e.response.status_code}. Detail: {error_detail}")
            return f"Error: The LLM service returned an error ({e.response.status_code})."
        except Exception as e:
            print(f"Error: An unexpected error occurred while calling Ollama: {str(e)}")
            return "Error: An unexpected error occurred in the backend."

async def validate_context(question: str, context: str) -> float:
    """
    Asks the LLM to rate the relevance of the context to the question on a scale of 0 to 1.
    """
    if not context or not context.strip():
        return 0.0
    
    prompt = (
        "Rate the relevance of the following context to the user's question.\n"
        "Question: {question}\n"
        "Context: {context}\n"
        "Return ONLY a numerical value between 0 and 1, where 1 is perfectly relevant and 0 is completely irrelevant.\n"
        "Do not include any other text."
    ).format(question=question, context=context)

    response = await ask_ollama(prompt, system_prompt="You are a relevance evaluator. Respond ONLY with a number.")
    
    # If there's an error in the validation call, we don't want to block the user.
    # We'll return 1.0 to let the main chat attempt to answer (it will show its own error if it fails).
    if not response or "Error" in response:
        print(f"Validation failed with error: {response}. Defaulting to 1.0 to avoid blocking.")
        return 1.0

    try:
        # Extract number from response in case there's extra text
        import re
        match = re.search(r"(\d+(\.\d+)?)", response)
        if match:
            val = float(match.group(1))
            # Safety check: if the LLM hallucinated a status code as relevance
            if val > 1.0:
                # If it's a 404/500 code, it's effectively an error
                return 1.0
            return val
    except (ValueError, TypeError):
        pass
    return 1.0 

# -------- Routes ----------
@app.get("/")
def health():
    return {"Status": "StudyGPT is running"}

# -------------Auth----------------
def verify_password(plain_password: str, hashed_password: str):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

@app.on_event("startup")
def auto_seed_teacher():
    db = SessionLocal()
    try:
        teacher = db.query(users).filter(users.username == TEACHER_USERNAME).first()
        if not teacher:
            hashed_pw = get_password_hash(TEACHER_PASSWORD)
            new_teacher = users(username=TEACHER_USERNAME, email=TEACHER_EMAIL, password=hashed_pw, role=UserRole.TEACHER)
            db.add(new_teacher)
            db.commit()
            print(f"Auto-seeded teacher account: {TEACHER_USERNAME}")
    finally:
        db.close()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=int(ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(users).filter(users.username == username).first()
    if user is None:
        raise credentials_exception
    return user

async def get_current_user_ws(token: str, db: Session):
    credentials_exception = WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(users).filter(users.username == username).first()
    if user is None:
        raise credentials_exception
    return user


def require_teacher(current_user: users = Depends(get_current_user)):
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges"
        )
    return current_user

@app.post("/register")
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(users).filter((users.username == user.username) | (users.email == user.email)).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username or email already registered")
    hashed_password = get_password_hash(user.password)
    new_user = users(username=user.username, email=user.email, password=hashed_password, role=user.role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"msg": f"User {new_user.username} created successfully."}

@app.get("/students", response_model=List[UserRead])
def get_students(db: Session = Depends(get_db), current_user: users = Depends(require_teacher)):
    students = db.query(users).filter(users.role == UserRole.STUDENT).all()
    return students

@app.post("/students", response_model=UserRead)
def create_student(user: UserCreate, db: Session = Depends(get_db), current_user: users = Depends(require_teacher)):
    db_user = db.query(users).filter((users.username == user.username) | (users.email == user.email)).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username or email already registered")
    hashed_password = get_password_hash(user.password)
    new_user = users(username=user.username, email=user.email, password=hashed_password, role=user.role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.put("/students/{student_id}", response_model=UserRead)
def update_student(student_id: int, user_update: UserUpdate, db: Session = Depends(get_db), current_user: users = Depends(require_teacher)):
    student = db.query(users).filter(users.id == student_id, users.role == UserRole.STUDENT).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    if user_update.username is not None:
        student.username = user_update.username
    if user_update.email is not None:
        student.email = user_update.email
    if user_update.password is not None:
        student.password = get_password_hash(user_update.password)
    if user_update.role is not None:
        student.role = user_update.role
        
    db.commit()
    db.refresh(student)
    return student

@app.delete("/students/{student_id}")
def delete_student(student_id: int, db: Session = Depends(get_db), current_user: users = Depends(require_teacher)):
    student = db.query(users).filter(users.id == student_id, users.role == UserRole.STUDENT).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    db.delete(student)
    db.commit()
    return {"msg": "Student deleted"}


@app.post("/token")
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(users).filter(users.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=int(ACCESS_TOKEN_EXPIRE_MINUTES))
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}
# -------------Chat With Ollama----------------
@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, current_user: users = Depends(get_current_user)):
    answer = await ask_ollama(req.message, req.system_prompt)
    return {"response": answer}

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest, db: Session = Depends(get_db), current_user: users = Depends(get_current_user)):
    history = []
    if req.session_id:
        h_msgs = db.query(ChatMessage).filter(ChatMessage.session_id == req.session_id).order_by(ChatMessage.created_at.desc()).limit(10).all()
        history = [{"role": m.role, "content": m.content} for m in reversed(h_msgs)]
        db.add(ChatMessage(session_id=req.session_id, role="user", content=req.message))
        db.commit()

    async def wrapped_gen():
        full_content = ""
        async for chunk in ask_ollama_stream(req.message, req.system_prompt, history):
            full_content += chunk
            yield chunk
        if req.session_id:
            db.add(ChatMessage(session_id=req.session_id, role="assistant", content=full_content))
            db.commit()

    return StreamingResponse(wrapped_gen(), media_type="text/event-stream")

# --- Session Endpoints ---
@app.post("/sessions", response_model=SessionRead)
def create_session(req: SessionCreate, db: Session = Depends(get_db), current_user: users = Depends(get_current_user)):
    session_id = str(uuid.uuid4())
    new_session = ChatSession(id=session_id, user_id=current_user.id, title=req.title or "New Chat")
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session

@app.get("/sessions", response_model=List[SessionRead])
def list_sessions(db: Session = Depends(get_db), current_user: users = Depends(get_current_user)):
    return db.query(ChatSession).filter(ChatSession.user_id == current_user.id).order_by(ChatSession.created_at.desc()).all()

@app.get("/sessions/{session_id}/messages", response_model=List[MessageRead])
def get_session_messages(session_id: str, db: Session = Depends(get_db), current_user: users = Depends(get_current_user)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()

@app.delete("/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db), current_user: users = Depends(get_current_user)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"msg": "Session deleted successfully"}

@app.get("/documents")
def get_documents(current_user: users = Depends(get_current_user)):
    return get_all_documents()

@app.get("/documents/{doc_id}")
def get_document_detail(doc_id: str, current_user: users = Depends(get_current_user)):
    all_docs = get_all_documents()
    for doc in all_docs:
        if doc["doc_id"] == doc_id:
            return doc
    raise HTTPException(status_code=404, detail="Document not found")

@app.patch("/documents/{doc_id}")
def update_document_name(doc_id: str, update: DocUpdate, current_user: users = Depends(require_teacher)):
    # This requires updating the metadata in Chroma
    from app.embedding import collection
    try:
        # Chroma update is by IDs. We need to find all IDs for this doc_id
        results = collection.get(where={"doc_id": doc_id})
        if not results["ids"]:
            raise HTTPException(status_code=404, detail="Document not found or has no chunks")
        
        new_metadatas = []
        for meta in results["metadatas"]:
            meta["doc_name"] = update.doc_name
            new_metadatas.append(meta)
            
        collection.update(
            ids=results["ids"],
            metadatas=new_metadatas
        )
        return {"msg": "Document renamed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/documents/{doc_id}")
def remove_document(doc_id: str, current_user: users = Depends(require_teacher)):
    delete_document(doc_id)
    return {"msg": "Document deleted successfully"}

# -------------Ask Question (WebSocket)----------------------
@app.websocket("/ask")
async def ask_llm(websocket: WebSocket, token: str = Query(...), db: Session = Depends(get_db)):
    try:
        current_user = await get_current_user_ws(token, db)
    except WebSocketException as e:
        await websocket.close(code=e.code)
        return
    await websocket.accept()
    print(f"WebSocket connection established for user {current_user.username}")
    try:
        while True:
            try:
                raw_message = await websocket.receive_text()
                
                try:
                    data = json.loads(raw_message)
                    question = data.get("question", "")
                    doc_id = data.get("doc_id", None)
                    session_id = data.get("session_id", None)
                except json.JSONDecodeError:
                    question = raw_message
                    doc_id = None
                    session_id = None
                    
                print(f"Received question: {question}, doc_id: {doc_id}, session_id: {session_id}")
                
                # Fetch History if session exists
                history = []
                if session_id:
                    h_msgs = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.desc()).limit(10).all()
                    history = [{"role": m.role, "content": m.content} for m in reversed(h_msgs)]
                    # Persist User Message
                    db.add(ChatMessage(session_id=session_id, role="user", content=question))
                    db.commit()

                try:
                    context = await retrieve_context(question, doc_id=doc_id)
                except Exception as e:
                    print(f"Context retrieval failed: {str(e)}")
                    context = "" 
                
                print(f"Context: {'Found' if context else 'None'}")
                
                # Context Validation Layer
                relevance = await validate_context(question, context)
                print(f"Relevance Score: {relevance}")

                if relevance < 0.75:
                    msg = "The provided context is not enough to answer this question accurately."
                    if context.strip():
                        msg += " (Context found but relevance is low)"
                    await websocket.send_text(msg)
                    if session_id:
                        db.add(ChatMessage(session_id=session_id, role="assistant", content=msg))
                        db.commit()
                    await websocket.send_text("[DONE]")
                    continue
                
                system_prompt = (
                    "You are a strict academic assistant. You MUST NOT use any of your pre-trained knowledge.\n"
                    "Answer the user's question using ONLY the facts explicitly provided in the Context below.\n"
                    "If the answer is not explicitly found in the Context, you MUST decline to answer by stating: "
                    "'The provided notes do not contain information about this topic.'\n\n"
                    f"Context:\n{context}"
                )
                
                full_answer = ""
                async for chunk in ask_ollama_stream(question, system_prompt, history):
                    if chunk:
                        full_answer += chunk
                        await websocket.send_text(chunk)
                
                if session_id:
                    db.add(ChatMessage(session_id=session_id, role="assistant", content=full_answer))
                    db.commit()
                        
                await websocket.send_text("[DONE]")
                print("Answer sent successfully")
            except Exception as inner_e:
                import traceback
                error_trace = traceback.format_exc()
                print(f"Error processing message:\n{error_trace}")
                await websocket.send_text(f"Backend Error: {str(inner_e) or type(inner_e).__name__}")
                await websocket.send_text("[DONE]")
    except WebSocketDisconnect:
        print("Client disconnected normally")
    except Exception as outer_e:
        print(f"WebSocket fatal error: {str(outer_e)}")
    finally:
        print("WebSocket connection closed")
    
@app.post("/add_pdf")
async def add_pdf(file: UploadFile = File(...), current_user: users = Depends(require_teacher)):
    doc_id = str(uuid.uuid4())
    doc_name = file.filename
    content = await file.read()
    
    async def progress_generator():
        async for progress in add_pdf_to_db(content, doc_id, doc_name):
            yield json.dumps(progress) + "\n"
            
    return StreamingResponse(progress_generator(), media_type="application/x-ndjson")

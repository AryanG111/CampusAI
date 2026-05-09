# Project Requirements & Module Specifications

## 1. Project Overview
**CampusAI** is an AI-powered study assistant designed for students and teachers. It leverages Large Language Models (LLMs) and Retrieval-Augmented Generation (RAG) to provide contextual answers based on uploaded study materials (PDFs).

## 2. User Requirements
- **Student Access**: 
  - Upload study materials (PDFs).
  - Chat with an AI assistant about the uploaded content.
  - Receive answers strictly based on the provided notes.
- **Teacher Access**:
  - Manage course-specific materials.
  - (Future) Create specific collections for different subjects/topics.
- **Authentication**:
  - Secure login/registration for students and teachers.

## 3. Module Specifications

### 3.1 Backend (FastAPI)
- **`main.py`**: The entry point of the application. Handles API routes, WebSocket connections for real-time chat, and PDF upload streaming.
- **`embedding.py`**: Manages the RAG pipeline. Includes PDF parsing (pypdf), text chunking, and integration with the Ollama embedding API.
- **`db.py`**: Configures the vector database (ChromaDB) for persistent storage of document embeddings.

### 3.2 Frontend (React + Vite)
- **`App.tsx`**: Main application component. Features a sidebar for document management and a main chat interface with micro-animations (Framer Motion).
- **Lucide-React**: Used for consistent, premium iconography.
- **Tailwind CSS**: (Assumed/Requested) Used for responsive and modern styling.

## 4. Technology Stack
- **Core Framework**: FastAPI (Python)
- **Frontend**: React (TypeScript) + Vite
- **LLM Engine**: Ollama (Running `phi3:mini` or `DeepSeek-R1`)
- **Embeddings**: `nomic-embed-text` via Ollama
- **Vector Database**: ChromaDB
- **Relational Database**: SQLAlchemy (SQLite for local development)
- **Real-time Communication**: WebSockets

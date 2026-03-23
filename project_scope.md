# Project Scope Documentation: CampusAI

## 1. Project Purpose
The goal of **CampusAI** is to provide an intelligent, local, and privacy-focused study assistant that allows students and teachers to interact with their educational documents using natural language.

## 2. In-Scope Features

### 2.1 Core Functionality (Current)
- **Document Ingestion**: Support for uploading PDF files.
- **Text Processing**: Automatic chunking and embedding of document text.
- **RAG Chat**: Context-aware chatting where the AI answers based on provided documents.
- **Local LLM Integration**: Integration with Ollama for running models locally (privacy-focused).
- **Responsive UI**: A modern, premium web interface for chat and document management.

### 2.2 Extended Scope (Planned)
- **User Authentication**: Separate login portals for Students and Teachers.
- **Robust RAG**: Dynamic collection management in the vector database to separate notes by subject or user.
- **Collection Management**: Ability to create, query, and delete specific document collections.
- **History Tracking**: Saving chat history per user/session.

## 3. Out-of-Scope
- **Non-PDF formats**: Handling of Word, Excel, or PowerPoint files (initially).
- **Online LLMs**: Integration with paid APIs like OpenAI or Anthropic (to maintain local privacy).
- **Collaborative Editing**: Real-time collaborative document editing.
- **Native Mobile Apps**: Mobile support will be focused on web responsiveness only.

## 4. Deliverables
- **The Web Core**: A React-based frontend application.
- **The API Service**: A FastAPI-powered backend server.
- **The Intelligence Layer**: A RAG pipeline integrated with ChromaDB and Ollama.
- **Documentation**: Comprehensive guides for requirements, database, and project scope.

## 5. Success Criteria
- Successful extraction and embedding of text from complex PDFs.
- Latency of less than 2 seconds for context retrieval.
- "Not found in notes" fallback working correctly when the answer is missing from the context.
- Secure and functional login system for multiple user roles.

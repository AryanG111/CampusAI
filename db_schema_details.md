# Database Schema & Vector DB Architecture

## 1. Relational Database Schema (Proposed)
The relational database manages user identities and application metadata.

### 1.1 Users Table
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | Integer (PK) | Unique user identifier |
| `username` | String | Unique username for login |
| `email` | String | User's email address |
| `password_hash` | String | Bcrypt hashed password |
| `role` | Enum | `student` or `teacher` |
| `created_at` | DateTime | Account creation timestamp |

### 1.2 Authentication Flow
- **JWT (JSON Web Tokens)**: Used for stateless session management.
- **Passlib (Bcrypt)**: Used for secure password hashing.

---

## 2. Vector Database Architecture (ChromaDB)
ChromaDB is used to store document embeddings for efficient similarity search (RAG).

### 2.1 Current Implementation
- **Collection Name**: `teacher_db`
- **Embedding Model**: `nomic-embed-text`
- **Index Type**: Persistent HNSW (Hierarchical Navigable Small World)

### 2.2 Future Scope: Robust RAG (Multi-Collection)
To provide a more robust and organized experience, the system will move towards a multi-collection architecture:

- **Dynamic Collections**: Every PDF or course can be assigned its own collection.
  - `collection_id`: Unique ID mapped to a specific PDF.
  - `user_id`: Ownership link to a specific student or teacher.
- **Benefits**:
  - **Granular Deletion**: Entire collections can be dropped when a document is deleted, rather than filtering IDs.
  - **Improved Accuracy**: Search is limited to relevant documents, reducing "noise" from unrelated notes.
  - **Scalability**: Allows for teacher-curated "Course Collections" that multiple students can query.

### 2.3 RAG Workflow
1. **Upload**: PDF is parsed into 500-character chunks with 100-character overlap.
2. **Embed**: Chunks are converted to vectors using Ollama.
3. **Query**: User question is embedded and used to find top-5 matching chunks in ChromaDB.
4. **Augment**: Matches are injected into the LLM system prompt for grounded response generation.

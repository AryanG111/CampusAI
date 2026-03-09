from pypdf import PdfReader
from app.db import collection
import httpx
import io

async def embed(text: str):
    async with httpx.AsyncClient() as client:
        # Using /api/embeddings for Ollama compatibility
        response = await client.post("http://localhost:11434/api/embeddings", json={"model": "nomic-embed-text", "prompt": text})
        response.raise_for_status()
        return response.json()['embedding']

def pdf_to_chunks(file_source):
    # PdfReader can take a file path, bytes, or a stream
    if isinstance(file_source, bytes):
        reader = PdfReader(io.BytesIO(file_source))
    else:
        reader = PdfReader(file_source)
        
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
    
    chunk_size = 500
    overlap = 100
    
    chunks = []
    for i in range(0, len(text), chunk_size - overlap):
        chunks.append(text[i:i + chunk_size])
        
    return chunks

async def add_pdf_to_db(file_source, doc_id: str):
    chunks = pdf_to_chunks(file_source)
    total = len(chunks)
    if total == 0:
        yield {"current": 0, "total": 0, "percent": 100}
        return

    for i, text in enumerate(chunks):
        vector = await embed(text)
        collection.add(
            documents=[text],
            embeddings=[vector],
            ids=[f"{doc_id}_{i}"])
        yield {"current": i + 1, "total": total, "percent": int(((i + 1) / total) * 100)}

async def retrieve_context(question):
    q_embedding = await embed(question)
    result = collection.query(
        query_embeddings=[q_embedding],
        n_results=5)
    return "\n".join(result['documents'][0])
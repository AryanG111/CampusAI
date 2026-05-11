from pypdf import PdfReader
from app.db import collection
import httpx
import io
import uuid
import asyncio


# Use a semaphore to limit concurrent requests to Ollama
embedding_semaphore = asyncio.Semaphore(5)

async def embed(text: str):
    async with embedding_semaphore:
        timeout = httpx.Timeout(60.0, read=None) # Increased timeout
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                "http://localhost:11434/api/embeddings",
                json={"model": "nomic-embed-text", "prompt": text}
            )
            response.raise_for_status()
            return response.json()['embedding']


def pdf_to_chunks(file_source, doc_name, doc_id=None):
    if isinstance(file_source, bytes):
        reader = PdfReader(io.BytesIO(file_source))
    else:
        reader = PdfReader(file_source)

    if not doc_id:
        doc_id = str(uuid.uuid4())

    chunk_size = 500
    overlap = 100
    step = chunk_size - overlap

    if step <= 0:
        raise ValueError("chunk_size must be greater than overlap")

    all_chunks = []

    for page_num, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""

        for i in range(0, len(page_text), step):
            chunk_text = page_text[i:i + chunk_size]

            if not chunk_text.strip():
                continue

            chunk_id = f"{doc_id}_p{page_num}_c{i}"

            all_chunks.append({
                "id": chunk_id,
                "text": chunk_text,
                "metadata": {
                    "doc_id": doc_id,
                    "doc_name": doc_name,
                    "page": page_num + 1,
                    "chunk_index": i
                }
            })

    return all_chunks


async def add_pdf_to_db(file_source, doc_id: str, doc_name: str):
    chunks = pdf_to_chunks(file_source, doc_name=doc_name, doc_id=doc_id)

    total = len(chunks)

    if total == 0:
        yield {"current": 0, "total": 0, "percent": 100}
        print("PDF is empty")
        return

    vectors = []
    for i, chunk in enumerate(chunks):
        try:
            vector = await embed(chunk["text"])
            vectors.append(vector)
            
            # Yield progress for every chunk
            percent = int(((i + 1) / total) * 100)
            yield {
                "current": i + 1,
                "total": total,
                "percent": percent
            }
        except Exception as e:
            print(f"Error embedding chunk {i}: {e}")
            # If one chunk fails, we might want to continue or stop. 
            # For now, let's stop and report error
            yield {"error": str(e), "percent": 0}
            return

    collection.add(
        documents=[c["text"] for c in chunks],
        embeddings=vectors,
        metadatas=[c["metadata"] for c in chunks],
        ids=[c["id"] for c in chunks]
    )

    yield {
        "current": total,
        "total": total,
        "percent": 100
    }


async def retrieve_context(question: str, doc_id: str = None):
    try:
        q_embedding = await embed(question)
        
        where_clause = None
        if doc_id and doc_id != "all":
            where_clause = {"doc_id": doc_id}

        result = collection.query(
            query_embeddings=[q_embedding],
            n_results=5,
            where=where_clause
        )

        if (
            result
            and result.get('documents')
            and len(result['documents']) > 0
            and len(result['documents'][0]) > 0
        ):
            docs = result["documents"][0]
            metas = result.get("metadatas", [[]])[0]

            context = ""

            for i, (doc, meta) in enumerate(zip(docs, metas)):
                if meta:
                    context += f"\n[Source {i+1}: {meta.get('doc_name', 'Unknown')} | Page {meta.get('page', 'N/A')}]\n{doc}\n"
                else:
                    context += f"\n[Source {i+1}]\n{doc}\n"

            return context

    except Exception as e:
        print(f"Error in retrieve_context: {e}")

    return ""


def get_all_documents():
    results = collection.get(include=["metadatas"])
    docs = {}
    for meta in results.get("metadatas", []):
        if meta and "doc_id" in meta:
            d_id = meta["doc_id"]
            d_name = meta.get("doc_name", "Unknown Document")
            if d_id not in docs:
                docs[d_id] = d_name
    return [{"doc_id": k, "doc_name": v} for k, v in docs.items()]


def delete_document(doc_id: str):
    collection.delete(where={"doc_id": doc_id})
# Core/ollama/RAG.py

import os
import uuid
import pinecone
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.document_loaders import PyPDFLoader, PlaywrightURLLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from Core.ollama.RAG_UI_config import load_config

cfg = load_config()

PINECONE_API_KEY = cfg["pinecone_api_key"]
PINECONE_ENV     = cfg["pinecone_env"]
INDEX_NAME       = cfg["pinecone_index"]
NAMESPACE        = cfg.get("namespace")
EMBEDDING_MODEL  = cfg["embedding_model"]
CHUNK_SIZE       = cfg["chunk_size"]
CHUNK_OVERLAP    = cfg["chunk_overlap"]

# ─── CONFIG ────────────────────────────────────────────────────────────────────
#PINECONE_API_KEY = "pcsk_6tkV3g_M6E5L7VAzEVTCcrJUkSbVXxSRX4c6je6gaZYj1DmAPvcLd5x6Ds8q4vLcQYSzpL"
#PINECONE_ENV     = "us-east-1"               # your Pinecone region
#INDEX_NAME       = "stock-bot"               # your Pinecone index name
#NAMESPACE        = None                      # or your namespace if you use one
#DIMENSION        = 384                       # must match your HF model output
#CHUNK_SIZE       = 800
#CHUNK_OVERLAP    = 200

# ─── INITIALIZE PINECONE v2 CLIENT & INDEX ────────────────────────────────────
pinecone_client = pinecone.Pinecone(api_key=PINECONE_API_KEY,
                                    environment=PINECONE_ENV)
pinecone_index  = pinecone_client.Index(INDEX_NAME)

# ─── EMBEDDER & SPLITTER ───────────────────────────────────────────────────────
embedder = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)   
splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP
)


class RAGPipeline:
    def ingest_pdfs(self, folder_path: str):
        """Load all PDFs in folder_path, chunk, embed in batch, and upsert to Pinecone."""
        docs = PyPDFLoader(folder_path).load()
        chunks = splitter.split_documents(docs)

        texts = [c.page_content for c in chunks]
        embs  = embedder.embed_documents(texts)

        vectors = [
            (str(uuid.uuid4()), vec, {"text": text})
            for text, vec in zip(texts, embs)
        ]

        # upsert in 100-vector batches
        for i in range(0, len(vectors), 100):
            batch = vectors[i : i + 100]
            pinecone_index.upsert(vectors=batch, namespace=NAMESPACE)


    def ingest_web(self, url: str):
        """Render URL with Playwright, chunk, embed in batch, and upsert to Pinecone."""
        docs = PlaywrightURLLoader([url]).load()
        chunks = splitter.split_documents(docs)

        texts = [c.page_content for c in chunks]
        embs  = embedder.embed_documents(texts)

        vectors = [
            (str(uuid.uuid4()), vec, {"text": text, "source": url})
            for text, vec in zip(texts, embs)
        ]

        for i in range(0, len(vectors), 100):
            batch = vectors[i : i + 100]
            pinecone_index.upsert(vectors=batch, namespace=NAMESPACE)


    def call_rag(self, query: str, top_k: int = 5) -> str:
        """Embed the query, fetch top_k vectors, and stitch their texts into a context block."""
        qv = embedder.embed_query(query)
        resp = pinecone_index.query(
            vector=qv,
            top_k=top_k,
            include_metadata=True,
            namespace=NAMESPACE
        )
        snippets = [match["metadata"]["text"] for match in resp["matches"]]
        return "\n\n---\n\n".join(snippets)


# Singleton pipeline instance
rag = RAGPipeline()

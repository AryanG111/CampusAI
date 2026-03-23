import chromadb
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

client = chromadb.PersistentClient(path="./chroma_db")

collection = client.get_or_create_collection(name="teacher_db")

#DataBase Setup
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker()
Base = declarative_base()

import os
import chromadb
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from app.config import DATABASE_URL

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chroma_path = os.path.join(BASE_DIR, "chroma_db")
client = chromadb.PersistentClient(path=chroma_path)

collection = client.get_or_create_collection(name="teacher_db")

#DataBase Setup
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

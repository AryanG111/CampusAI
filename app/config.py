from dotenv import load_dotenv
import os
load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/campusai"
MODEL = os.getenv("MODEL", "phi3:mini")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/chat")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")

TEACHER_EMAIL = os.getenv("TEACHER_EMAIL", "teacher@example.com")
TEACHER_USERNAME = os.getenv("TEACHER_USERNAME", "teacher")
TEACHER_PASSWORD = os.getenv("TEACHER_PASSWORD", "teacherpass")

if ALGORITHM is None:
    ALGORITHM = "HS256"
if ACCESS_TOKEN_EXPIRE_MINUTES is None:
    ACCESS_TOKEN_EXPIRE_MINUTES = 30

if SECRET_KEY is None:
    SECRET_KEY = "superseacdfsdjfbjlnl"

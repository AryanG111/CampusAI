from dotenv import load_dotenv
import os
load_dotenv()


DATABASE_URL = os.getenv("DATABASE_URL")
MODEL = os.getenv("MODEL")
OLLAMA_URL = os.getenv("OLLAMA_URL")
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")
ACCESS_TOKEN_EXPIRE_MINUTES = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")

if ALGORITHM is None:
    ALGORITHM = "HS256"
if ACCESS_TOKEN_EXPIRE_MINUTES is None:
    ACCESS_TOKEN_EXPIRE_MINUTES = 30

if SECRET_KEY is None:
    SECRET_KEY = "superseacdfsdjfbjlnl"

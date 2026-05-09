from app.db import SessionLocal
from app.models import users

db = SessionLocal()
try:
    user = db.query(users).first()
    print("SUCCESS: Database queried successfully:", user)
except Exception as e:
    print("FAILED:", str(e))
finally:
    db.close()

from sqlalchemy import create_engine, text
from src.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=10,
    max_overflow=20
)

def get_engine():
    return engine

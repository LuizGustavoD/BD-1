import os

NEON_DATABASE_URL = (
    "postgresql://neondb_owner:npg_cRhzOY0uelr3@"
    "ep-damp-night-bd483xlh-pooler.c-8.us-east-2.aws.neon.tech/"
    "neondb?sslmode=require&channel_binding=require"
)

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", NEON_DATABASE_URL)
    PORT: int = int(os.getenv("PORT", "3001"))

    @property
    def database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg2://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg2://", 1)
        return url

settings = Settings()

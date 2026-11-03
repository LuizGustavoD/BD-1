from datetime import datetime, timezone
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from src.routers import onepiecedle, query, stats

app = FastAPI(
    title="One Piece Dashboard REST API",
    version="2.0.0",
    description="Backend REST desenvolvido em Python/FastAPI integrado ao PostgreSQL 16 para a disciplina de Banco de Dados 2 (UNESP)."
)

# Configuração de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas da API
app.include_router(query.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(onepiecedle.router, prefix="/api")

@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "backend": "FastAPI (Python 3.10)",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# Se a pasta frontend estiver acessível (execução local unificada ou deploy único no Render),
# serve os arquivos estáticos diretamente pelo FastAPI na raiz "/"
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
else:
    @app.get("/", include_in_schema=False)
    def root():
        return {
            "message": "One Piece Dashboard Backend API (FastAPI)",
            "docs": "/docs",
            "health": "/api/health"
        }

import time
from fastapi import APIRouter
from sqlalchemy import text
from src.database import get_engine
from src.models import QueryRequest, QueryResponse

router = APIRouter(prefix="/query", tags=["Query"])

@router.post("", response_model=QueryResponse)
def execute_query(req: QueryRequest):
    if not req.sql or not isinstance(req.sql, str) or not req.sql.strip():
        return QueryResponse(
            success=False,
            error="Instrução SQL não fornecida ou inválida.",
            executionTimeMs=0
        )

    start_time = time.perf_counter()
    engine = get_engine()
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text(req.sql))
            duration_ms = round((time.perf_counter() - start_time) * 1000)

            if result.returns_rows:
                columns = list(result.keys())
                rows = [dict(row._mapping) for row in result.fetchall()]
                row_count = len(rows)
            else:
                conn.commit()
                columns = []
                rows = []
                row_count = result.rowcount

            return QueryResponse(
                success=True,
                columns=columns,
                rows=rows,
                rowCount=row_count,
                executionTimeMs=duration_ms
            )
    except Exception as e:
        duration_ms = round((time.perf_counter() - start_time) * 1000)
        return QueryResponse(
            success=False,
            error=str(e),
            executionTimeMs=duration_ms
        )

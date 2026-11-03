from typing import Any, Dict, List, Optional
from pydantic import BaseModel

class QueryRequest(BaseModel):
    sql: str

class QueryResponse(BaseModel):
    success: bool
    columns: Optional[List[str]] = []
    rows: Optional[List[Dict[str, Any]]] = []
    rowCount: Optional[int] = 0
    executionTimeMs: Optional[int] = 0
    error: Optional[str] = None

class KPIs(BaseModel):
    totalPessoas: int
    totalAkuma: int
    totalTabelas: int
    maxBandoBounty: Any
    maxBandoNome: str

class StatsResponse(BaseModel):
    success: bool
    busca1: List[Dict[str, Any]]
    busca2: List[Dict[str, Any]]
    busca3: List[Dict[str, Any]]
    akumaDist: List[Dict[str, Any]]
    marineDist: List[Dict[str, Any]]
    kpis: KPIs
    featuredCaptain: Optional[Dict[str, Any]] = None
    featuredCaptains: Optional[List[Dict[str, Any]]] = []
    schemaTables: Optional[List[Dict[str, Any]]] = []

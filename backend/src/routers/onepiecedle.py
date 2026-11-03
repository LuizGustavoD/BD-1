import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from src.database import get_engine

router = APIRouter(prefix="/onepiecedle", tags=["Onepiecedle"])

class GuessRequest(BaseModel):
    target_id: int
    guess_id: Optional[int] = None
    guess_name: Optional[str] = None

@router.get("/characters")
def list_characters():
    """Retorna a lista de todos os personagens para a busca e autocomplete."""
    engine = get_engine()
    try:
        with engine.connect() as conn:
            res = conn.execute(text("""
                SELECT id_pessoa, nome, alcunha, genero, especie, mar, afiliacao
                FROM vw_onepiecedle_characters
                ORDER BY nome ASC;
            """))
            return [dict(row._mapping) for row in res.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/daily")
def get_daily_target():
    """Gera deterministicamente o personagem secreto do dia com base na data de Brasília (UTC-3)."""
    engine = get_engine()
    today_str = datetime.now(timezone(timedelta(hours=-3))).strftime("%Y-%m-%d")
    
    try:
        with engine.connect() as conn:
            res = conn.execute(text("SELECT id_pessoa FROM vw_onepiecedle_characters ORDER BY id_pessoa;"))
            all_ids = [row[0] for row in res.fetchall()]
            
            if not all_ids:
                raise HTTPException(status_code=404, detail="Nenhum personagem cadastrado.")
                
            hash_val = int(hashlib.sha256(today_str.encode()).hexdigest(), 16)
            target_id = all_ids[hash_val % len(all_ids)]
            
            return {
                "target_id": target_id,
                "mode": "daily",
                "date": today_str,
                "total_characters": len(all_ids)
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/random")
def get_random_target():
    """Retorna um personagem secreto aleatório para rodadas livres de treino."""
    engine = get_engine()
    try:
        with engine.connect() as conn:
            res = conn.execute(text("""
                SELECT id_pessoa FROM vw_onepiecedle_characters
                ORDER BY RANDOM() LIMIT 1;
            """))
            row = res.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Nenhum personagem cadastrado.")
            return {
                "target_id": row[0],
                "mode": "random"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/guess")
def submit_guess(req: GuessRequest):
    """
    Compara o palpite do jogador com o personagem secreto da rodada
    e calcula o feedback atributo por atributo (Wordle/Loldle logic).
    """
    engine = get_engine()
    try:
        with engine.connect() as conn:
            # 1. Busca o personagem secreto (target)
            target_res = conn.execute(
                text("SELECT * FROM vw_onepiecedle_characters WHERE id_pessoa = :id;"),
                {"id": req.target_id}
            )
            target_row = target_res.fetchone()
            if not target_row:
                raise HTTPException(status_code=404, detail="Personagem secreto não encontrado.")
            target = dict(target_row._mapping)

            # 2. Busca o personagem do palpite (guess)
            if req.guess_id:
                guess_res = conn.execute(
                    text("SELECT * FROM vw_onepiecedle_characters WHERE id_pessoa = :id;"),
                    {"id": req.guess_id}
                )
            elif req.guess_name:
                guess_res = conn.execute(
                    text("SELECT * FROM vw_onepiecedle_characters WHERE LOWER(nome) = LOWER(:nome);"),
                    {"nome": req.guess_name.strip()}
                )
            else:
                raise HTTPException(status_code=400, detail="Identificador do palpite não fornecido.")

            guess_row = guess_res.fetchone()
            if not guess_row:
                raise HTTPException(status_code=404, detail="Personagem palpitado não encontrado no banco.")
            guess = dict(guess_row._mapping)

            # 3. Lógica de comparação dos atributos
            is_correct = (guess["id_pessoa"] == target["id_pessoa"])

            # Gênero
            gender_status = "correct" if guess["genero"] == target["genero"] else "wrong"

            # Espécie
            species_status = "correct" if guess["especie"] == target["especie"] else "wrong"

            # Afiliação
            if guess["afiliacao"] == target["afiliacao"]:
                affiliation_status = "correct"
            elif guess.get("tipo_afiliacao") and guess["tipo_afiliacao"] == target.get("tipo_afiliacao"):
                affiliation_status = "partial"
            else:
                affiliation_status = "wrong"

            # Tipo de Akuma no Mi
            if guess["tipo_fruta"] == target["tipo_fruta"]:
                fruit_status = "correct"
            elif guess["tipo_fruta"] != "Nenhuma" and target["tipo_fruta"] != "Nenhuma":
                fruit_status = "partial" # ambos têm fruta, mas tipos diferentes
            else:
                fruit_status = "wrong"

            # Mar de Origem
            sea_status = "correct" if guess["mar"] == target["mar"] else "wrong"

            # Recompensa (Bounty)
            guess_bounty = int(guess["recompensa"])
            target_bounty = int(target["recompensa"])
            if guess_bounty == target_bounty:
                bounty_status = "correct"
                bounty_dir = "equal"
            elif target_bounty > guess_bounty:
                bounty_status = "wrong"
                bounty_dir = "higher" # O personagem secreto tem recompensa MAIOR ⬆️
            else:
                bounty_status = "wrong"
                bounty_dir = "lower"  # O personagem secreto tem recompensa MENOR ⬇️

            comparison = {
                "name": {
                    "value": guess["nome"],
                    "alcunha": guess["alcunha"],
                    "status": "correct" if is_correct else "wrong"
                },
                "gender": {
                    "value": guess["genero"],
                    "status": gender_status
                },
                "species": {
                    "value": guess["especie"],
                    "status": species_status
                },
                "affiliation": {
                    "value": guess["afiliacao"],
                    "status": affiliation_status
                },
                "fruit_type": {
                    "value": guess["tipo_fruta"],
                    "status": fruit_status
                },
                "sea": {
                    "value": guess["mar"],
                    "status": sea_status
                },
                "bounty": {
                    "value": guess_bounty,
                    "status": bounty_status,
                    "direction": bounty_dir
                }
            }

            return {
                "success": True,
                "is_correct": is_correct,
                "guess": guess,
                "comparison": comparison,
                "target_revealed": target if is_correct else None
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/hint/{target_id}")
def get_character_hints(target_id: int):
    """
    Consulta no banco pistas progressivas sobre o personagem secreto (Sistemas de Combate/Armas,
    Poder da Akuma no Mi/Terra Natal e Alcunha Oficial).
    """
    engine = get_engine()
    try:
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT 
                    v.id_pessoa,
                    v.alcunha,
                    v.terra_natal,
                    v.mar,
                    v.fruta,
                    COALESCE((
                        SELECT a.poder FROM Pessoa_AkumaNoMi pa
                        JOIN Akuma_no_Mi a ON a.id_akuma = pa.id_akuma
                        WHERE pa.id_pessoa = v.id_pessoa
                        ORDER BY a.id_akuma ASC LIMIT 1
                    ), 'Nao possui poder de Akuma no Mi') AS poder_fruta,
                    COALESCE((
                        SELECT string_agg(sc.nome_sistema, ', ' ORDER BY sc.id_sistema)
                        FROM Pessoa_Sistema_Combate psc
                        JOIN Sistema_Combate sc ON sc.id_sistema = psc.id_sistema
                        WHERE psc.id_pessoa = v.id_pessoa
                    ), 'Combate convencional') AS sistemas_combate,
                    COALESCE((
                        SELECT string_agg(ar.nome, ', ' ORDER BY ar.id_arma)
                        FROM Pessoa_Arma par
                        JOIN Arma ar ON ar.id_arma = par.id_arma
                        WHERE par.id_pessoa = v.id_pessoa
                    ), 'Nenhuma arma registrada') AS armas
                FROM vw_onepiecedle_characters v
                WHERE v.id_pessoa = :id;
            """), {"id": target_id}).fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Personagem secreto não encontrado.")

            d = dict(row._mapping)
            return {
                "success": True,
                "hints": [
                    {
                        "level": 1,
                        "title": "Dica 1 — Combate & Armas",
                        "text": f"Estilo/Haki: {d['sistemas_combate']} | Arma: {d['armas']}"
                    },
                    {
                        "level": 2,
                        "title": "Dica 2 — Terra Natal & Poder da Fruta",
                        "text": f"Origem: {d['terra_natal']} ({d['mar']}) | Poder: {d['poder_fruta']}"
                    },
                    {
                        "level": 3,
                        "title": "Dica 3 — Alcunha Oficial",
                        "text": f"Conhecido nos mares como: \"{d['alcunha']}\""
                    }
                ]
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

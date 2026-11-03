from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from src.database import get_engine
from src.models import StatsResponse, KPIs

router = APIRouter(prefix="/stats", tags=["Stats"])

@router.get("", response_model=StatsResponse)
def get_stats():
    engine = get_engine()
    try:
        with engine.connect() as conn:
            # Busca 1 (Shichibukais)
            b1 = conn.execute(text("""
                SELECT p.nome AS personagem, p.alcunha, pi.recompensa
                FROM Pessoa p
                JOIN Pirata pi ON pi.id_pessoa = p.id_pessoa
                JOIN Pessoa_Titulo pt ON pt.id_pessoa = p.id_pessoa
                JOIN Titulo t ON t.id_titulo = pt.id_titulo
                WHERE t.nome = 'Shichibukai'
                ORDER BY pi.recompensa DESC;
            """))
            busca1_rows = [dict(row._mapping) for row in b1.fetchall()]

            # Busca 2 (Marinheiros com Akuma no Mi)
            b2 = conn.execute(text("""
                SELECT m.patente, p.nome AS personagem, p.alcunha, e.nome AS especie, a.nome AS fruta, a.tipo AS tipo_fruta
                FROM Marinheiro m
                JOIN Pessoa p ON p.id_pessoa = m.id_pessoa
                JOIN Especie e ON e.id_especie = p.id_especie
                JOIN Pessoa_AkumaNoMi pa ON pa.id_pessoa = p.id_pessoa
                JOIN Akuma_no_Mi a ON a.id_akuma = pa.id_akuma
                ORDER BY m.patente, p.nome;
            """))
            busca2_rows = [dict(row._mapping) for row in b2.fetchall()]

            # Busca 3 (Recompensas dos Bandos via CTE)
            b3 = conn.execute(text("""
                WITH soma_bando AS (
                    SELECT c.id_organizacao, SUM(pi.recompensa) AS soma_recompensas
                    FROM Bando b
                    JOIN Cargo c ON c.id_organizacao = b.id_organizacao
                    JOIN Pessoa_Cargo pc ON pc.id_cargo = c.id_cargo
                    JOIN Pirata pi ON pi.id_pessoa = pc.id_pessoa
                    GROUP BY c.id_organizacao
                    HAVING SUM(pi.recompensa) > 1000000
                )
                SELECT cap.nome AS capitao, cap.alcunha, pcap.recompensa AS recompensa_capitao, org.nome AS bando, sb.soma_recompensas
                FROM soma_bando sb
                JOIN Organizacao org ON org.id_organizacao = sb.id_organizacao
                JOIN Cargo cc ON cc.id_organizacao = org.id_organizacao AND cc.nome = 'Capitao'
                JOIN Pessoa_Cargo pcc ON pcc.id_cargo = cc.id_cargo
                JOIN Pessoa cap ON cap.id_pessoa = pcc.id_pessoa
                JOIN Pirata pcap ON pcap.id_pessoa = cap.id_pessoa
                ORDER BY sb.soma_recompensas DESC;
            """))
            busca3_rows = [dict(row._mapping) for row in b3.fetchall()]

            # Distribuição por tipo de Akuma no Mi
            akuma_dist = conn.execute(text("""
                SELECT tipo, COUNT(*)::int AS qtd FROM Akuma_no_Mi GROUP BY tipo ORDER BY qtd DESC;
            """))
            akuma_dist_rows = [dict(row._mapping) for row in akuma_dist.fetchall()]

            # Distribuição de Marinha com fruta por Patente
            marine_dist = conn.execute(text("""
                SELECT m.patente, COUNT(*)::int AS qtd
                FROM Marinheiro m
                JOIN Pessoa_AkumaNoMi pa ON pa.id_pessoa = m.id_pessoa
                GROUP BY m.patente ORDER BY qtd DESC;
            """))
            marine_dist_rows = [dict(row._mapping) for row in marine_dist.fetchall()]

            # KPIs
            total_pessoas = conn.execute(text("SELECT COUNT(*)::int AS total FROM Pessoa;")).fetchone()[0]
            total_akuma = conn.execute(text("SELECT COUNT(*)::int AS total FROM Akuma_no_Mi;")).fetchone()[0]

            max_bounty = busca3_rows[0]["soma_recompensas"] if busca3_rows else "8816001000"
            max_bando = busca3_rows[0]["bando"] if busca3_rows else "Piratas do Chapéu de Palha"

            return StatsResponse(
                success=True,
                busca1=busca1_rows,
                busca2=busca2_rows,
                busca3=busca3_rows,
                akumaDist=akuma_dist_rows,
                marineDist=marine_dist_rows,
                kpis=KPIs(
                    totalPessoas=total_pessoas,
                    totalAkuma=total_akuma,
                    maxBandoBounty=str(max_bounty),
                    maxBandoNome=str(max_bando)
                )
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

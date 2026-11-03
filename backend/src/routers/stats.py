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

            # KPIs consultados diretamente no banco
            total_pessoas = conn.execute(text("SELECT COUNT(*)::int AS total FROM Pessoa;")).fetchone()[0]
            total_akuma = conn.execute(text("SELECT COUNT(*)::int AS total FROM Akuma_no_Mi;")).fetchone()[0]
            total_tabelas = conn.execute(text("""
                SELECT COUNT(*)::int AS total
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
            """)).fetchone()[0]

            max_bounty = busca3_rows[0]["soma_recompensas"] if busca3_rows else 0
            max_bando = busca3_rows[0]["bando"] if busca3_rows else ""
            top_capitao_nome = busca3_rows[0]["capitao"] if busca3_rows else None

            # Capitães em destaque consultados dinamicamente no banco (líderes dos bandos ordenados por recompensa acumulada)
            featured_captains = []
            for b_row in busca3_rows:
                cap_res = conn.execute(text("""
                    SELECT 
                        v.id_pessoa,
                        v.nome,
                        v.alcunha,
                        v.especie,
                        v.mar,
                        v.terra_natal,
                        v.recompensa,
                        v.fruta,
                        v.tipo_fruta,
                        v.afiliacao AS bando,
                        COALESCE(c.nome, 'Capitao') AS cargo,
                        COALESCE((
                            SELECT string_agg(t.nome, ' • ' ORDER BY t.id_titulo DESC)
                            FROM Pessoa_Titulo pt
                            JOIN Titulo t ON t.id_titulo = pt.id_titulo
                            WHERE pt.id_pessoa = v.id_pessoa
                        ), 'Pirata') AS titulos,
                        COALESCE((
                            SELECT string_agg(sc.nome_sistema, ', ' ORDER BY sc.id_sistema)
                            FROM Pessoa_Sistema_Combate psc
                            JOIN Sistema_Combate sc ON sc.id_sistema = psc.id_sistema
                            WHERE psc.id_pessoa = v.id_pessoa
                        ), 'Combate Pirata') AS sistemas_combate
                    FROM vw_onepiecedle_characters v
                    LEFT JOIN Pessoa_Cargo pc ON pc.id_pessoa = v.id_pessoa
                    LEFT JOIN Cargo c ON c.id_cargo = pc.id_cargo AND c.nome = 'Capitao'
                    WHERE v.nome = :nome
                    LIMIT 1;
                """), {"nome": b_row["capitao"]}).fetchone()
                if cap_res:
                    cap_dict = dict(cap_res._mapping)
                    cap_dict["soma_recompensas_bando"] = b_row["soma_recompensas"]
                    cap_dict["posicao_ranking"] = len(featured_captains) + 1
                    featured_captains.append(cap_dict)

            featured_captain = featured_captains[0] if featured_captains else None

            # Metadados do Esquema Relacional consultados ao vivo via information_schema
            schema_res = conn.execute(text("""
                WITH pks AS (
                    SELECT tc.table_name,
                           string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS pk_cols,
                           COUNT(kcu.column_name)::int AS pk_count
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
                    GROUP BY tc.table_name
                ),
                fks AS (
                    SELECT tc.table_name,
                           string_agg(DISTINCT ccu.table_name, ', ' ORDER BY ccu.table_name) AS fk_targets,
                           string_agg(DISTINCT kcu.column_name, ', ' ORDER BY kcu.column_name) AS fk_cols
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage ccu
                      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
                    GROUP BY tc.table_name
                )
                SELECT t.table_name,
                       COALESCE(p.pk_cols, '') AS pk_cols,
                       COALESCE(p.pk_count, 0) AS pk_count,
                       COALESCE(f.fk_targets, '') AS fk_targets,
                       COALESCE(f.fk_cols, '') AS fk_cols
                FROM information_schema.tables t
                LEFT JOIN pks p ON p.table_name = t.table_name
                LEFT JOIN fks f ON f.table_name = t.table_name
                WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
                ORDER BY t.table_name;
            """))
            schema_tables = [dict(row._mapping) for row in schema_res.fetchall()]

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
                    totalTabelas=total_tabelas,
                    maxBandoBounty=str(max_bounty),
                    maxBandoNome=str(max_bando)
                ),
                featuredCaptain=featured_captain,
                featuredCaptains=featured_captains,
                schemaTables=schema_tables
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

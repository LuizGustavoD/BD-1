# Arquitetura do Sistema e Infraestrutura Cloud

Este documento descreve detalhadamente a arquitetura de software, as decisões de engenharia adotadas e os serviços de computação em nuvem utilizados na hospedagem e operação do sistema One Piece Dashboard.

---

## 1. Visão Geral da Arquitetura

O sistema adota uma arquitetura em camadas orientada a serviços (Service-Oriented Architecture - SOA) desacoplada, composta por três componentes fundamentais:

1. **Camada de Persistência (Database as a Service - DBaaS):** Instância gerenciada de banco de dados relacional.
2. **Camada de Aplicação / API (Platform as a Service - PaaS):** API RESTful desenvolvida em Python assíncrono.
3. **Camada de Apresentação (Single Page Application - SPA):** Interface rica renderizada no cliente (Client-Side Rendering) servida estaticamente via Web Server / Reverse Proxy.

A comunicação entre a camada de apresentação e a camada de aplicação ocorre estritamente via protocolo HTTP/HTTPS utilizando payloads padronizados em formato JSON.

---

## 2. Infraestrutura Cloud e Hospedagem

A infraestrutura foi desenhada aproveitando serviços gerenciados em nuvem para garantir alta disponibilidade, provisionamento contínuo e escalabilidade sob demanda com custo zero (Free Tier).

```
                      +-----------------------------+
                      |       Navegador Web         |
                      |   (Cliente / Usuário Final) |
                      +--------------+--------------+
                                     |
                                     | HTTPS (Porta 443)
                                     v
                      +-----------------------------+
                      |         RENDER CLOUD        |
                      |  Web Service Containerizado |
                      |                             |
                      |  [Uvicorn / FastAPI Core]   |
                      |   * Endpoints REST (/api/*) |
                      |   * Static Files Mount (/)  |
                      +--------------+--------------+
                                     |
                                     | TLS/SSL Encrypted (Porta 5432)
                                     | PgBouncer Connection Pooler
                                     v
                      +-----------------------------+
                      |           NEON DB           |
                      |    (AWS us-east-2 - Ohio)   |
                      |                             |
                      |   PostgreSQL 16 Engine      |
                      |   * 32 Tabelas Relacionais  |
                      |   * 1 View Analítica        |
                      +-----------------------------+
```

### 2.1. Camada de Persistência: Neon DB (Serverless PostgreSQL)
* **Provedor Cloud:** Neon Inc., hospedado na infraestrutura de nuvem pública da **Amazon Web Services (AWS)** na região `us-east-2` (Ohio).
* **Mecanismo:** PostgreSQL versão 16.
* **Justificativa da Escolha:**
  * **Arquitetura Serverless desacoplada:** O Neon separa computação de armazenamento, permitindo escala automática, auto-suspensão em períodos de inatividade e reinicialização imediata sem degradação do estado.
  * **Pool de Conexões Integrado (PgBouncer):** O acesso é feito através do endpoint com pooler (`ep-damp-night-bd483xlh-pooler.c-8.us-east-2.aws.neon.tech`), mitigando a sobrecarga de conexões TCP e overhead de autenticação em aplicações web com padrão transacional concorrente.
  * **Segurança de Transporte:** Conexão criptografada obrigatória via SSL/TLS (`sslmode=require&channel_binding=require`).

### 2.2. Camada de Aplicação e Apresentação: Render Cloud
* **Provedor Cloud:** Render Services Inc.
* **Tipo de Serviço:** Web Service (Linux Container).
* **Runtime:** Python 3.11 gerenciado via Uvicorn ASGI Server.
* **Justificativa da Escolha:**
  * **Unificação de Serviço:** Configuração do FastAPI para servir a interface cliente (arquivos estáticos) na raiz (`/`) e expor a API sob o prefixo (`/api/`), consolidando backend e frontend em uma única instância pública sem custos duplicados ou latência de cross-origin desnecessária.
  * **Integração e Entrega Contínua (CI/CD):** Pipeline acoplado diretamente à branch `main` do repositório GitHub (`LuizGustavoD/BD-1`), disparando build e deploy automatizados a cada commit.
  * **Infraestrutura Declarativa:** O provisionamento pode ser integralmente reproduzido via arquivo de especificação declarativa (`render.yaml`).

---

## 3. Decisões Arquiteturais e Padrões de Projeto

### 3.1. Normalização do Modelo Relacional (3ª Forma Normal)
O modelo de dados compreende 32 tabelas normalizadas rigorosamente na Terceira Forma Normal (3FN), eliminando dependências funcionais parciais e transitivas:
* **Especialização por Herança de Chave Primária:** Implementação de superclasses (`Pessoa`, `Organizacao`, `Poneglyph`) e subclasses (`Pirata`, `Marinheiro`, `Civil`, `Bando`, `Marinha`, etc.) onde a chave primária da entidade filha atua simultaneamente como chave primária e estrangeira (`1:1`). Isso garante integridade referencial rígida sem duplicação de atributos genéricos.
* **Relações Muitos-para-Muitos (N:N):** Tabelas associativas especializadas dotadas de chaves primárias compostas (`Pessoa_AkumaNoMi`, `Pessoa_Sistema_Combate`, `Pessoa_Arma`, `Pessoa_Cargo`, `Pessoa_Titulo`, `Localizacao_Poneglyph`), garantindo histórico e múltiplos vínculos independentes.

### 3.2. Estratégia de Conexão e Pool no Backend
A integração do FastAPI com o PostgreSQL é implementada via **SQLAlchemy Core** aliado ao driver de baixo nível **Psycopg2-binary**:
* **Connection Pooling:** Configurado com `pool_size=10`, `max_overflow=20` e `pool_recycle=300`.
* **Health Check Pré-Execução (`pool_pre_ping=True`):** Validação proativa de conexões antes da entrega ao contexto de execução, prevenindo falhas silenciosas decorrentes de encerramento prematuro de sockets por firewalls intermediários ou suspensão serverless do DBaaS.

### 3.3. Dinamismo Integral dos Dados (Eliminação de Hardcode)
Nenhum dado analítico, métrica de sistema ou metadados de entidades é armazenado estaticamente no código-fonte:
* **Metadados Estruturais:** A visualização do modelo relacional (Aba 3) consulta ativamente as tabelas de catálogo `information_schema.tables`, `information_schema.table_constraints`, `information_schema.key_column_usage` e `information_schema.constraint_column_usage`, refletindo alterações de DDL em tempo real.
* **Agregações Analíticas e CTEs:** Consultas complexas utilizam Expressões de Tabela Comuns (`WITH soma_bando AS (...)`) para calcular agregações financeiras e filtros agregados (`HAVING`), evitando persistência redundante de totais calculados.
* **Dicas e Atributos de Jogo:** As pistas do módulo Onepiecedle são resolvidas sob demanda via junções entre tabelas de domínio (`Akuma_no_Mi`, `Sistema_Combate`, `Arma`, `Localizacao`), assegurando consistência semântica.

### 3.4. Execução Transacional e Segurança do Console SQL
O console SQL disponível na interface implementa gerenciamento de transações com controle de concorrência e integridade:
* Utilização de blocos transacionais gerenciados (`engine.begin()`) que garantem atomicidade (`ACID`) em operações DML (`INSERT`, `UPDATE`, `DELETE`), aplicando `COMMIT` automático apenas em caso de encerramento sem exceções e executando `ROLLBACK` automático diante de erros de sintaxe ou violação de restrições relacionais (chaves estrangeiras, unicidade ou tipos de dados).
* Abertura do canal de execução de forma direta e mensurada (`time.perf_counter()`), informando ao cliente a latência real de processamento do motor PostgreSQL.

### 3.5. Cache e Desempenho no Cliente
* **Revalidação de Ativos:** Headers de cache configurados para garantir que alterações de lógica (`app.js`) e estilização (`styles.css`) sejam validadas via ETag / revalidação condicional no cliente, enquanto requisições aos endpoints da API recebem cabeçalhos de CORS permissivos controlados pelo middleware FastAPI.

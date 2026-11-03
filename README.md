# One Piece Dashboard — Grand Line Database

Aplicação web full-stack desenvolvida para a disciplina de **Banco de Dados II (UNESP)**, projetada para explorar e apresentar de forma interativa um banco de dados relacional completo sobre o universo de *One Piece*, normalizado na **3ª Forma Normal (3FN)** e hospedado em nuvem no **PostgreSQL (Neon DB)**.

---

## 🌊 Visão Geral do Projeto

O sistema conecta uma interface web dinâmica a um esquema relacional de **32 tabelas** e **1 view**, cobrindo personagens, bandos piratas, Marinha, Governo Mundial, Exército Revolucionário, Akuma no Mi, sistemas de combate (Haki e artes marciais), armas, navios, eventos e Poneglyphs.

O projeto foi estruturado para demonstrar na prática conceitos avançados de bancos de dados relacionais:
* **Especialização e Herança (1:1):** Superclasses `Pessoa`, `Organizacao` e `Poneglyph` com subclasses disjuntas.
* **Tabelas Associativas (N:N):** Relacionamentos de múltiplos vínculos como `Pessoa_AkumaNoMi`, `Pessoa_Sistema_Combate`, `Pessoa_Arma`, `Pessoa_Cargo`, `Pessoa_Titulo` e `Localizacao_Poneglyph`.
* **Consultas Analíticas Complexas:** Uso de agregações, junções múltiplas, CTEs (`WITH`) e cláusulas `HAVING`.
* **Zero Hardcode:** Todas as métricas, contadores de tabelas, cartazes de procurado e dados estatísticos são obtidos via consultas SQL em tempo real.

---

## 🧭 Funcionalidades da Aplicação

### 1. Visão Geral & Métricas (Analytics)
* **Banner WANTED Dinâmico:** Cartaz de procurado interativo com carrossel navegável que percorre os principais capitães do banco (Luffy, Barba Branca, Kaido, Big Mom, Shanks, Barba Negra, Kid, Law, Buggy, Crocodile, Hancock, Doflamingo), exibindo retrato, títulos, bando, recompensa e estilos de combate consultados diretamente no banco.
* **Cards de Indicadores (KPIs):** Total de personagens povoados, total de Akuma no Mi catalogadas, contagem dinâmica de tabelas e maior recompensa acumulada por bando.
* **Gráficos Interativos (Chart.js):**
  * *Top Recompensas Acumuladas por Bando* (resultado da Busca 3 com CTE e agregação).
  * *Distribuição de Akuma no Mi* por tipo (Paramecia, Logia e Zoan).
  * *Recompensas dos Shichibukai* (resultado da Busca 1).
  * *Usuários de Akuma no Mi na Marinha por Patente* (resultado da Busca 2).

### 2. Console SQL Interativo (DQL / DML)
* Console no próprio navegador para digitação e execução de instruções SQL livres contra a instância PostgreSQL.
* Seletores pré-configurados para as buscas obrigatórias do trabalho acadêmico (Busca 1, Busca 2, Busca 3) e inspeção rápida das tabelas `Akuma_no_Mi`, `Bando` e `Navio`.
* **Aba de SQL Livre:** Permite executar consultas analíticas personalizadas (`SELECT`, `WITH`) e comandos de manipulação de dados (`INSERT`, `UPDATE`, `DELETE`) com atualização automática das estatísticas do painel.

### 3. Modelo Relacional Dinâmico
* Inspeção das 32 tabelas do banco alimentada diretamente pelo `information_schema` do PostgreSQL.
* Categorização automática em:
  * **Entidades Independentes** (sem chaves estrangeiras).
  * **Especializações 1:1** (PK herdada da superclasse).
  * **Relacionamentos N:N** (chaves primárias compostas).
  * **Entidades Dependentes 1:N** (com chaves estrangeiras para outras entidades).
* Clique direto em qualquer tabela para abrir o console e executar uma consulta instantânea sobre ela.

### 4. Onepiecedle Clássico (Jogo de Adivinhação)
* Minijogo de deduções diárias e aleatórias inspirado na mecânica Wordle/Loldle.
* Compara atributos consultados na view `vw_onepiecedle_characters`: Gênero, Espécie, Afiliação, Tipo de Akuma no Mi, Mar de Origem e Recompensa (com indicadores de maior ⬆️ ou menor ⬇️).
* **Dicas Progressivas:** Botão que consulta no banco pistas reais do personagem secreto (Haki/Armas, Poder da Fruta e Alcunha).

---

## 🛠️ Tecnologias Utilizadas

* **Banco de Dados:** PostgreSQL 16 (hospedado no Neon DB Serverless na AWS).
* **Backend:** Python 3.10+, FastAPI, SQLAlchemy, Uvicorn, Psycopg2.
* **Frontend:** HTML5 semântico, CSS3 (com suporte a temas Mar Abissal e Pergaminho Fandom), JavaScript (ES6+), Chart.js.
* **Contêineres & Deploy:** Docker, Docker Compose, Nginx, Render.

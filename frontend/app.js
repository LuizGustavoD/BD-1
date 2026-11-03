// One Piece Dashboard - Live PostgreSQL Backend Integration

// Helper Formatter
function formatBerries(val) {
  const num = Number(val);
  if (isNaN(num)) return val;
  return new Intl.NumberFormat('pt-BR').format(num) + ' ฿';
}

// Preset SQL Queries Definition
const presetQueries = {
  q1: `SELECT p.nome AS personagem, p.alcunha, pi.recompensa\nFROM Pessoa p\nJOIN Pirata pi ON pi.id_pessoa = p.id_pessoa\nJOIN Pessoa_Titulo pt ON pt.id_pessoa = p.id_pessoa\nJOIN Titulo t ON t.id_titulo = pt.id_titulo\nWHERE t.nome = 'Shichibukai'\nORDER BY pi.recompensa DESC;`,
  
  q2: `SELECT m.patente, p.nome AS personagem, p.alcunha, e.nome AS especie, a.nome AS fruta, a.tipo AS tipo_fruta\nFROM Marinheiro m\nJOIN Pessoa p ON p.id_pessoa = m.id_pessoa\nJOIN Especie e ON e.id_especie = p.id_especie\nJOIN Pessoa_AkumaNoMi pa ON pa.id_pessoa = p.id_pessoa\nJOIN Akuma_no_Mi a ON a.id_akuma = pa.id_akuma\nORDER BY m.patente, p.nome;`,
  
  q3: `WITH soma_bando AS (\n    SELECT c.id_organizacao, SUM(pi.recompensa) AS soma_recompensas\n    FROM Bando b\n    JOIN Cargo c ON c.id_organizacao = b.id_organizacao\n    JOIN Pessoa_Cargo pc ON pc.id_cargo = c.id_cargo\n    JOIN Pirata pi ON pi.id_pessoa = pc.id_pessoa\n    GROUP BY c.id_organizacao\n    HAVING SUM(pi.recompensa) > 1000000\n)\nSELECT cap.nome AS capitao, cap.alcunha, pcap.recompensa AS recompensa_capitao, org.nome AS bando, sb.soma_recompensas\nFROM soma_bando sb\nJOIN Organizacao org ON org.id_organizacao = sb.id_organizacao\nJOIN Cargo cc ON cc.id_organizacao = org.id_organizacao AND cc.nome = 'Capitao'\nJOIN Pessoa_Cargo pcc ON pcc.id_cargo = cc.id_cargo\nJOIN Pessoa cap ON cap.id_pessoa = pcc.id_pessoa\nJOIN Pirata pcap ON pcap.id_pessoa = cap.id_pessoa\nORDER BY sb.soma_recompensas DESC;`,
  
  akuma: `SELECT id_akuma, nome AS fruta, poder, tipo, limitacoes\nFROM Akuma_no_Mi\nORDER BY tipo, nome;`,
  
  bando: `SELECT o.id_organizacao, o.nome AS bando, o.poder, b.bandeira, b.qtd_tripulacoes\nFROM Organizacao o\nJOIN Bando b ON b.id_organizacao = o.id_organizacao\nWHERE o.tipo = 'Bando';`,
  
  navio: `SELECT id_navio, nome, tipo, capacidade, estado_atual\nFROM Navio\nORDER BY estado_atual, capacidade DESC;`
};

let chartInstances = {};
let featuredCaptainsList = [];
let currentCaptainIndex = 0;

// Load Stats, KPIs, Featured Captain, Schema & Render Charts directly from PostgreSQL
async function loadPostgresStats() {
  try {
    const response = await fetch('/api/stats');
    const data = await response.json();

    if (!data.success) {
      console.error('Erro ao buscar estatísticas do backend:', data.error);
      return;
    }

    // 1. Preenche KPIs e contadores de tabelas com dados reais do banco
    renderKPIs(data.kpis);

    // 2. Preenche o Banner WANTED e inicializa o seletor de Capitães consultados no banco
    featuredCaptainsList = Array.isArray(data.featuredCaptains) && data.featuredCaptains.length > 0
      ? data.featuredCaptains
      : (data.featuredCaptain ? [data.featuredCaptain] : []);
    currentCaptainIndex = 0;
    renderFeaturedCaptain(featuredCaptainsList[0]);
    setupCaptainCarousel();

    // 3. Constrói a Aba 3 (Modelo Relacional) dinamicamente via information_schema
    renderSchemaFromDB(data.schemaTables);

    // 4. Renderiza os 4 Gráficos com dados reais do banco
    initChartsWithData(data);
  } catch (err) {
    console.error('Falha ao conectar com o backend PostgreSQL:', err);
  }
}

// Formata valor abreviado em Bilhões/Milhões de Berries
function formatCompactBerries(val) {
  const num = Number(val);
  if (isNaN(num)) return val;
  if (num >= 1e9) return (num / 1e9).toFixed(3).replace(/\.?0+$/, '') + ' B ฿';
  if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + ' M ฿';
  return new Intl.NumberFormat('pt-BR').format(num) + ' ฿';
}

// Preenche os 4 KPIs e contadores do cabeçalho a partir do PostgreSQL
function renderKPIs(kpis) {
  if (!kpis) return;

  const setElText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setElText('subtitle-tables-count', kpis.totalTabelas);
  setElText('tab-schema-count', kpis.totalTabelas);
  setElText('schema-header-count', kpis.totalTabelas);

  setElText('kpi-max-bounty', formatCompactBerries(kpis.maxBandoBounty));
  setElText('kpi-max-bando', kpis.maxBandoNome);
  setElText('kpi-total-tables', `${kpis.totalTabelas} Tabelas`);
  setElText('kpi-total-pessoas', `${kpis.totalPessoas} Personagens`);
  setElText('kpi-total-akuma', `${kpis.totalAkuma} Frutas`);
}

// Preenche o Banner WANTED dinamicamente com o capitão retornado pelo PostgreSQL
function renderFeaturedCaptain(cap) {
  if (!cap) return;

  const setElText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const pos = cap.posicao_ranking || (currentCaptainIndex + 1);
  const totalCaps = featuredCaptainsList.length || 1;

  setElText('wanted-captain-counter', `${pos} / ${totalCaps}`);
  setElText('wanted-banner-heading', `Capitão em Destaque no Banco de Dados (#${pos} em Recompensa de Bando)`);
  setElText('wanted-char-name', String(cap.nome || '').toUpperCase());
  setElText('wanted-char-bounty', new Intl.NumberFormat('pt-BR').format(Number(cap.recompensa || 0)) + '-');
  setElText('wanted-badge-title', `${cap.cargo || 'Capitão'} (${cap.titulos || 'Pirata'})`);
  setElText('wanted-badge-crew', cap.bando || 'Independente');
  setElText(
    'wanted-badge-fruit',
    cap.fruta && cap.fruta !== 'Nenhuma' ? `${cap.fruta} (${cap.tipo_fruta})` : 'Sem Akuma no Mi'
  );

  const descEl = document.getElementById('wanted-desc-text');
  if (descEl) {
    const somaStr = new Intl.NumberFormat('pt-BR').format(Number(cap.soma_recompensas_bando || 0));
    descEl.innerHTML = `Detentor do título <strong>${escapeHtml(cap.titulos)}</strong> (${escapeHtml(cap.alcunha ? `"${cap.alcunha}"` : '')}) e líder do bando <strong>${escapeHtml(cap.bando)}</strong> com recompensa acumulada no banco de <strong>฿ ${somaStr} Berries</strong>. Registro consultado ao vivo via relacionamentos: <code>Pessoa</code> ➔ <code>Pirata</code> ➔ <code>Pessoa_Cargo</code> ➔ <code>Cargo</code> ➔ <code>Organizacao</code> (Bando).`;
  }

  setElText('wanted-stat-bounty', formatBerries(cap.recompensa));
  setElText('wanted-stat-origin', `${cap.terra_natal || '-'} (${cap.mar || '-'})`);
  setElText('wanted-stat-species', cap.especie || '-');
  setElText('wanted-stat-combat', cap.sistemas_combate || 'Combate Pirata');
}

function setupCaptainCarousel() {
  const btnPrev = document.getElementById('btn-prev-captain');
  const btnNext = document.getElementById('btn-next-captain');
  if (!btnPrev || !btnNext || btnPrev.dataset.bound === 'true') return;

  btnPrev.dataset.bound = 'true';
  btnNext.dataset.bound = 'true';

  btnPrev.addEventListener('click', () => {
    if (featuredCaptainsList.length <= 1) return;
    currentCaptainIndex = (currentCaptainIndex - 1 + featuredCaptainsList.length) % featuredCaptainsList.length;
    renderFeaturedCaptain(featuredCaptainsList[currentCaptainIndex]);
  });

  btnNext.addEventListener('click', () => {
    if (featuredCaptainsList.length <= 1) return;
    currentCaptainIndex = (currentCaptainIndex + 1) % featuredCaptainsList.length;
    renderFeaturedCaptain(featuredCaptainsList[currentCaptainIndex]);
  });
}

// Renderiza o Modelo Relacional (Aba 3) dinamicamente a partir do information_schema do PostgreSQL
function renderSchemaFromDB(tables) {
  const container = document.getElementById('schema-grid-container');
  if (!container || !Array.isArray(tables) || tables.length === 0) return;

  // Classificação automática pelas constraints reais (PK e FK) do banco
  const independent = [];
  const specializationsByParent = {};
  const associativeNN = [];
  const dependent = [];

  tables.forEach(t => {
    if (t.pk_count > 1) {
      // PK composta => Tabela Associativa N:N
      associativeNN.push(t);
    } else if (!t.fk_targets) {
      // Sem FK => Entidade Independente
      independent.push(t);
    } else if (t.pk_count === 1 && t.pk_cols === t.fk_cols) {
      // PK simples que também é a própria FK => Especialização 1:1 (Herança)
      const parent = t.fk_targets;
      if (!specializationsByParent[parent]) specializationsByParent[parent] = [];
      specializationsByParent[parent].push(t);
    } else {
      // Possui PK própria e FKs para outras tabelas => Entidade Dependente (1:N)
      dependent.push(t);
    }
  });

  const totalSpecCount = Object.values(specializationsByParent).reduce((acc, arr) => acc + arr.length, 0);

  const formatTableName = (name) =>
    name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_');

  container.innerHTML = `
    <!-- Card 1: Entidades Independentes -->
    <div class="schema-block">
      <div class="block-title red"><i class="fa-solid fa-cube"></i> Entidades Independentes (${independent.length})</div>
      <ul class="table-list">
        ${independent.map(t => `
          <li class="schema-table-item" data-table="${escapeHtml(t.table_name)}" style="cursor:pointer;" title="Clique para executar SELECT * FROM ${escapeHtml(t.table_name)}">
            <span class="tb-name"><i class="fa-solid fa-table" style="color:#38bdf8;"></i> ${escapeHtml(formatTableName(t.table_name))}</span>
            <span class="tb-pk">PK: ${escapeHtml(t.pk_cols)}</span>
          </li>
        `).join('')}
      </ul>
    </div>

    <!-- Card 2: Especializações / Herança 1:1 -->
    <div class="schema-block">
      <div class="block-title blue"><i class="fa-solid fa-sitemap"></i> Especializações 1:1 (${totalSpecCount})</div>
      ${Object.entries(specializationsByParent).map(([parent, children]) => `
        <div class="spec-group">
          <div class="spec-parent schema-table-item" data-table="${escapeHtml(parent)}" style="cursor:pointer;" title="Clique para consultar ${escapeHtml(parent)}">
            <i class="fa-solid fa-layer-group"></i> ${escapeHtml(formatTableName(parent))} (Superclasse)
          </div>
          <div class="spec-children">
            ${children.map(c => `
              <span class="tb-badge schema-table-item" data-table="${escapeHtml(c.table_name)}" style="cursor:pointer;" title="PK/FK: ${escapeHtml(c.pk_cols)} ➔ ${escapeHtml(parent)}">
                <i class="fa-solid fa-diagram-subtask"></i> ${escapeHtml(formatTableName(c.table_name))}
              </span>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Card 3: Relacionamentos N:N -->
    <div class="schema-block">
      <div class="block-title purple"><i class="fa-solid fa-link"></i> Relacionamentos N:N (${associativeNN.length})</div>
      <ul class="table-list">
        ${associativeNN.map(t => `
          <li class="schema-table-item" data-table="${escapeHtml(t.table_name)}" style="cursor:pointer;" title="Clique para executar SELECT * FROM ${escapeHtml(t.table_name)}">
            <span class="tb-name"><i class="fa-solid fa-link" style="color:#c084fc;"></i> ${escapeHtml(formatTableName(t.table_name))}</span>
            <span class="tb-fk">PK (${escapeHtml(t.pk_cols)})</span>
          </li>
        `).join('')}
      </ul>
    </div>

    <!-- Card 4: Entidades Dependentes -->
    <div class="schema-block">
      <div class="block-title gold"><i class="fa-solid fa-diagram-next"></i> Entidades Dependentes (${dependent.length})</div>
      <ul class="table-list">
        ${dependent.map(t => `
          <li class="schema-table-item" data-table="${escapeHtml(t.table_name)}" style="cursor:pointer;" title="Clique para executar SELECT * FROM ${escapeHtml(t.table_name)}">
            <span class="tb-name"><i class="fa-solid fa-diagram-next" style="color:#ffd166;"></i> ${escapeHtml(formatTableName(t.table_name))}</span>
            <span class="tb-fk">FK ➔ ${escapeHtml(t.fk_targets)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `;

  // Ao clicar em qualquer tabela da Aba 3, abre o Console SQL (Aba 2) e executa SELECT * FROM <tabela>
  container.querySelectorAll('.schema-table-item').forEach(el => {
    el.addEventListener('click', () => {
      const tbName = el.getAttribute('data-table');
      if (!tbName) return;
      const sql = `SELECT * FROM ${tbName} LIMIT 50;`;
      const textarea = document.getElementById('custom-sql-input');
      if (textarea) textarea.value = sql;
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      const queryTabBtn = document.querySelector('.nav-tab[data-tab="tab-queries"]');
      queryTabBtn?.click();
      runCustomQuery(sql);
      showToast(`Consultando tabela "${tbName}" no PostgreSQL!`);
    });
  });
}

// Render Charts from PostgreSQL live data
function initChartsWithData(data) {
  const busca3 = data.busca3 || [];
  const busca1 = data.busca1 || [];
  const akumaDist = data.akumaDist || [];
  const marineDist = data.marineDist || [];

  // Chart 1: Bounty (Bar Chart)
  const ctxBounty = document.getElementById('chartBounty')?.getContext('2d');
  if (ctxBounty) {
    if (chartInstances.bounty) chartInstances.bounty.destroy();
    chartInstances.bounty = new Chart(ctxBounty, {
      type: 'bar',
      data: {
        labels: busca3.map(d => d.bando.replace('Piratas do ', '').replace('Piratas ', '')),
        datasets: [{
          label: 'Soma Total das Recompensas (em Bilhões ฿)',
          data: busca3.map(d => (Number(d.soma_recompensas) / 1e9).toFixed(2)),
          backgroundColor: [
            '#ffd166', '#f43f5e', '#38bdf8', '#c084fc', '#34d399',
            '#fb923c', '#a78bfa', '#f472b6', '#38bdf8', '#fbbf24', '#94a3b8'
          ],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { family: 'Outfit' } } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { family: 'Outfit' } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#94a3b8', font: { family: 'Outfit' }, callback: v => v + ' B ฿' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // Chart 2: Akuma Types (Doughnut)
  const ctxAkuma = document.getElementById('chartAkuma')?.getContext('2d');
  if (ctxAkuma) {
    if (chartInstances.akuma) chartInstances.akuma.destroy();
    chartInstances.akuma = new Chart(ctxAkuma, {
      type: 'doughnut',
      data: {
        labels: akumaDist.map(d => `${d.tipo} (${d.qtd})`),
        datasets: [{
          data: akumaDist.map(d => d.qtd),
          backgroundColor: ['#38bdf8', '#f43f5e', '#ffd166'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Outfit', size: 14 } } }
        }
      }
    });
  }

  // Chart 3: Shichibukai
  const ctxShichi = document.getElementById('chartShichibukai')?.getContext('2d');
  if (ctxShichi) {
    if (chartInstances.shichi) chartInstances.shichi.destroy();
    chartInstances.shichi = new Chart(ctxShichi, {
      type: 'bar',
      data: {
        labels: busca1.map(d => d.personagem),
        datasets: [{
          label: 'Recompensa Individual (Bilhões ฿)',
          data: busca1.map(d => (Number(d.recompensa) / 1e9).toFixed(2)),
          backgroundColor: 'rgba(255, 209, 102, 0.85)',
          borderColor: '#ffd166',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#94a3b8' } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#f8fafc' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // Chart 4: Marines by Rank
  const ctxMarines = document.getElementById('chartMarines')?.getContext('2d');
  if (ctxMarines) {
    if (chartInstances.marines) chartInstances.marines.destroy();
    chartInstances.marines = new Chart(ctxMarines, {
      type: 'polarArea',
      data: {
        labels: marineDist.map(d => `${d.patente} (${d.qtd})`),
        datasets: [{
          data: marineDist.map(d => d.qtd),
          backgroundColor: ['rgba(56, 189, 248, 0.7)', 'rgba(244, 63, 94, 0.7)', 'rgba(192, 132, 252, 0.7)', 'rgba(255, 209, 102, 0.7)']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8' } }
        },
        scales: {
          r: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { display: false } }
        }
      }
    });
  }
}

// Tab Switching
function initTabs() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

      tab.classList.add("active");
      const targetId = tab.getAttribute("data-tab");
      document.getElementById(targetId)?.classList.add("active");
    });
  });
}

// Real PostgreSQL Custom SQL Evaluator (Live DB Container Connection)
async function runCustomQuery(rawSql) {
  const sql = (rawSql || "").trim();
  const statusBox = document.getElementById("sql-status-bar");
  const statusMsg = document.getElementById("sql-status-msg");
  const thead = document.getElementById("custom-sql-thead");
  const tbody = document.getElementById("custom-sql-tbody");

  if (!sql) {
    if (statusBox) statusBox.className = "sql-status-bar error";
    if (statusMsg) statusMsg.textContent = "Erro de Sintaxe: O campo de consulta SQL não pode estar vazio.";
    return;
  }

  if (statusBox) statusBox.className = "sql-status-bar";
  if (statusMsg) statusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executando consulta no container PostgreSQL (db:5432)...';

  try {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql })
    });

    const data = await response.json();

    if (!data.success) {
      if (statusBox) statusBox.className = "sql-status-bar error";
      if (statusMsg) statusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Erro de Execução no PostgreSQL:</strong> ${data.error}`;
      if (thead) thead.innerHTML = "";
      if (tbody) tbody.innerHTML = "";
      return;
    }

    const headers = data.columns || [];
    const rows = data.rows || [];

    // Render Table Headers
    if (thead) {
      thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
    }

    // Render Table Rows
    if (tbody) {
      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${headers.length || 1}" style="text-align:center; color: var(--text-muted);">Nenhum registro retornado para esta instrução no banco.</td></tr>`;
      } else {
        tbody.innerHTML = rows.map(row => {
          const cells = headers.map(h => {
            let val = row[h];
            if (val === null || val === undefined) return '<span style="color: var(--text-muted);">-</span>';
            if (typeof val === 'number' || (!isNaN(val) && (h.includes('recompensa') || h.includes('soma')))) {
              if (h.includes('recompensa') || h.includes('soma')) {
                return `<strong style="color: var(--gold);">${formatBerries(val)}</strong>`;
              }
            }
            return String(val);
          });
          return `<tr>${cells.map(c => `<td>${c}</td>`).join("")}</tr>`;
        }).join("");
      }
    }

    // Update Status Bar with real PostgreSQL statistics
    if (statusBox) statusBox.className = "sql-status-bar";
    if (statusMsg) {
      statusMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> Query executada com sucesso no container PostgreSQL (db:5432) — <strong>${data.rowCount} registro(s) retornado(s)</strong> em ${data.executionTimeMs}ms.`;
    }
  } catch (err) {
    console.error(err);
    if (statusBox) statusBox.className = "sql-status-bar error";
    if (statusMsg) statusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>Falha de Conexão com o Backend:</strong> ${err.message}`;
  }
}

// Custom SQL Editor Controller
function initCustomSQLConsole() {
  const textarea = document.getElementById("custom-sql-input");
  const btnRun = document.getElementById("btn-run-sql");
  const btnClear = document.getElementById("btn-clear-sql");
  const presetBtns = document.querySelectorAll(".btn-preset");

  // Load Initial Preset Query (q1)
  if (textarea) {
    textarea.value = presetQueries.q1;
    runCustomQuery(presetQueries.q1);
  }

  // Preset Buttons Click Handler
  presetBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      presetBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.getAttribute("data-preset");
      if (key && presetQueries[key] && textarea) {
        textarea.value = presetQueries[key];
        runCustomQuery(presetQueries[key]);
      }
    });
  });

  // Run SQL Button Click
  btnRun?.addEventListener("click", () => {
    if (textarea) runCustomQuery(textarea.value);
  });

  // Clear SQL Button Click
  btnClear?.addEventListener("click", () => {
    if (textarea) {
      textarea.value = "";
      textarea.focus();
    }
  });

  // Ctrl + Enter Keyboard Shortcut
  textarea?.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      runCustomQuery(textarea.value);
    }
  });
}

// Toast Helper
function showToast(msg) {
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-msg");
  if (toast && toastMsg) {
    toastMsg.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  }
}

// Theme Toggle (Parchment Fandom vs Abyssal Sea)
function initThemeToggle() {
  const btn = document.getElementById("btn-theme-toggle");
  btn?.addEventListener("click", () => {
    document.body.classList.toggle("theme-parchment");
    const isParchment = document.body.classList.contains("theme-parchment");
    btn.innerHTML = isParchment ? 
      '<i class="fa-solid fa-moon"></i> Modo Mar Abissal' : 
      '<i class="fa-solid fa-map"></i> Tema Pergaminho';
    showToast(isParchment ? "Tema Pergaminho Fandom ativado!" : "Tema Mar Abissal ativado!");
  });
}

// ==========================================================================
// ONEPIECEDLE CLÁSSICO - LÓGICA DO JOGO
// ==========================================================================

const onepieceGame = {
  targetId: null,
  mode: 'daily', // 'daily' ou 'random'
  currentDate: null,
  allCharacters: [],
  guesses: [],
  hints: [],
  revealedHintsCount: 0,
  isWon: false,
  isSubmitting: false,
  selectedAutocompleteIndex: -1
};

async function initOnepiecedle() {
  await loadCharactersList();
  setupAutocomplete();
  setupGameControls();
  await startDailyGame();
}

// Carrega lista de personagens para busca
async function loadCharactersList() {
  try {
    const res = await fetch('/api/onepiecedle/characters');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      onepieceGame.allCharacters = data;
    }
  } catch (err) {
    console.error('Erro ao carregar lista de personagens do Onepiecedle:', err);
  }
  return onepieceGame.allCharacters.length > 0;
}

// Escapa texto para uso seguro em HTML/atributos
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Marca a rodada como vencida (usado ao acertar e ao restaurar progresso)
function markGameWon(targetChar, scroll = true) {
  onepieceGame.isWon = true;
  const input = document.getElementById('onepiecedle-input');
  if (input) input.disabled = true;

  const statusPill = document.getElementById('game-status-pill');
  if (statusPill) {
    statusPill.textContent = 'Descoberto! 👑';
    statusPill.className = 'badge badge-gold';
  }
  showVictoryCard(targetChar, onepieceGame.guesses.length, scroll);
}

// Inicia modo diário oficial
async function startDailyGame() {
  resetGameUI();
  onepieceGame.mode = 'daily';
  updateModeButtons();

  try {
    const res = await fetch('/api/onepiecedle/daily');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    onepieceGame.targetId = data.target_id;
    onepieceGame.currentDate = data.date;

    // Tenta restaurar progresso salvo do dia no localStorage
    const savedState = localStorage.getItem(`onepiecedle_${data.date}`);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        for (const prevGuess of parsed.guesses || []) {
          renderGuessRow(prevGuess);
          onepieceGame.guesses.push(prevGuess);
        }
        updateTriesCounter();
        if (parsed.isWon && parsed.targetRevealed) {
          markGameWon(parsed.targetRevealed, false);
        }
      } catch (e) {
        console.error('Erro ao restaurar progresso:', e);
        localStorage.removeItem(`onepiecedle_${data.date}`);
      }
    }
  } catch (err) {
    console.error('Erro ao iniciar jogo diário:', err);
    showToast("Não foi possível carregar o desafio diário. Verifique o backend.");
  }
}

// Inicia modo aleatório livre
async function startRandomGame() {
  resetGameUI();
  onepieceGame.mode = 'random';
  updateModeButtons();

  try {
    const res = await fetch('/api/onepiecedle/random');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    onepieceGame.targetId = data.target_id;
    showToast("Nova partida aleatória iniciada! Boa sorte.");
  } catch (err) {
    console.error('Erro ao iniciar jogo aleatório:', err);
    showToast("Não foi possível sortear um personagem. Verifique o backend.");
  }
}

function updateModeButtons() {
  const btnDaily = document.getElementById('btn-mode-daily');
  const btnRandom = document.getElementById('btn-mode-random');
  if (btnDaily && btnRandom) {
    btnDaily.classList.toggle('active', onepieceGame.mode === 'daily');
    btnRandom.classList.toggle('active', onepieceGame.mode === 'random');
  }
}

function resetGameUI() {
  onepieceGame.guesses = [];
  onepieceGame.hints = [];
  onepieceGame.revealedHintsCount = 0;
  onepieceGame.isWon = false;
  onepieceGame.selectedAutocompleteIndex = -1;

  const list = document.getElementById('guesses-list');
  if (list) list.innerHTML = '';

  const hintsBox = document.getElementById('onepiecedle-hints-box');
  if (hintsBox) {
    hintsBox.innerHTML = '';
    hintsBox.classList.add('hidden');
  }
  const hintCounter = document.getElementById('hint-counter');
  if (hintCounter) hintCounter.textContent = '0/3';

  const input = document.getElementById('onepiecedle-input');
  if (input) {
    input.value = '';
    input.disabled = false;
  }

  const victoryCard = document.getElementById('onepiecedle-victory-card');
  if (victoryCard) victoryCard.classList.add('hidden');

  updateTriesCounter();

  const statusPill = document.getElementById('game-status-pill');
  if (statusPill) {
    statusPill.textContent = 'Em Andamento';
    statusPill.className = 'badge badge-blue';
  }
}

// Solicita e revela progressivamente até 3 dicas do personagem secreto consultadas no PostgreSQL
async function requestNextHint() {
  if (onepieceGame.isWon) {
    showToast('Você já descobriu o personagem desta rodada!');
    return;
  }
  if (!onepieceGame.targetId) return;

  if (onepieceGame.revealedHintsCount >= 3) {
    showToast('Todas as 3 dicas desta rodada já foram reveladas!');
    return;
  }

  try {
    if (onepieceGame.hints.length === 0) {
      const res = await fetch(`/api/onepiecedle/hint/${onepieceGame.targetId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onepieceGame.hints = data.hints || [];
    }

    const nextHint = onepieceGame.hints[onepieceGame.revealedHintsCount];
    if (!nextHint) return;

    onepieceGame.revealedHintsCount += 1;

    const hintCounter = document.getElementById('hint-counter');
    if (hintCounter) hintCounter.textContent = `${onepieceGame.revealedHintsCount}/3`;

    const hintsBox = document.getElementById('onepiecedle-hints-box');
    if (hintsBox) {
      hintsBox.classList.remove('hidden');
      const item = document.createElement('div');
      item.className = 'stat-pill';
      item.style.borderLeft = '3px solid var(--gold)';
      item.innerHTML = `<strong style="color: var(--gold);"><i class="fa-solid fa-lightbulb"></i> ${escapeHtml(nextHint.title)}:</strong> <span>${escapeHtml(nextHint.text)}</span>`;
      hintsBox.appendChild(item);
    }
  } catch (err) {
    console.error('Erro ao buscar dica:', err);
    showToast('Não foi possível consultar a dica no banco.');
  }
}

function updateTriesCounter() {
  const counter = document.getElementById('game-tries-counter');
  if (counter) counter.textContent = onepieceGame.guesses.length;
}

// Configuração do Input e Autocomplete
function setupAutocomplete() {
  const input = document.getElementById('onepiecedle-input');
  const dropdown = document.getElementById('autocomplete-list');
  const btnSubmit = document.getElementById('btn-submit-guess');

  if (!input || !dropdown) return;

  function filterAndShowDropdown() {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      return;
    }

    // Filtra personagens (excluindo os já palpitados nesta rodada)
    const q = normalizeText(query);
    const guessedIds = new Set(onepieceGame.guesses.map(g => g.id_pessoa || g.name?.value?.toLowerCase()));
    const matches = onepieceGame.allCharacters.filter(c => {
      const matchName = normalizeText(c.nome).includes(q);
      const matchAlcunha = normalizeText(c.alcunha).includes(q);
      const notGuessed = !guessedIds.has(c.id_pessoa) && !guessedIds.has(c.nome.toLowerCase());
      return (matchName || matchAlcunha) && notGuessed;
    }).slice(0, 8); // Top 8 resultados

    if (matches.length === 0) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      return;
    }

    dropdown.innerHTML = matches.map((char, idx) => `
      <li class="autocomplete-item ${idx === onepieceGame.selectedAutocompleteIndex ? 'selected' : ''}" 
          data-id="${char.id_pessoa}" 
          data-name="${escapeHtml(char.nome)}">
        <div>
          <span class="autocomplete-item-name">${escapeHtml(char.nome)}</span>
          ${char.alcunha ? `<span class="autocomplete-item-sub">("${escapeHtml(char.alcunha)}")</span>` : ''}
        </div>
        <span class="badge badge-gold" style="font-size: 0.7rem;">${escapeHtml(char.afiliacao)}</span>
      </li>
    `).join('');

    dropdown.classList.remove('hidden');
  }

  // Delegação de eventos no dropdown (evita perda de foco antes do clique)
  dropdown.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.autocomplete-item');
    if (!item) return;
    const charId = parseInt(item.getAttribute('data-id'), 10);
    const charName = item.getAttribute('data-name');
    input.value = charName;
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    submitCurrentGuess(charId || charName);
  });

  input.addEventListener('input', () => {
    onepieceGame.selectedAutocompleteIndex = -1;
    filterAndShowDropdown();
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) {
      filterAndShowDropdown();
    }
  });

  // Teclado (Navegação com Setas e Enter)
  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.autocomplete-item');
    const isDropdownVisible = !dropdown.classList.contains('hidden') && items.length > 0;

    if (isDropdownVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onepieceGame.selectedAutocompleteIndex = (onepieceGame.selectedAutocompleteIndex + 1) % items.length;
        updateSelectedAutocomplete(items);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onepieceGame.selectedAutocompleteIndex = (onepieceGame.selectedAutocompleteIndex - 1 + items.length) % items.length;
        updateSelectedAutocomplete(items);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (onepieceGame.selectedAutocompleteIndex >= 0 && items[onepieceGame.selectedAutocompleteIndex]) {
          const selected = items[onepieceGame.selectedAutocompleteIndex];
          const charId = parseInt(selected.getAttribute('data-id'), 10);
          const selectedName = selected.getAttribute('data-name');
          input.value = selectedName;
          dropdown.classList.add('hidden');
          dropdown.innerHTML = '';
          submitCurrentGuess(charId || selectedName);
        } else if (items.length > 0) {
          const first = items[0];
          const charId = parseInt(first.getAttribute('data-id'), 10);
          const firstName = first.getAttribute('data-name');
          input.value = firstName;
          dropdown.classList.add('hidden');
          dropdown.innerHTML = '';
          submitCurrentGuess(charId || firstName);
        }
        return;
      }
      if (e.key === 'Escape') {
        dropdown.classList.add('hidden');
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      dropdown.classList.add('hidden');
      submitCurrentGuess(input.value.trim());
    }
  });

  // Fechar dropdown ao clicar fora
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  btnSubmit?.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    submitCurrentGuess(input.value.trim());
  });
}

function updateSelectedAutocomplete(items) {
  items.forEach((item, idx) => {
    item.classList.toggle('selected', idx === onepieceGame.selectedAutocompleteIndex);
    if (idx === onepieceGame.selectedAutocompleteIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

// Normaliza texto para busca (minúsculo e sem acentos)
function normalizeText(str) {
  return String(str ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Encontra o personagem digitado com alta tolerância (ID, busca exata, início de nome ou inclusão)
function resolveCharacter(identifier) {
  if (identifier === null || identifier === undefined) return null;
  const chars = onepieceGame.allCharacters;
  if (!chars || chars.length === 0) return null;

  // Se já for um ID numérico ou string numérica
  if (typeof identifier === 'number') {
    return chars.find(c => c.id_pessoa === identifier) || null;
  }
  const str = String(identifier).trim();
  const num = parseInt(str, 10);
  if (!isNaN(num) && String(num) === str) {
    const byId = chars.find(c => c.id_pessoa === num);
    if (byId) return byId;
  }

  const q = normalizeText(str);
  if (!q) return null;

  // 1. Busca exata por nome ou alcunha
  const exact = chars.find(c => normalizeText(c.nome) === q || normalizeText(c.alcunha) === q);
  if (exact) return exact;

  // 2. Busca por nome ou alcunha que começa com o termo digitado
  const startsWith = chars.filter(c => normalizeText(c.nome).startsWith(q) || normalizeText(c.alcunha).startsWith(q));
  if (startsWith.length > 0) return startsWith[0];

  // 3. Busca por inclusão geral (pega o primeiro correspondente ordenado)
  const partial = chars.filter(c => normalizeText(c.nome).includes(q) || normalizeText(c.alcunha).includes(q));
  if (partial.length > 0) return partial[0];

  return null;
}

// Submeter Palpite
async function submitCurrentGuess(identifier) {
  if (onepieceGame.isSubmitting) return;

  if (onepieceGame.isWon) {
    showToast("Você já acertou esta rodada! Inicie uma nova partida.");
    return;
  }

  if (!identifier) {
    showToast("Digite o nome de um personagem para palpitar.");
    return;
  }

  const input = document.getElementById('onepiecedle-input');
  const btnSubmit = document.getElementById('btn-submit-guess');
  const originalBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';

  try {
    onepieceGame.isSubmitting = true;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Palpitando...';
    }
    if (input) input.disabled = true;

    // Garante que a lista de personagens e o alvo estejam carregados
    if (onepieceGame.allCharacters.length === 0) await loadCharactersList();
    if (!onepieceGame.targetId) {
      if (onepieceGame.mode === 'daily') await startDailyGame(); else await startRandomGame();
      if (!onepieceGame.targetId) return;
    }

    const char = resolveCharacter(identifier);
    if (!char) {
      showToast("Personagem não encontrado. Escolha um nome da lista de sugestões.");
      return;
    }

    // Verifica se já palpitou esse personagem
    const alreadyGuessed = onepieceGame.guesses.some(g => 
      (g.id_pessoa && g.id_pessoa === char.id_pessoa) ||
      normalizeText(g.name?.value) === normalizeText(char.nome)
    );
    if (alreadyGuessed) {
      showToast(`Você já tentou "${char.nome}"! Tente outro.`);
      return;
    }

    const response = await fetch('/api/onepiecedle/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_id: onepieceGame.targetId,
        guess_id: char.id_pessoa
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showToast(data.detail || data.error || "Personagem não encontrado no banco de dados.");
      return;
    }

    // Limpa campo de busca
    if (input) input.value = '';

    // Anexa id_pessoa à estrutura da comparação para rastreamento seguro
    data.comparison.id_pessoa = char.id_pessoa;

    // Adiciona palpite à lista (mais recente no topo)
    onepieceGame.guesses.unshift(data.comparison);
    renderGuessRow(data.comparison, true);
    updateTriesCounter();

    // Salva estado diário
    if (onepieceGame.mode === 'daily' && onepieceGame.currentDate) {
      localStorage.setItem(`onepiecedle_${onepieceGame.currentDate}`, JSON.stringify({
        guesses: onepieceGame.guesses,
        isWon: data.is_correct,
        targetRevealed: data.target_revealed
      }));
    }

    // Se acertou!
    if (data.is_correct) {
      markGameWon(data.target_revealed);
      showToast("🎉 PARABÉNS! Você descobriu o personagem misterioso!");
    } else {
      setTimeout(() => {
        if (!onepieceGame.isWon && input) {
          input.focus();
        }
      }, 100);
    }
  } catch (err) {
    console.error('Erro ao enviar palpite:', err);
    showToast("Erro de comunicação com o servidor.");
  } finally {
    onepieceGame.isSubmitting = false;
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalBtnHtml;
    }
    if (input && !onepieceGame.isWon) {
      input.disabled = false;
    }
  }
}

// Renderiza uma linha de palpite com os 7 blocos coloridos
function renderGuessRow(cmp, prepend = false) {
  const container = document.getElementById('guesses-list');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'guess-row';

  // Seta de recompensa
  let bountyIcon = '';
  let bountyDirText = '';
  if (cmp.bounty.direction === 'higher') {
    bountyIcon = '<span class="arrow-indicator">⬆️</span>';
    bountyDirText = '<span class="bounty-sub">Maior</span>';
  } else if (cmp.bounty.direction === 'lower') {
    bountyIcon = '<span class="arrow-indicator">⬇️</span>';
    bountyDirText = '<span class="bounty-sub">Menor</span>';
  } else {
    bountyIcon = '<span>🎯</span>';
    bountyDirText = '<span class="bounty-sub">Exato</span>';
  }

  row.innerHTML = `
    <!-- 1. Personagem -->
    <div class="guess-tile char-tile">
      <div class="guess-char-name">${cmp.name.value}</div>
      ${cmp.name.alcunha ? `<div class="guess-char-sub">"${cmp.name.alcunha}"</div>` : ''}
    </div>

    <!-- 2. Gênero -->
    <div class="guess-tile ${cmp.gender.status}">
      <span>${cmp.gender.value}</span>
    </div>

    <!-- 3. Espécie -->
    <div class="guess-tile ${cmp.species.status}">
      <span>${cmp.species.value}</span>
    </div>

    <!-- 4. Afiliação -->
    <div class="guess-tile ${cmp.affiliation.status}">
      <span>${cmp.affiliation.value}</span>
    </div>

    <!-- 5. Akuma no Mi -->
    <div class="guess-tile ${cmp.fruit_type.status}">
      <span>${cmp.fruit_type.value}</span>
    </div>

    <!-- 6. Origem (Mar) -->
    <div class="guess-tile ${cmp.sea.status}">
      <span>${cmp.sea.value}</span>
    </div>

    <!-- 7. Recompensa -->
    <div class="guess-tile ${cmp.bounty.status}">
      <div class="bounty-val-row">
        <span>${formatBerries(cmp.bounty.value)}</span>
        ${bountyIcon}
      </div>
      ${bountyDirText}
    </div>
  `;

  if (prepend && container.firstChild) {
    container.insertBefore(row, container.firstChild);
  } else {
    container.appendChild(row);
  }
}

// Exibe cartão comemorativo de vitória
function showVictoryCard(char, tries, scroll = true) {
  const card = document.getElementById('onepiecedle-victory-card');
  const msg = document.getElementById('victory-message');
  const summary = document.getElementById('victory-character-summary');

  if (!card || !char) return;

  if (msg) {
    msg.textContent = `Você capturou ${char.nome} em ${tries} ${tries === 1 ? 'tentativa' : 'tentativas'}!`;
  }

  if (summary) {
    summary.innerHTML = `
      <div class="victory-pill"><strong>Personagem:</strong> ${escapeHtml(char.nome)} ${char.alcunha ? `("${escapeHtml(char.alcunha)}")` : ''}</div>
      <div class="victory-pill"><strong>Afiliação:</strong> ${escapeHtml(char.afiliacao)}</div>
      <div class="victory-pill"><strong>Recompensa:</strong> ${formatBerries(char.recompensa)}</div>
      <div class="victory-pill"><strong>Fruta:</strong> ${escapeHtml(char.fruta)} (${escapeHtml(char.tipo_fruta)})</div>
      <div class="victory-pill"><strong>Origem:</strong> ${escapeHtml(char.terra_natal)} (${escapeHtml(char.mar)})</div>
    `;
  }

  card.classList.remove('hidden');
  if (scroll) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Controles do Jogo
function setupGameControls() {
  document.getElementById('btn-mode-daily')?.addEventListener('click', () => {
    if (onepieceGame.mode !== 'daily') startDailyGame();
  });

  document.getElementById('btn-mode-random')?.addEventListener('click', () => {
    if (onepieceGame.mode !== 'random') startRandomGame();
  });

  document.getElementById('btn-get-hint')?.addEventListener('click', () => {
    requestNextHint();
  });

  document.getElementById('btn-restart-game')?.addEventListener('click', () => {
    if (onepieceGame.mode === 'daily') {
      if (confirm('Deseja reiniciar a tentativa do desafio diário?')) {
        localStorage.removeItem(`onepiecedle_${onepieceGame.currentDate}`);
        startDailyGame();
      }
    } else {
      startRandomGame();
    }
  });

  document.getElementById('btn-play-again')?.addEventListener('click', () => {
    startRandomGame();
  });
}

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initThemeToggle();
  initCustomSQLConsole();
  loadPostgresStats();
  initOnepiecedle();
});


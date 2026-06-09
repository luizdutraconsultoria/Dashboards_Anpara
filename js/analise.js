let _data    = null;
let _charts  = {};
let _detalhes = [];

const _state = {
  sort:   { col: 'data_cancelamento', dir: 'desc' },
  page:   1,
  search: '',
};

const PP = 50;

/* ——— LOAD ——— */

async function init() {
  showLoading(true);
  hideError();
  try {
    _data = await API.analiseChurn();
    if (_data.erro) {
      showError(_data.erro);
      return;
    }
    _detalhes = _data.detalhes || [];
    render();
  } catch (e) {
    showError('Falha ao carregar dados: ' + e.message);
  } finally {
    showLoading(false);
  }
}

/* ——— RENDER ——— */

function render() {
  if (!_data) return;

  setEl('ts', `Análise do histórico de cancelamentos`);

  /* Stats globais */
  const total = _data.total_cancelamentos || 0;
  setEl('stat-total', fmtNum(total));

  /* Cancelamentos este mês (último mês em por_mes) */
  const pm = _data.por_mes || [];
  const agora = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;
  const entradaMesAtual = pm.find(m => m.mes === mesAtual);
  setEl('stat-mes-atual', fmtNum(entradaMesAtual ? entradaMesAtual.cancelamentos : 0));

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  setEl('lbl-stat-mes', `Cancelamentos — ${months[agora.getMonth()]}/${agora.getFullYear()}`);

  /* Média dos últimos 12 meses */
  const ultimos12 = pm.slice(-12);
  const media = ultimos12.length > 0
    ? Math.round(ultimos12.reduce((s, m) => s + m.cancelamentos, 0) / ultimos12.length)
    : 0;
  setEl('stat-media', fmtNum(media));

  /* Dropdowns de filtro (para a tabela) */
  _populateRegionals();
  _populateOperadoras();

  /* Gráficos (histórico completo, sem filtros topbar) */
  renderChurnChart();
  renderRegionalChart();
  renderOperadoraChart();
  renderTempoChart();

  /* Tabela (com filtros topbar) */
  _state.page = 1;
  renderTabela();
}

function rerender() {
  if (!_data) return;
  _state.page = 1;
  renderTabela();
}

/* ——— DROPDOWNS ——— */

function _populateRegionals() {
  const sel = document.getElementById('sel-regional');
  if (!sel) return;
  const vals = [...new Set((_data.por_regional || []).map(r => r.regional))].sort();
  while (sel.options.length > 1) sel.remove(1);
  vals.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
}

function _populateOperadoras() {
  const sel = document.getElementById('sel-operadora');
  if (!sel) return;
  const vals = [...new Set((_data.por_operadora || []).map(o => o.operadora))].sort();
  while (sel.options.length > 1) sel.remove(1);
  vals.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
}

/* ——— CHART: TENDÊNCIA MENSAL ——— */

function renderChurnChart() {
  const pm  = _data.por_mes || [];
  const ctx = document.getElementById('chart-churn');
  if (!ctx) return;
  if (_charts.churn) _charts.churn.destroy();

  if (pm.length === 0) {
    _emptyChart(ctx, 'Sem dados mensais na planilha');
    return;
  }

  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const labels = pm.map(m => {
    const [y, mo] = m.mes.split('-');
    return `${months[Number(mo)-1]}/${String(y).slice(2)}`;
  });

  _charts.churn = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Cancelamentos',
          data:  pm.map(m => m.cancelamentos),
          backgroundColor: 'rgba(255,107,107,0.65)',
          borderColor:     '#FF6B6B',
          borderWidth: 1,
          borderRadius: 4,
          order: 2,
        },
        {
          label: 'Média',
          data:  pm.map(() => Math.round(pm.reduce((s,m) => s + m.cancelamentos, 0) / pm.length)),
          type:  'line',
          borderColor: '#FDCB6E',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0,
          pointRadius: 0,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { family: 'DM Sans', size: 11 }, boxWidth: 10, boxHeight: 10 } },
        tooltip: {
          backgroundColor: '#1C2038', borderColor: '#252D44', borderWidth: 1,
          titleColor: '#E2E8F0', bodyColor: '#94A3B8', padding: 10,
          callbacks: { label: c => ` ${c.dataset.label}: ${fmtNum(c.parsed.y)}` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 } } },
        y: { grid: { color: 'rgba(37,45,68,0.5)' }, ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 } },
      },
    },
  });
}

/* ——— CHART: POR REGIONAL ——— */

function renderRegionalChart() {
  const pr  = _data.por_regional || [];
  const ctx = document.getElementById('chart-regional');
  if (!ctx) return;
  if (_charts.regional) _charts.regional.destroy();

  if (pr.length === 0) { _emptyChart(ctx, 'Sem dados por regional'); return; }

  const COLORS = ['rgba(108,92,231,0.7)','rgba(255,107,107,0.7)','rgba(0,206,201,0.7)','rgba(253,203,110,0.7)','rgba(164,176,190,0.5)'];

  _charts.regional = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels:   pr.map(r => r.regional),
      datasets: [{
        data:            pr.map(r => r.cancelamentos),
        backgroundColor: pr.map((_, i) => COLORS[i % COLORS.length]),
        borderColor:     '#131829',
        borderWidth:     2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#94A3B8', font: { family: 'DM Sans', size: 11 }, boxWidth: 10, padding: 12 } },
        tooltip: {
          backgroundColor: '#1C2038', borderColor: '#252D44', borderWidth: 1,
          titleColor: '#E2E8F0', bodyColor: '#94A3B8', padding: 10,
          callbacks: {
            label: c => {
              const tot = c.dataset.data.reduce((a, b) => a + b, 0);
              const pct = tot > 0 ? ((c.parsed / tot) * 100).toFixed(1) : 0;
              return ` ${fmtNum(c.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ——— CHART: POR OPERADORA ——— */

function renderOperadoraChart() {
  const po  = (_data.por_operadora || []).slice(0, 10);
  const ctx = document.getElementById('chart-ops');
  if (!ctx) return;
  if (_charts.ops) _charts.ops.destroy();

  if (po.length === 0) { _emptyChart(ctx, 'Sem dados por operadora'); return; }

  _charts.ops = new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   po.map(o => o.operadora),
      datasets: [{
        label: 'Cancelamentos',
        data:  po.map(o => o.cancelamentos),
        backgroundColor: 'rgba(108,92,231,0.65)',
        borderColor:     '#6C5CE7',
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1C2038', borderColor: '#252D44', borderWidth: 1,
          titleColor: '#E2E8F0', bodyColor: '#94A3B8', padding: 10,
        },
      },
      scales: {
        x: { grid: { color: 'rgba(37,45,68,0.5)' }, ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 } },
        y: { grid: { display: false }, ticks: { color: '#94A3B8', font: { family: 'DM Sans', size: 11 } } },
      },
    },
  });
}

/* ——— CHART: TEMPO DE CASA ——— */

function renderTempoChart() {
  const dt  = _data.distribuicao_tempo_casa || [];
  const ctx = document.getElementById('chart-tempo');
  if (!ctx) return;
  if (_charts.tempo) _charts.tempo.destroy();

  if (dt.length === 0) { _emptyChart(ctx, 'Sem dados de tempo de casa'); return; }

  const FAIXA_LABELS = {
    '0-30': 'Até 30d', '31-90': '31–90d', '91-180': '91–180d',
    '181-365': '6m–1a', '366-730': '1–2 anos', '730+': '2+ anos',
  };
  const ORDER = ['0-30','31-90','91-180','181-365','366-730','730+'];
  const sorted = ORDER.map(k => dt.find(d => d.faixa === k) || { faixa: k, quantidade: 0 });
  const total  = sorted.reduce((s, d) => s + d.quantidade, 0);

  _charts.tempo = new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   sorted.map(d => FAIXA_LABELS[d.faixa] || d.faixa),
      datasets: [{
        label: 'Cancelamentos',
        data:  sorted.map(d => d.quantidade),
        backgroundColor: sorted.map((_, i) => {
          const palette = ['#FF6B6B','#FDCB6E','#F0932B','#00CEC9','#6C5CE7','#A4B0BE'];
          return palette[i] + 'AA';
        }),
        borderColor: sorted.map((_, i) => {
          const palette = ['#FF6B6B','#FDCB6E','#F0932B','#00CEC9','#6C5CE7','#A4B0BE'];
          return palette[i];
        }),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1C2038', borderColor: '#252D44', borderWidth: 1,
          titleColor: '#E2E8F0', bodyColor: '#94A3B8', padding: 10,
          callbacks: {
            label: c => {
              const pct = total > 0 ? ((c.parsed.y / total) * 100).toFixed(1) : 0;
              return ` ${fmtNum(c.parsed.y)} cancelamentos (${pct}%)`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { family: 'DM Sans', size: 11 } } },
        y: { grid: { color: 'rgba(37,45,68,0.5)' }, ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 } },
      },
    },
  });
}

/* ——— TABELA ——— */

function _filterDetalhes() {
  const fs = getFilterState();
  let rows = _detalhes;

  const { from, to } = getPeriodDates(fs.period, fs.customFrom, fs.customTo);
  if (from || to) {
    rows = rows.filter(r => {
      if (!r.data_cancelamento) return false;
      const d = new Date(r.data_cancelamento);
      if (isNaN(d)) return false;
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  if (fs.regional)  rows = rows.filter(r => r.regional  === fs.regional);
  if (fs.operadora) rows = rows.filter(r => r.operadora === fs.operadora);

  const search = _state.search.toLowerCase();
  if (search) rows = rows.filter(r => (r.nome || '').toLowerCase().includes(search));

  return rows;
}

function renderTabela() {
  let rows = _filterDetalhes();
  rows = sortArr(rows, _state.sort.col, _state.sort.dir);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PP));
  if (_state.page > pages) _state.page = pages;

  setEl('rc-alt', `${fmtNum(total)} registro${total !== 1 ? 's' : ''}`);

  const page  = paginateData(rows, _state.page, PP);
  const tbody = document.getElementById('tb-alt');
  if (!tbody) return;

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Nenhum cancelamento encontrado para o filtro atual</div></div></td></tr>`;
    renderPagination(document.getElementById('pag-alt'), 1, 1, 0, () => {});
    return;
  }

  tbody.innerHTML = page.map(r => `<tr>
    <td>
      <div class="td-name">${r.nome || '—'}</div>
    </td>
    <td class="td-mono">${fmtDate(r.data_cancelamento)}</td>
    <td class="td-mono" style="color:var(--accent)">${_formatTempoCasa(r.dias_casa)}</td>
    <td>${r.regional || '—'}</td>
    <td>${r.operadora || '—'}</td>
    <td>${sgaBtn(r.codigo_associado)}</td>
  </tr>`).join('');

  renderPagination(
    document.getElementById('pag-alt'),
    _state.page, pages, total,
    p => { _state.page = p; renderTabela(); }
  );
}

function _formatTempoCasa(dias) {
  if (!dias || isNaN(dias)) return '—';
  const d = Number(dias);
  if (d < 30)  return `${d}d`;
  if (d < 365) return `${Math.floor(d/30)}m`;
  const anos  = Math.floor(d/365);
  const meses = Math.floor((d % 365) / 30);
  return meses > 0 ? `${anos}a ${meses}m` : `${anos}a`;
}

/* ——— EXPORT ——— */

function exportAlt() {
  let rows = _filterDetalhes();
  rows = sortArr(rows, _state.sort.col, _state.sort.dir);
  exportCSV(
    ['Nome','Data Cancelamento','Dias de Casa','Regional','Operadora','Codigo Associado'],
    rows.map(r => [r.nome, r.data_cancelamento, r.dias_casa, r.regional, r.operadora, r.codigo_associado]),
    'analise-churn.csv'
  );
}

/* ——— HELPERS ——— */

function _emptyChart(ctx, msg) {
  const box = ctx.closest?.('.chart-box');
  if (box) box.innerHTML = `<div class="empty" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="empty-ico">📊</div><div class="empty-txt">${msg}</div></div>`;
}

/* ——— INIT ——— */

document.addEventListener('DOMContentLoaded', () => {
  const tblAlt = document.getElementById('tbl-alt');
  if (tblAlt) {
    initSortableTable(tblAlt, (col, dir) => {
      _state.sort = { col, dir };
      _state.page = 1;
      if (_data) renderTabela();
    });
  }

  document.getElementById('search-alt')?.addEventListener('input', e => {
    _state.search = e.target.value;
    _state.page   = 1;
    if (_data) renderTabela();
  });

  document.getElementById('exp-alt')?.addEventListener('click', exportAlt);

  initFilters(() => {
    _state.page = 1;
    if (_data) renderTabela();
  });

  document.getElementById('btn-refresh')?.addEventListener('click', init);

  init();
  setInterval(init, 5 * 60 * 1000);
});

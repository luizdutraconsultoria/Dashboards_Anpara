let _panorama = null;
let _altItems  = [];
let _chart     = null;

async function init() {
  showLoading(true);
  hideError();
  try {
    const [pan, alt] = await Promise.all([API.panorama(), API.alteracoes()]);
    _panorama = pan;
    _altItems = alt.associados || [];
    render();
  } catch (e) {
    showError('Falha ao carregar dados: ' + e.message);
  } finally {
    showLoading(false);
  }
}

function render() {
  if (!_panorama) return;
  const fs = getFilterState();

  setEl('ts', `Atualizado ${new Date(_panorama.timestamp).toLocaleString('pt-BR')}`);

  /* Base Ativa — do endpoint panorama (estado atual, sempre correto) */
  setEl('kpi-ativos', fmtNum(_panorama.base_ativa));
  setEl('kpi-churn',  _panorama.churn_rate_estimado || '—');
  setEl('kpi-novos',  fmtNum(_panorama.novos_contratos_hoje));

  /* Variação da base via snapshots */
  const snaps = _panorama.snapshots || [];
  if (snaps.length >= 2) {
    const diff = snaps[snaps.length - 1].Ativos - snaps[snaps.length - 2].Ativos;
    const sub  = document.getElementById('kpi-ativos-sub');
    if (sub) {
      sub.textContent = (diff >= 0 ? '+' : '') + fmtNum(diff) + ' vs dia anterior';
      sub.className   = 'kpi-sub ' + (diff >= 0 ? 'pos' : 'neg');
    }
  }

  /* Métricas filtradas por período — calculadas via alteracoes */
  const { from, to } = getPeriodDates(fs.period, fs.customFrom, fs.customTo);
  let items = _altItems;
  if (from || to) items = filterByDate(items, 'data_alteracao', from, to);
  if (fs.regional)  items = items.filter(a => a.codigo_regional        === fs.regional);
  if (fs.coop)      items = items.filter(a => a.codigo_cooperativa     === fs.coop);
  if (fs.operadora) items = items.filter(a => (a.nome_usuario_alteracao || '') === fs.operadora);

  const cancels = items.filter(a => a.valor_posterior === '2');
  const reats   = items.filter(a => a.valor_anterior === '2' && a.valor_posterior === '1');
  const saldo   = reats.length - cancels.length;

  /* Labels dinâmicos pelo período */
  const lbl = getPeriodLabel(fs.period, fs.customFrom, fs.customTo);
  const suffix = lbl ? ` — ${lbl}` : '';
  setEl('lbl-cancel', `Cancelamentos${suffix}`);
  setEl('lbl-reat',   `Reativações${suffix}`);
  setEl('lbl-saldo',  `Saldo Líquido${suffix}`);

  setEl('kpi-cancel', fmtNum(cancels.length));
  setEl('kpi-reat',   fmtNum(reats.length));

  const saldoEl = document.getElementById('kpi-saldo');
  if (saldoEl) {
    saldoEl.textContent = (saldo >= 0 ? '+' : '') + fmtNum(saldo);
    saldoEl.className   = 'kpi-val ' + (saldo >= 0 ? 'pos' : 'neg');
  }

  /* Dropdowns */
  populateRegionals(_altItems, 'codigo_regional', fs.regional);
  repopulateCoops(fs);
  populateOperadoras(_altItems, 'nome_usuario_alteracao');
  const selOp = document.getElementById('sel-operadora');
  if (selOp && fs.operadora) selOp.value = fs.operadora;

  /* Gráfico */
  renderChartWithFilters();
}

function repopulateCoops(fs) {
  const selCoop = document.getElementById('sel-coop');
  if (!selCoop) return;
  const source = fs.regional
    ? _altItems.filter(a => a.codigo_regional === fs.regional)
    : _altItems;
  const coops = [...new Set(source.map(a => a.codigo_cooperativa).filter(Boolean))].sort();
  while (selCoop.options.length > 1) selCoop.remove(1);
  coops.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = `Cooperativa ${c}`;
    selCoop.appendChild(o);
  });
  if (fs.coop && coops.includes(fs.coop)) selCoop.value = fs.coop;
}

function renderChartWithFilters() {
  if (!_panorama) return;
  const fs   = getFilterState();
  const gran = getGranularity(fs.period);

  let snaps = _panorama.snapshots || [];
  const { from, to } = getPeriodDates(fs.period, fs.customFrom, fs.customTo);
  if (from || to) {
    snaps = snaps.filter(s => {
      if (!s.Data) return false;
      const d = new Date(s.Data);
      if (isNaN(d)) return false;
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
  }

  const granLabels = { day: 'por dia', week: 'por semana', month: 'por mês' };
  setEl('chart-gran-lbl', `Ativos e inativos — agrupado ${granLabels[gran] || ''}`);

  const grouped = groupSnapshots(snaps, gran);
  renderChart(grouped);
}

function renderChart(grouped) {
  const ctx = document.getElementById('chart-evolucao');
  if (!ctx) return;
  if (_chart) _chart.destroy();

  if (!grouped || grouped.length === 0) {
    const box = ctx.closest('.chart-box');
    if (box) box.innerHTML = `<div class="empty" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="empty-ico">📊</div><div class="empty-txt">Sem dados históricos para o período selecionado</div></div>`;
    return;
  }

  _chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: grouped.map(g => g.label),
      datasets: [
        {
          label: 'Ativos',
          data:  grouped.map(g => g.ativos),
          borderColor: '#6C5CE7',
          backgroundColor: 'rgba(108,92,231,0.07)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#6C5CE7',
          pointBorderColor: '#131829',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: 'Inativos',
          data:  grouped.map(g => g.inativos),
          borderColor: '#FF6B6B',
          backgroundColor: 'rgba(255,107,107,0.04)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#FF6B6B',
          pointBorderColor: '#131829',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#94A3B8', font: { family: 'DM Sans', size: 12 }, boxWidth: 10, boxHeight: 10 },
        },
        tooltip: {
          backgroundColor: '#1C2038',
          borderColor: '#252D44',
          borderWidth: 1,
          titleColor: '#E2E8F0',
          bodyColor: '#94A3B8',
          padding: 10,
          callbacks: { label: c => ` ${c.dataset.label}: ${fmtNum(c.parsed.y)}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(37,45,68,0.5)' },
          ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 } },
        },
        y: {
          grid: { color: 'rgba(37,45,68,0.5)' },
          ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 }, callback: v => fmtNum(v) },
        },
      },
    },
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initFilters(() => {
    if (_panorama) render();
  });
  init();
  document.getElementById('btn-refresh')?.addEventListener('click', init);
});

let _data  = null;
let _chart = null;

async function init() {
  showLoading(true);
  hideError();
  try {
    _data = await API.panorama();
    render(_data);
  } catch (e) {
    showError('Falha ao carregar dados: ' + e.message);
  } finally {
    showLoading(false);
  }
}

function render(d) {
  if (!d) return;
  setEl('ts', `Atualizado ${new Date(d.timestamp).toLocaleString('pt-BR')}`);

  /* KPIs — estado atual (não filtrado por período, API retorna agregados fixos) */
  setEl('kpi-ativos', fmtNum(d.base_ativa));
  setEl('kpi-novos',  fmtNum(d.novos_contratos_hoje));
  setEl('kpi-cancel', fmtNum(d.cancelamentos_7d));
  setEl('kpi-reat',   fmtNum(d.reativacoes_7d));

  const saldo = d.saldo_liquido_7d;
  const saldoEl = document.getElementById('kpi-saldo');
  if (saldoEl) {
    saldoEl.textContent = (saldo >= 0 ? '+' : '') + fmtNum(saldo);
    saldoEl.className   = 'kpi-val ' + (saldo >= 0 ? 'pos' : 'neg');
  }

  const snaps = d.snapshots || [];
  if (snaps.length >= 2) {
    const diff = snaps[snaps.length - 1].Ativos - snaps[snaps.length - 2].Ativos;
    const sub  = document.getElementById('kpi-ativos-sub');
    if (sub) {
      sub.textContent = (diff >= 0 ? '+' : '') + fmtNum(diff) + ' vs dia anterior';
      sub.className   = 'kpi-sub ' + (diff >= 0 ? 'pos' : 'neg');
    }
  }

  setEl('churn-val',  d.churn_rate_estimado || '—');
  setEl('stat-total', fmtNum(d.base_total));
  setEl('stat-inat',  fmtNum(d.base_inativa));

  const statSaldo = document.getElementById('stat-saldo');
  if (statSaldo) {
    statSaldo.textContent = (saldo >= 0 ? '+' : '') + fmtNum(saldo);
    statSaldo.style.color = saldo >= 0 ? 'var(--green)' : 'var(--red)';
  }

  /* Popula dropdowns de regional/coop com dados de snapshots (campo Regiao se existir) */
  populateDropdowns(snaps, 'Regiao', 'Cooperativa', '', '');

  renderChartWithFilters();
}

function renderChartWithFilters() {
  if (!_data) return;

  const fs      = getFilterState();
  const period  = fs.period;
  const gran    = getGranularity(period);

  /* Filtra snapshots pelo período */
  let snaps = _data.snapshots || [];
  if (period !== '7' || fs.customFrom) {
    const { from, to } = getPeriodDates(period, fs.customFrom, fs.customTo);
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
  }

  /* Atualiza label da granularidade */
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
    ctx.closest('.chart-box').innerHTML = `<div class="empty" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="empty-ico">📊</div><div class="empty-txt">Sem dados para o período selecionado</div></div>`;
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
          labels: {
            color: '#94A3B8',
            font: { family: 'DM Sans', size: 12 },
            boxWidth: 10,
            boxHeight: 10,
          },
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
          ticks: {
            color: '#94A3B8',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: v => fmtNum(v),
          },
        },
      },
    },
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initFilters(() => {
    if (_data) renderChartWithFilters();
  });
  init();
  document.getElementById('btn-refresh')?.addEventListener('click', init);
});

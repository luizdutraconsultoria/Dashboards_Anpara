let _data = null;
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
  setEl('ts', `Atualizado ${new Date(d.timestamp).toLocaleString('pt-BR')}`);

  /* KPIs */
  setEl('kpi-ativos', fmtNum(d.base_ativa));
  setEl('kpi-novos', fmtNum(d.novos_contratos_hoje));
  setEl('kpi-cancel', fmtNum(d.cancelamentos_7d));
  setEl('kpi-reat', fmtNum(d.reativacoes_7d));

  /* Saldo líquido — cor dinâmica */
  const saldo = d.saldo_liquido_7d;
  const saldoEl = document.getElementById('kpi-saldo');
  if (saldoEl) {
    saldoEl.textContent = (saldo >= 0 ? '+' : '') + fmtNum(saldo);
    saldoEl.className = 'kpi-val ' + (saldo >= 0 ? 'pos' : 'neg');
  }

  /* Variação base ativa vs snapshot anterior */
  const snaps = d.snapshots || [];
  if (snaps.length >= 2) {
    const diff = snaps[snaps.length - 1].Ativos - snaps[snaps.length - 2].Ativos;
    const sub = document.getElementById('kpi-ativos-sub');
    if (sub) {
      sub.textContent = (diff >= 0 ? '+' : '') + fmtNum(diff) + ' vs dia anterior';
      sub.className = 'kpi-sub ' + (diff >= 0 ? 'pos' : 'neg');
    }
  }

  /* Churn rate */
  setEl('churn-val', d.churn_rate_estimado || '—');

  /* Stats resumo */
  setEl('stat-total', fmtNum(d.base_total));
  setEl('stat-inat', fmtNum(d.base_inativa));
  const statSaldo = document.getElementById('stat-saldo');
  if (statSaldo) {
    statSaldo.textContent = (saldo >= 0 ? '+' : '') + fmtNum(saldo);
    statSaldo.style.color = saldo >= 0 ? 'var(--green)' : 'var(--red)';
  }

  renderChart(snaps);
}

function renderChart(snapshots) {
  if (!snapshots || snapshots.length === 0) return;

  const labels = snapshots.map(s => {
    const p = s.Data.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}` : s.Data;
  });

  const ctx = document.getElementById('chart-evolucao');
  if (!ctx) return;
  if (_chart) _chart.destroy();

  _chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Ativos',
          data: snapshots.map(s => s.Ativos),
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
          data: snapshots.map(s => s.Inativos),
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
  init();
  document.getElementById('btn-refresh')?.addEventListener('click', init);
});

let _panorama       = null;
let _altItems       = [];
let _historicoMensal = null;
let _chartHistorico = null;

async function init() {
  showLoading(true);
  hideError();
  try {
    const [pan, alt, hist] = await Promise.all([
      API.panorama(),
      API.alteracoes(),
      API.historicoMensal(),
    ]);
    _panorama        = pan;
    _altItems        = alt.associados || [];
    _historicoMensal = hist;
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

  setEl('kpi-ativos', fmtNum(_panorama.base_ativa));
  setEl('kpi-churn',  _panorama.churn_rate_estimado || '—');
  setEl('kpi-novos',  fmtNum(_panorama.novos_contratos_hoje));

  /* Variação da base via historicoMensal — compara o ritmo do mês atual (parcial)
     com o ritmo do mês anterior no mesmo número de dias, não o mês anterior cheio */
  if (_historicoMensal && _historicoMensal.por_mes && _historicoMensal.por_mes.length >= 2) {
    const pm  = _historicoMensal.por_mes;
    const cur = pm[pm.length - 1];
    const prv = pm[pm.length - 2];
    const hoje = new Date();
    const diaAtual = hoje.getDate();
    const diasNoMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate();
    const fatorMTD = Math.min(diaAtual, diasNoMesAnterior) / diasNoMesAnterior;
    const saldoCur = cur.novos - cur.cancelamentos;
    const saldoPrvMTD = (prv.novos - prv.cancelamentos) * fatorMTD;
    const diff = saldoCur - saldoPrvMTD;
    const sub  = document.getElementById('kpi-ativos-sub');
    if (sub) {
      sub.textContent = (diff >= 0 ? '+' : '') + fmtNum(Math.round(diff)) + ` saldo líquido vs mês anterior (até o dia ${diaAtual})`;
      sub.className   = 'kpi-sub ' + (diff >= 0 ? 'pos' : 'neg');
    }
  }

  /* Métricas filtradas por período via alteracoes */
  const { from, to } = getPeriodDates(fs.period, fs.customFrom, fs.customTo);
  let items = _altItems;
  if (from || to) items = filterByDate(items, 'data_alteracao', from, to);
  if (fs.regional)  items = items.filter(a => a.codigo_regional        === fs.regional);
  if (fs.coop)      items = items.filter(a => a.codigo_cooperativa     === fs.coop);
  if (fs.operadora) items = items.filter(a => (a.nome_usuario_alteracao || '') === fs.operadora);

  const cancels = items.filter(a => a.valor_posterior === '2');
  const reats   = items.filter(a => a.valor_anterior === '2' && a.valor_posterior === '1');
  const saldo   = reats.length - cancels.length;

  const lbl    = getPeriodLabel(fs.period, fs.customFrom, fs.customTo);
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

  /* Gráfico histórico */
  renderChartHistorico();
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

function renderChartHistorico() {
  const ctx = document.getElementById('chart-evolucao');
  if (!ctx) return;
  if (_chartHistorico) _chartHistorico.destroy();

  const pm = _historicoMensal?.por_mes;
  if (!pm || pm.length === 0) {
    const box = ctx.closest('.chart-box');
    if (box) box.innerHTML = `<div class="empty" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="empty-ico">📊</div><div class="empty-txt">Carregando histórico mensal…</div></div>`;
    return;
  }

  setEl('chart-gran-lbl', `Fluxo mensal — últimos 12 meses`);

  const labels   = pm.map(m => {
    const [y, mo] = m.mes.split('-');
    const months  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${months[Number(mo)-1]}/${String(y).slice(2)}`;
  });

  _chartHistorico = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label:           'Novos',
          data:            pm.map(m => m.novos),
          backgroundColor: 'rgba(0,206,201,0.65)',
          borderColor:     '#00CEC9',
          borderWidth:     1,
          borderRadius:    4,
          order: 2,
        },
        {
          label:           'Reativações',
          data:            pm.map(m => m.reativacoes),
          backgroundColor: 'rgba(108,92,231,0.65)',
          borderColor:     '#6C5CE7',
          borderWidth:     1,
          borderRadius:    4,
          order: 2,
        },
        {
          label:           'Cancelamentos',
          data:            pm.map(m => m.cancelamentos),
          backgroundColor: 'rgba(255,107,107,0.65)',
          borderColor:     '#FF6B6B',
          borderWidth:     1,
          borderRadius:    4,
          order: 2,
        },
        {
          label:      'Saldo Líquido',
          data:       pm.map(m => (m.novos + m.reativacoes) - m.cancelamentos),
          borderColor: '#FDCB6E',
          backgroundColor: 'transparent',
          borderWidth: 2,
          type: 'line',
          tension: 0.4,
          pointBackgroundColor: '#FDCB6E',
          pointBorderColor: '#131829',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          order: 1,
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
          grid: { display: false },
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

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

document.addEventListener('DOMContentLoaded', () => {
  initFilters(() => {
    if (_panorama) render();
  });
  init();
  document.getElementById('btn-refresh')?.addEventListener('click', init);
  setInterval(init, REFRESH_INTERVAL_MS);
});

let _data    = null;
let _assocs  = [];
let _charts  = {};

async function init() {
  showLoading(true);
  hideError();
  try {
    _data   = await API.alteracoes();
    _assocs = _data.associados || [];
    render(_data);
  } catch (e) {
    showError('Falha ao carregar dados: ' + e.message);
  } finally {
    showLoading(false);
  }
}

function render(d) {
  setEl('ts', `Período: ${d.periodo || '—'}`);
  setEl('stat-total', fmtNum(d.total_alteracoes));

  const cancels = _assocs.filter(a => a.valor_posterior === '2');
  const reats   = _assocs.filter(a => a.valor_anterior === '2' && a.valor_posterior === '1');

  setEl('stat-cancel', fmtNum(cancels.length));
  setEl('stat-reat',   fmtNum(reats.length));

  renderChurnChart(cancels);
  renderOperadores(cancels);
  renderObservacoes(d.veiculos || []);
  renderTabela(_assocs);
}

function renderChurnChart(cancels) {
  const counts = {};
  cancels.forEach(c => {
    const day = (c.data_alteracao || '').slice(0, 10);
    if (day) counts[day] = (counts[day] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  const ctx    = document.getElementById('chart-churn');
  if (!ctx) return;
  if (_charts.churn) _charts.churn.destroy();

  if (sorted.length === 0) {
    ctx.closest('.chart-box').innerHTML = `<div class="empty" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="empty-ico">📊</div><div class="empty-txt">Sem cancelamentos no período</div></div>`;
    return;
  }

  _charts.churn = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(([d]) => fmtDate(d)),
      datasets: [{
        label: 'Cancelamentos',
        data: sorted.map(([, v]) => v),
        backgroundColor: 'rgba(255,107,107,0.65)',
        borderColor: '#FF6B6B',
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
          backgroundColor: '#1C2038',
          borderColor: '#252D44',
          borderWidth: 1,
          titleColor: '#E2E8F0',
          bodyColor: '#94A3B8',
          padding: 10,
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 } } },
        y: {
          grid: { color: 'rgba(37,45,68,0.5)' },
          ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 },
        },
      },
    },
  });
}

function renderOperadores(cancels) {
  const counts = {};
  cancels.forEach(c => {
    const op = c.nome_usuario_alteracao || 'Desconhecido';
    counts[op] = (counts[op] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 8);
  const container = document.getElementById('rank-ops');
  if (!container) return;

  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty"><div class="empty-txt">Sem dados de operadores</div></div>`;
    return;
  }

  const max = sorted[0][1];
  container.innerHTML = `<div class="rank-list">${sorted.map(([nome, n], i) => {
    const cls = i === 0 ? 'g1' : i === 1 ? 'g2' : i === 2 ? 'g3' : '';
    return `<div class="rank-item">
      <span class="rank-pos ${cls}">${i + 1}</span>
      <span class="rank-name" title="${nome}">${nome}</span>
      <div class="rank-bar-w"><div class="rank-bar" style="width:${Math.round((n/max)*100)}%"></div></div>
      <span class="rank-n">${n}</span>
    </div>`;
  }).join('')}</div>`;
}

function renderObservacoes(veiculos) {
  const counts = {};
  veiculos.forEach(v => {
    const obs = (v.observacao || '').trim();
    if (obs) counts[obs] = (counts[obs] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 12);
  const container = document.getElementById('obs-list');
  if (!container) return;

  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty"><div class="empty-txt">Sem observações registradas no período</div></div>`;
    return;
  }

  container.innerHTML = `<div class="obs-list">${sorted.map(([obs, n]) =>
    `<div class="obs-item"><span class="obs-n">${n}x</span>${obs}</div>`
  ).join('')}</div>`;
}

function renderTabela(assocs) {
  /* filtros */
  const nome = (document.getElementById('f-nome')?.value || '').toLowerCase();
  const tipo = document.getElementById('f-tipo')?.value || '';

  let rows = assocs;
  if (nome) rows = rows.filter(a => (a.nome_associado || '').toLowerCase().includes(nome));
  if (tipo === 'cancel') rows = rows.filter(a => a.valor_posterior === '2');
  if (tipo === 'reat')   rows = rows.filter(a => a.valor_anterior === '2' && a.valor_posterior === '1');

  const tbody = document.getElementById('tb-alt');
  if (!tbody) return;

  setEl('rc-alt', `${rows.length} registro${rows.length !== 1 ? 's' : ''}`);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Nenhuma alteração encontrada</div></div></td></tr>`;
    return;
  }

  const SIT = { '1': 'ATIVO', '2': 'INATIVO', '3': 'PENDENTE', '4': 'NEGADO' };

  tbody.innerHTML = rows.map(a => {
    const ant = SIT[a.valor_anterior] || a.valor_anterior || '—';
    const pos = SIT[a.valor_posterior] || a.valor_posterior || '—';
    const isCancel = a.valor_posterior === '2';
    const isReat   = a.valor_anterior === '2' && a.valor_posterior === '1';

    const tipoBadge = isCancel ? `<span class="badge b-red">Cancelamento</span>`
                    : isReat   ? `<span class="badge b-green">Reativação</span>`
                    : `<span class="badge b-gray">Alteração</span>`;

    return `<tr>
      <td>
        <div class="td-name">${a.nome_associado || '—'}</div>
        <div class="td-sub">${maskCPF(a.cpf_associado)}</div>
      </td>
      <td class="td-mono">${fmtDate(a.data_alteracao)}</td>
      <td>${tipoBadge}</td>
      <td style="white-space:nowrap">
        <span class="badge b-gray">${ant}</span>
        <span style="color:var(--muted);margin:0 4px">→</span>
        <span class="badge ${isCancel ? 'b-red' : isReat ? 'b-green' : 'b-gray'}">${pos}</span>
      </td>
      <td>${a.nome_usuario_alteracao || '—'}</td>
      <td class="td-muted td-mono" style="font-size:10px">${a.nome_campo_tabela || '—'}</td>
    </tr>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('btn-refresh')?.addEventListener('click', init);
  document.getElementById('f-nome')?.addEventListener('input', () => renderTabela(_assocs));
  document.getElementById('f-tipo')?.addEventListener('change', () => renderTabela(_assocs));
});

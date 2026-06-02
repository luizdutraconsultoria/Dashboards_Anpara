let _data   = null;
let _assocs = [];
let _charts = {};

/* ——— TABLE STATE ——— */
const _state = {
  sort:        { col: 'data_alteracao', dir: 'desc' },
  page:        1,
  search:      '',
  tipo:        '',
  chartFilter: null,   // { type: 'period'|'operator'|'obs', value: string, label: string }
};

const PP = 50;

/* ——— LOAD ——— */

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

/* ——— RENDER ——— */

function render(d) {
  setEl('ts', `Período: ${d.periodo || '—'}`);

  const fs = getFilterState();
  let items = _assocs;

  /* Filtro de período */
  if (fs.period) {
    const { from, to } = getPeriodDates(fs.period, fs.customFrom, fs.customTo);
    items = filterByDate(items, 'data_alteracao', from, to);
  }

  /* Filtro de regional/coop */
  if (fs.regional) items = items.filter(a => a.codigo_regional === fs.regional);
  if (fs.coop)     items = items.filter(a => a.codigo_cooperativa === fs.coop);

  const cancels = items.filter(a => a.valor_posterior === '2');
  const reats   = items.filter(a => a.valor_anterior === '2' && a.valor_posterior === '1');

  setEl('stat-total',  fmtNum(items.length));
  setEl('stat-cancel', fmtNum(cancels.length));
  setEl('stat-reat',   fmtNum(reats.length));

  /* Popula dropdowns */
  populateDropdowns(_assocs, 'codigo_regional', 'codigo_cooperativa', fs.regional, fs.coop);

  /* Granularidade */
  const gran = getGranularity(fs.period || '7');
  const sub  = document.getElementById('chart-churn-sub');
  const granLabels = { day: 'por dia', week: 'por semana', month: 'por mês' };
  if (sub) sub.textContent = `Cancelamentos agrupados ${granLabels[gran] || ''} · Clique para filtrar`;

  renderChurnChart(cancels, gran);
  renderOperadores(cancels);
  renderObservacoes(d.veiculos || []);
  renderTabela(items);
}

function rerender() {
  if (!_data) return;
  /* Limpa filtro de gráfico ao reprocessar filtros do topbar */
  _state.chartFilter = null;
  _state.page        = 1;
  updateFilterBadge();
  render(_data);
}

/* ——— CHART: CANCELAMENTOS POR PERÍODO ——— */

function renderChurnChart(cancels, gran) {
  const grouped = groupItems(cancels, 'data_alteracao', gran);
  const ctx     = document.getElementById('chart-churn');
  if (!ctx) return;
  if (_charts.churn) _charts.churn.destroy();

  if (grouped.length === 0) {
    const box = ctx.closest('.chart-box');
    if (box) box.innerHTML = `<div class="empty" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="empty-ico">📊</div><div class="empty-txt">Sem cancelamentos no período</div></div>`;
    return;
  }

  _charts.churn = new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   grouped.map(g => g.label),
      datasets: [{
        label:           'Cancelamentos',
        data:            grouped.map(g => g.items.length),
        backgroundColor: 'rgba(255,107,107,0.65)',
        borderColor:     '#FF6B6B',
        borderWidth:     1,
        borderRadius:    4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx   = elements[0].index;
        const grp   = grouped[idx];
        /* Collect IDs of items in this bucket */
        const keys  = new Set(grp.items.map(i => i._id || JSON.stringify(i)));
        _state.chartFilter = { type: 'period', value: grp.label, keys, label: `Data: ${grp.label}` };
        _state.page        = 1;
        updateFilterBadge();
        const fs  = getFilterState();
        let items = filterAssocs(fs);
        renderTabela(items);
      },
      plugins: {
        legend:  { display: false },
        tooltip: { backgroundColor: '#1C2038', borderColor: '#252D44', borderWidth: 1, titleColor: '#E2E8F0', bodyColor: '#94A3B8', padding: 10 },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 } } },
        y: {
          grid:  { color: 'rgba(37,45,68,0.5)' },
          ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 },
        },
      },
    },
  });
}

/* ——— CHART: OPERADORES (horizontal bar) ——— */

function renderOperadores(cancels) {
  const counts = {};
  cancels.forEach(c => {
    const op = c.nome_usuario_alteracao || 'Desconhecido';
    counts[op] = (counts[op] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 10);
  const ctx    = document.getElementById('chart-ops');
  if (!ctx) return;
  if (_charts.ops) _charts.ops.destroy();

  if (sorted.length === 0) {
    const box = ctx.closest('.chart-box');
    if (box) box.innerHTML = `<div class="empty" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="empty-ico">👤</div><div class="empty-txt">Sem dados de operadores</div></div>`;
    return;
  }

  _charts.ops = new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   sorted.map(([nome]) => nome),
      datasets: [{
        label:           'Cancelamentos',
        data:            sorted.map(([, n]) => n),
        backgroundColor: 'rgba(108,92,231,0.65)',
        borderColor:     '#6C5CE7',
        borderWidth:     1,
        borderRadius:    4,
      }],
    },
    options: {
      indexAxis:          'y',
      responsive:         true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const idx      = elements[0].index;
        const [opNome] = sorted[idx];
        _state.chartFilter = { type: 'operator', value: opNome, label: `Operador: ${opNome}` };
        _state.page        = 1;
        updateFilterBadge();
        const fs   = getFilterState();
        const items = filterAssocs(fs);
        renderTabela(items);
      },
      plugins: {
        legend:  { display: false },
        tooltip: { backgroundColor: '#1C2038', borderColor: '#252D44', borderWidth: 1, titleColor: '#E2E8F0', bodyColor: '#94A3B8', padding: 10 },
      },
      scales: {
        x: { grid: { color: 'rgba(37,45,68,0.5)' }, ticks: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 }, stepSize: 1 } },
        y: { grid: { display: false }, ticks: { color: '#94A3B8', font: { family: 'DM Sans', size: 11 } } },
      },
    },
  });
}

/* ——— OBSERVAÇÕES ——— */

function renderObservacoes(veiculos) {
  const counts = {};
  veiculos.forEach(v => {
    const obs = (v.observacao || '').trim();
    if (obs) counts[obs] = (counts[obs] || 0) + 1;
  });

  const sorted    = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 12);
  const container = document.getElementById('obs-list');
  if (!container) return;

  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty"><div class="empty-txt">Sem observações registradas no período</div></div>`;
    return;
  }

  container.innerHTML = `<div class="obs-list">${sorted.map(([obs, n]) =>
    `<div class="obs-item" data-obs="${obs.replace(/"/g,'&quot;')}"><span class="obs-n">${n}x</span>${obs}</div>`
  ).join('')}</div>`;

  container.querySelectorAll('.obs-item').forEach(el => {
    el.addEventListener('click', () => {
      const obs    = el.dataset.obs;
      const active = _state.chartFilter?.value === obs && _state.chartFilter?.type === 'obs';

      container.querySelectorAll('.obs-item').forEach(e => e.classList.remove('obs-active'));

      if (active) {
        _state.chartFilter = null;
      } else {
        el.classList.add('obs-active');
        _state.chartFilter = { type: 'obs', value: obs, label: `Obs: ${obs.slice(0, 40)}${obs.length > 40 ? '…' : ''}` };
      }
      _state.page = 1;
      updateFilterBadge();
      const fs    = getFilterState();
      const items = filterAssocs(fs);
      renderTabela(items);
    });
  });
}

/* ——— FILTER BADGE ——— */

function updateFilterBadge() {
  const badge = document.getElementById('chart-filter-badge');
  const label = document.getElementById('cf-label-text');
  if (!badge) return;
  if (_state.chartFilter) {
    badge.classList.add('visible');
    if (label) label.textContent = _state.chartFilter.label;
  } else {
    badge.classList.remove('visible');
    if (label) label.textContent = '';
  }
}

/* ——— FILTER HELPER ——— */

function filterAssocs(fs) {
  let items = _assocs;

  /* Período */
  if (fs.period) {
    const { from, to } = getPeriodDates(fs.period, fs.customFrom, fs.customTo);
    items = filterByDate(items, 'data_alteracao', from, to);
  }

  /* Regional / Coop */
  if (fs.regional) items = items.filter(a => a.codigo_regional === fs.regional);
  if (fs.coop)     items = items.filter(a => a.codigo_cooperativa === fs.coop);

  /* Tipo (select) */
  const tipo = _state.tipo;
  if (tipo === 'cancel') items = items.filter(a => a.valor_posterior === '2');
  if (tipo === 'reat')   items = items.filter(a => a.valor_anterior === '2' && a.valor_posterior === '1');

  /* Chart filter */
  if (_state.chartFilter) {
    const cf = _state.chartFilter;
    if (cf.type === 'period' && cf.keys) {
      items = items.filter(i => cf.keys.has(i._id || JSON.stringify(i)));
    } else if (cf.type === 'operator') {
      items = items.filter(a => (a.nome_usuario_alteracao || 'Desconhecido') === cf.value);
    } else if (cf.type === 'obs') {
      // obs filter — associate by data_alteracao match via veiculos array
      items = items.filter(a => {
        const veiculos = _data.veiculos || [];
        return veiculos.some(v =>
          (v.observacao || '').trim() === cf.value &&
          (v.codigo_associado === a.codigo_associado || v.data_alteracao === a.data_alteracao)
        );
      });
    }
  }

  return items;
}

/* ——— TABELA ——— */

function renderTabela(items) {
  const search = _state.search.toLowerCase();
  let rows = search
    ? items.filter(a =>
        (a.nome_associado || '').toLowerCase().includes(search) ||
        (a.cpf_associado  || '').replace(/\D/g,'').includes(search.replace(/\D/g,''))
      )
    : items;

  rows = sortArr(rows, _state.sort.col, _state.sort.dir);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PP));
  if (_state.page > pages) _state.page = pages;

  setEl('rc-alt', `${fmtNum(total)} registro${total !== 1 ? 's' : ''}`);

  const page  = paginateData(rows, _state.page, PP);
  const tbody = document.getElementById('tb-alt');
  if (!tbody) return;

  const SIT = { '1': 'ATIVO', '2': 'INATIVO', '3': 'PENDENTE', '4': 'NEGADO' };

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Nenhuma alteração encontrada</div></div></td></tr>`;
    renderPagination(document.getElementById('pag-alt'), 1, 1, 0, () => {});
    return;
  }

  tbody.innerHTML = page.map(a => {
    const ant = SIT[a.valor_anterior]  || a.valor_anterior  || '—';
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
      <td>${sgaBtn(a.codigo_associado)}</td>
    </tr>`;
  }).join('');

  renderPagination(
    document.getElementById('pag-alt'),
    _state.page, pages, total,
    p => {
      _state.page = p;
      const fs    = getFilterState();
      renderTabela(filterAssocs(fs));
    }
  );
}

/* ——— EXPORT ——— */

function exportAlt() {
  const fs    = getFilterState();
  let rows    = filterAssocs(fs);
  const search = _state.search.toLowerCase();
  if (search) rows = rows.filter(a =>
    (a.nome_associado || '').toLowerCase().includes(search) ||
    (a.cpf_associado  || '').replace(/\D/g,'').includes(search.replace(/\D/g,''))
  );
  rows = sortArr(rows, _state.sort.col, _state.sort.dir);

  const SIT = { '1': 'ATIVO', '2': 'INATIVO', '3': 'PENDENTE', '4': 'NEGADO' };
  exportCSV(
    ['Nome','CPF','Data','Tipo','De','Para','Operador','Campo','Codigo Associado'],
    rows.map(a => {
      const isCancel = a.valor_posterior === '2';
      const isReat   = a.valor_anterior === '2' && a.valor_posterior === '1';
      const tipo     = isCancel ? 'Cancelamento' : isReat ? 'Reativação' : 'Alteração';
      return [
        a.nome_associado, a.cpf_associado, a.data_alteracao, tipo,
        SIT[a.valor_anterior] || a.valor_anterior,
        SIT[a.valor_posterior] || a.valor_posterior,
        a.nome_usuario_alteracao, a.nome_campo_tabela, a.codigo_associado,
      ];
    }),
    'alteracoes.csv'
  );
}

/* ——— INIT ——— */

document.addEventListener('DOMContentLoaded', () => {
  /* Sort */
  const tblAlt = document.getElementById('tbl-alt');
  if (tblAlt) {
    initSortableTable(tblAlt, (col, dir) => {
      _state.sort = { col, dir };
      _state.page = 1;
      if (_data) {
        const fs = getFilterState();
        renderTabela(filterAssocs(fs));
      }
    });
  }

  /* Search */
  document.getElementById('search-alt')?.addEventListener('input', e => {
    _state.search = e.target.value;
    _state.page   = 1;
    if (_data) {
      const fs = getFilterState();
      renderTabela(filterAssocs(fs));
    }
  });

  /* Tipo filter */
  document.getElementById('f-tipo')?.addEventListener('change', e => {
    _state.tipo = e.target.value;
    _state.page = 1;
    if (_data) {
      const fs = getFilterState();
      renderTabela(filterAssocs(fs));
    }
  });

  /* Clear chart filter */
  document.getElementById('cf-clear')?.addEventListener('click', () => {
    _state.chartFilter = null;
    _state.page        = 1;
    updateFilterBadge();
    /* Remove obs-active */
    document.querySelectorAll('.obs-item').forEach(e => e.classList.remove('obs-active'));
    if (_data) {
      const fs = getFilterState();
      renderTabela(filterAssocs(fs));
    }
  });

  /* Export */
  document.getElementById('exp-alt')?.addEventListener('click', exportAlt);

  /* Topbar filters */
  initFilters(() => {
    _state.chartFilter = null;
    _state.page        = 1;
    updateFilterBadge();
    if (_data) render(_data);
  });

  /* Refresh */
  document.getElementById('btn-refresh')?.addEventListener('click', init);

  init();
});

let _data = null;

/* ——— STATE ——— */
const _stateInad = { sort: { col: 'dias_atraso', dir: 'desc' }, page: 1, search: '' };
const _stateCanc = { sort: { col: 'data_alteracao', dir: 'desc' }, page: 1, search: '' };

const PP = 50;

async function init() {
  hideError();
  try {
    _data = await API.zonaChurn();
    render(_data);
  } catch (e) {
    showError('Falha ao carregar dados: ' + e.message);
  }
}

function render(d) {
  setEl('ts', `Atualizado ${new Date(d.timestamp).toLocaleString('pt-BR')}`);

  /* Reativações via meta de recuperação (valor do período corrente da API) */
  const meta = d.meta_recuperacao || {};
  setEl('cnt-reat', fmtNum(meta.recuperados || 0));

  /* Popula dropdowns */
  populateRegionals(d.inadimplentes || [], 'codigo_regional', '');
  populateOperadoras(d.cancelamentos_solicitados || [], 'usuario_alteracao');

  rerender();
}

function rerender() {
  if (!_data) return;
  const fs = getFilterState();

  /* Inadimplentes — filtros de regional/coop (sem data, são estado atual) */
  let inadList = _data.inadimplentes || [];
  if (fs.regional) inadList = inadList.filter(a => a.codigo_regional    === fs.regional);
  if (fs.coop)     inadList = inadList.filter(a => a.codigo_cooperativa === fs.coop);

  /* Cascata: repopula coop conforme regional */
  repopulateCoops(_data.inadimplentes || [], fs);

  /* Cancelamentos — filtros de período + operadora */
  let cancList = _data.cancelamentos_solicitados || [];
  const { from, to } = getPeriodDates(fs.period, fs.customFrom, fs.customTo);
  if (from || to) cancList = filterByDate(cancList, 'data_alteracao', from, to);
  if (fs.operadora) cancList = cancList.filter(c => (c.usuario_alteracao || '') === fs.operadora);

  /* Atualiza cards resumo */
  setEl('cnt-risco', fmtNum(inadList.length + cancList.length));
  setEl('cnt-inad',  fmtNum(inadList.length));
  setEl('cnt-canc',  fmtNum(cancList.length));

  /* Label de reativações com período dinâmico */
  const lbl = getPeriodLabel(fs.period, fs.customFrom, fs.customTo);
  setEl('lbl-reat', `Reativações${lbl ? ` — ${lbl}` : ' no período'}`);

  /* Barra de meta com texto dinâmico */
  const meta  = _data.meta_recuperacao || {};
  const total = meta.total_em_risco || 0;
  const rec   = meta.recuperados    || 0;
  const pct   = total > 0 ? Math.round((rec / total) * 100) : 0;
  const metaLbl = _metaLabelIn(fs);
  setEl('meta-txt', `${rec} de ${total} associados em risco recuperados ${metaLbl}`);
  setEl('meta-pct', pct + '%');
  const fill = document.getElementById('meta-fill');
  if (fill) fill.style.width = pct + '%';

  renderInadimplentes(inadList);
  renderCancelamentos(cancList);
}

function _metaLabelIn(fs) {
  const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const p = fs.period;
  if (p === 'today') return 'hoje';
  if (p === 'week')  return 'esta semana';
  if (p === 'month') {
    const now = new Date();
    return `em ${months[now.getMonth()]}/${String(now.getFullYear()).slice(2)}`;
  }
  if (p === 'year') return `em ${new Date().getFullYear()}`;
  return 'no período selecionado';
}

function repopulateCoops(inadAll, fs) {
  const selCoop = document.getElementById('sel-coop');
  if (!selCoop) return;
  const source = fs.regional
    ? inadAll.filter(a => a.codigo_regional === fs.regional)
    : inadAll;
  const coops = [...new Set(source.map(a => a.codigo_cooperativa).filter(Boolean))].sort();
  while (selCoop.options.length > 1) selCoop.remove(1);
  coops.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = `Cooperativa ${c}`;
    selCoop.appendChild(o);
  });
  if (fs.coop && coops.includes(fs.coop)) {
    selCoop.value = fs.coop;
  } else if (fs.coop) {
    selCoop.value = '';
    fs.coop = '';
  }
}

/* ——— HELPERS ——— */

function cdBadge(dias) {
  const d = Number(dias);
  if (d <= 1) return `<span class="cd danger">⚠ ${d}d restante</span>`;
  if (d <= 3) return `<span class="cd warn">⏱ ${d}d restantes</span>`;
  return `<span class="cd safe">✓ ${d}d restantes</span>`;
}

function statusBadge(s) {
  if (s === 'CHURN_IMINENTE') return `<span class="badge b-red">Churn iminente</span>`;
  if (s === 'EM_RISCO')       return `<span class="badge b-yellow">Em risco</span>`;
  return `<span class="badge b-gray">${s || '—'}</span>`;
}

/* ——— INADIMPLENTES ——— */

function renderInadimplentes(lista) {
  const search = _stateInad.search.toLowerCase();
  let rows = search
    ? lista.filter(a =>
        (a.nome || '').toLowerCase().includes(search) ||
        (a.cpf  || '').replace(/\D/g,'').includes(search.replace(/\D/g,''))
      )
    : lista;

  rows = sortArr(rows, _stateInad.sort.col, _stateInad.sort.dir);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PP));
  if (_stateInad.page > pages) _stateInad.page = pages;

  setEl('tab-cnt-inad', total);
  setEl('rc-inad', `${fmtNum(total)} registro${total !== 1 ? 's' : ''}`);

  const page  = paginateData(rows, _stateInad.page, PP);
  const tbody = document.getElementById('tb-inad');
  if (!tbody) return;

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="empty-ico">✅</div><div class="empty-txt">Nenhum inadimplente encontrado</div></div></td></tr>`;
    renderPagination(document.getElementById('pag-inad'), 1, 1, 0, () => {});
    return;
  }

  tbody.innerHTML = page.map(a => {
    const primeiroNome = (a.nome || '').split(' ')[0];
    const msgInad = `Olá ${primeiroNome}, tudo bem? Identificamos que sua proteção veicular está pendente desde o dia ${a.dia_vencimento}. Podemos ajudar a regularizar? 🚗🛡️`;
    const href    = waLink(a.telefone_celular, a.nome, msgInad);
    const hasTel  = !!cleanPhone(a.telefone_celular);

    return `<tr>
      <td>
        <div class="td-name">${a.nome || '—'}</div>
        <div class="td-sub">${maskCPF(a.cpf)}</div>
      </td>
      <td class="td-mono">${maskPhone(a.telefone_celular)}</td>
      <td class="td-mono" style="color:var(--accent)">Dia ${a.dia_vencimento || '—'}</td>
      <td class="td-mono" style="color:var(--red);font-weight:600">${a.dias_atraso || 0}d</td>
      <td>${cdBadge(a.dias_para_churn)}</td>
      <td>${statusBadge(a.status_churn)}</td>
      <td>${sgaBtn(a.codigo_associado)}</td>
      <td>${hasTel
        ? `<a href="${href}" target="_blank" rel="noopener" class="btn-wa">${WA_SVG} WhatsApp</a>`
        : `<span class="td-muted">Sem tel.</span>`}
      </td>
    </tr>`;
  }).join('');

  renderPagination(
    document.getElementById('pag-inad'),
    _stateInad.page, pages, total,
    p => { _stateInad.page = p; renderInadimplentes(lista); }
  );
}

/* ——— CANCELAMENTOS ——— */

function renderCancelamentos(lista) {
  const search = _stateCanc.search.toLowerCase();
  let rows = search
    ? lista.filter(a =>
        (a.nome || '').toLowerCase().includes(search) ||
        (a.cpf  || '').replace(/\D/g,'').includes(search.replace(/\D/g,''))
      )
    : lista;

  rows = sortArr(rows, _stateCanc.sort.col, _stateCanc.sort.dir);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PP));
  if (_stateCanc.page > pages) _stateCanc.page = pages;

  setEl('tab-cnt-canc', total);
  setEl('rc-canc', `${fmtNum(total)} registro${total !== 1 ? 's' : ''}`);

  const page  = paginateData(rows, _stateCanc.page, PP);
  const tbody = document.getElementById('tb-canc');
  if (!tbody) return;

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-ico">✅</div><div class="empty-txt">Nenhum cancelamento encontrado no período</div></div></td></tr>`;
    renderPagination(document.getElementById('pag-canc'), 1, 1, 0, () => {});
    return;
  }

  tbody.innerHTML = page.map(a => {
    const motivo = (a.observacao || '').trim();
    return `<tr>
      <td>
        <div class="td-name">${a.nome || '—'}</div>
        <div class="td-sub">${maskCPF(a.cpf)}</div>
      </td>
      <td class="td-mono">${fmtDate(a.data_alteracao)}</td>
      <td>${a.usuario_alteracao || '—'}</td>
      <td><span class="badge b-red">Ativo → Inativo</span></td>
      <td class="td-muted" style="font-size:11px">${motivo || '—'}</td>
      <td>${sgaBtn(a.codigo_associado)}</td>
      <td><span class="td-muted" style="font-size:11px">Tel. não disponível</span></td>
    </tr>`;
  }).join('');

  renderPagination(
    document.getElementById('pag-canc'),
    _stateCanc.page, pages, total,
    p => { _stateCanc.page = p; renderCancelamentos(lista); }
  );
}

/* ——— EXPORT CSV ——— */

function exportInad() {
  const fs = getFilterState();
  let rows = _data?.inadimplentes || [];
  if (fs.regional) rows = rows.filter(a => a.codigo_regional    === fs.regional);
  if (fs.coop)     rows = rows.filter(a => a.codigo_cooperativa === fs.coop);
  const search = _stateInad.search.toLowerCase();
  if (search) rows = rows.filter(a =>
    (a.nome||'').toLowerCase().includes(search) ||
    (a.cpf||'').replace(/\D/g,'').includes(search.replace(/\D/g,''))
  );
  rows = sortArr(rows, _stateInad.sort.col, _stateInad.sort.dir);

  exportCSV(
    ['Nome','CPF','Telefone','Dia Vencimento','Dias Atraso','Dias para Churn','Status','Codigo Associado'],
    rows.map(a => [a.nome, a.cpf, a.telefone_celular, a.dia_vencimento, a.dias_atraso, a.dias_para_churn, a.status_churn, a.codigo_associado]),
    'inadimplentes.csv'
  );
}

function exportCanc() {
  const fs = getFilterState();
  let rows = _data?.cancelamentos_solicitados || [];
  const { from, to } = getPeriodDates(fs.period, fs.customFrom, fs.customTo);
  if (from || to) rows = filterByDate(rows, 'data_alteracao', from, to);
  if (fs.operadora) rows = rows.filter(c => (c.usuario_alteracao || '') === fs.operadora);
  const search = _stateCanc.search.toLowerCase();
  if (search) rows = rows.filter(a =>
    (a.nome||'').toLowerCase().includes(search) ||
    (a.cpf||'').replace(/\D/g,'').includes(search.replace(/\D/g,''))
  );
  rows = sortArr(rows, _stateCanc.sort.col, _stateCanc.sort.dir);

  exportCSV(
    ['Nome','CPF','Data','Operador','Motivo','Codigo Associado'],
    rows.map(a => [a.nome, a.cpf, a.data_alteracao, a.usuario_alteracao, a.observacao || '', a.codigo_associado]),
    'cancelamentos.csv'
  );
}

/* ——— INIT ——— */

document.addEventListener('DOMContentLoaded', () => {
  /* Tabs */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab)?.classList.remove('hidden');
    });
  });

  /* Sort — inadimplentes */
  const tblInad = document.getElementById('tbl-inad');
  if (tblInad) {
    initSortableTable(tblInad, (col, dir) => {
      _stateInad.sort = { col, dir };
      _stateInad.page = 1;
      if (_data) rerender();
    });
  }

  /* Sort — cancelamentos */
  const tblCanc = document.getElementById('tbl-canc');
  if (tblCanc) {
    initSortableTable(tblCanc, (col, dir) => {
      _stateCanc.sort = { col, dir };
      _stateCanc.page = 1;
      if (_data) rerender();
    });
  }

  /* Search */
  document.getElementById('search-inad')?.addEventListener('input', e => {
    _stateInad.search = e.target.value;
    _stateInad.page   = 1;
    if (_data) rerender();
  });

  document.getElementById('search-canc')?.addEventListener('input', e => {
    _stateCanc.search = e.target.value;
    _stateCanc.page   = 1;
    if (_data) rerender();
  });

  /* Export */
  document.getElementById('exp-inad')?.addEventListener('click', exportInad);
  document.getElementById('exp-canc')?.addEventListener('click', exportCanc);

  /* Topbar filters */
  initFilters(fs => {
    if (_data) rerender();
  });

  /* Refresh */
  document.getElementById('btn-refresh')?.addEventListener('click', init);

  init();
});

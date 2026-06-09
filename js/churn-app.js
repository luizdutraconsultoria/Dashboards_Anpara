/* ============================================================
   ANPARA — Churn Dashboard SPA
   Handles all 3 pages: Panorama, Zona de Churn, Análise
   ============================================================ */

/* ---- GLOBAL DATA ---- */
let _panorama   = null;
let _alt        = [];
let _hist       = null;
let _zona       = null;
let _analise    = null;

/* ---- CHART INSTANCES ---- */
let _cEntradas  = null;
let _cCancel    = null;
let _cEvolucao  = null;

/* ---- TABLE STATE ---- */
const _stateInad = { sort: { col: 'dias_atraso', dir: 'desc' }, page: 1, search: '' };
const _stateCanc = { sort: { col: 'data_alteracao', dir: 'desc' }, page: 1, search: '' };
const _stateReat = { sort: { col: 'data_reativacao', dir: 'desc' }, page: 1, search: '' };
const _stateAlt  = { sort: { col: 'data_cancelamento', dir: 'desc' }, page: 1, search: '' };
const PP = 50;

/* ---- FILTER STATE ---- */
const _fs = {
  p1: { period: 'month', from: '', to: '', regional: '' },
  p3: { period: 'month', from: '', to: '', regional: '' },
  p2: { regional: '' },
};

/* ---- CHART COLORS ---- */
const C = {
  green:  '#1D9E75',
  red:    '#E24B4A',
  purple: '#7F77DD',
  amber:  '#EF9F27',
  blue:   '#378ADD',
  grid:   'rgba(0,0,0,0.05)',
  text:   '#6B6B67',
};
const RANK_COLORS = [C.red, C.amber, '#B4B2A9', '#378ADD', C.purple];

/* ---- CHART DEFAULTS ---- */
const TICKS = { color: C.text, font: { size: 11, family: 'DM Sans' } };
const GRID  = { color: C.grid };
const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: { x: { grid: GRID, ticks: TICKS }, y: { grid: GRID, ticks: TICKS } },
};

/* ============================================================
   NAVIGATION
   ============================================================ */

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  if (btn) btn.classList.add('active');
}

/* ============================================================
   INIT — load all APIs in parallel
   ============================================================ */

async function init() {
  document.getElementById('loading').style.display = 'flex';
  try {
    const [pan, alt, hist, zona, analise] = await Promise.all([
      API.panorama(),
      API.alteracoes(),
      API.historicoMensal(),
      API.zonaChurn(),
      API.analiseChurn(),
    ]);
    _panorama = pan;
    _alt      = alt.associados || [];
    _hist     = hist;
    _zona     = zona;
    _analise  = analise;

    renderP1();
    renderP2();
    renderP3();

    const ts = new Date(_panorama.timestamp);
    document.getElementById('ts').textContent = `Atualizado ${ts.toLocaleString('pt-BR')}`;
  } catch (e) {
    showErr('p1', 'Falha ao carregar dados: ' + e.message);
    showErr('p2', 'Falha ao carregar dados: ' + e.message);
    showErr('p3', 'Falha ao carregar dados: ' + e.message);
  } finally {
    document.getElementById('loading').style.display = 'none';
  }
}

function showErr(page, msg) {
  const bar = document.getElementById(page + '-error');
  if (!bar) return;
  bar.style.display = 'flex';
  const span = document.getElementById(page + '-errmsg');
  if (span) span.textContent = msg;
}

/* ============================================================
   PAGE 1 — PANORAMA
   ============================================================ */

function renderP1() {
  if (!_panorama) return;
  const fs = _fs.p1;

  /* Base ativa */
  setText('m-ativos', fmtNum(_panorama.base_ativa));
  if (_hist?.por_mes?.length >= 2) {
    const pm   = _hist.por_mes;
    const cur  = pm[pm.length - 1];
    const prv  = pm[pm.length - 2];
    const diff = (cur.novos + cur.reativacoes - cur.cancelamentos) -
                 (prv.novos + prv.reativacoes - prv.cancelamentos);
    const el   = document.getElementById('m-ativos-delta');
    if (el) {
      el.textContent  = (diff >= 0 ? '▲ ' : '▼ ') + Math.abs(diff) + ' saldo líquido vs mês anterior';
      el.className    = 'metric-delta ' + (diff >= 0 ? 'up' : 'dn');
    }
  }

  /* Novas vendas */
  setText('m-novos', fmtNum(_panorama.novos_contratos_hoje));
  setText('m-novos-delta', 'novos contratos hoje');

  /* Cancelamentos filtrados por período */
  const { from, to } = getPeriodDates(fs.period, fs.from, fs.to);
  let items = _alt;
  if (from || to) items = filterByDate(items, 'data_alteracao', from, to);
  if (fs.regional) items = items.filter(a => a.codigo_regional === fs.regional);
  const cancels = items.filter(a => a.valor_posterior === '2');
  setText('m-cancel', fmtNum(cancels.length));
  const lbl = getPeriodLabel(fs.period, fs.from, fs.to);
  setText('m-cancel-lbl', 'Cancelamentos' + (lbl ? ` — ${lbl}` : ''));
  setText('m-cancel-delta', 'no período');

  /* Taxa de churn */
  setText('m-churn', _panorama.churn_rate_estimado || '—');
  setText('m-churn-delta', '% da base ativa em risco');

  /* Dropdown regional */
  const regs = [...new Set(_alt.map(a => a.codigo_regional).filter(Boolean))].sort();
  populateSel('p1-regional', regs, v => regionalLabel(v), fs.regional);

  /* Charts */
  renderEntradasChart();
  renderRankRegional();
}

function renderEntradasChart() {
  const ctx = document.getElementById('c-entradas');
  if (!ctx) return;
  if (_cEntradas) _cEntradas.destroy();

  const pm = _hist?.por_mes;
  if (!pm || pm.length === 0) {
    ctx.closest('.chart-area').innerHTML = '<div class="empty">Sem dados de histórico mensal</div>';
    return;
  }

  const labels = pm.map(m => {
    const [y, mo] = m.mes.split('-');
    return monthShort(Number(mo)) + '/' + String(y).slice(2);
  });

  _cEntradas = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Novos',         data: pm.map(m => m.novos),          backgroundColor: C.green + 'AA', borderColor: C.green, borderWidth: 1, borderRadius: 3 },
        { label: 'Reativações',   data: pm.map(m => m.reativacoes),    backgroundColor: C.purple + 'AA', borderColor: C.purple, borderWidth: 1, borderRadius: 3 },
        { label: 'Cancelamentos', data: pm.map(m => m.cancelamentos),  backgroundColor: C.red + 'AA', borderColor: C.red, borderWidth: 1, borderRadius: 3 },
      ],
    },
    options: { ...CHART_OPTS, interaction: { mode: 'index', intersect: false } },
  });
}

function renderRankRegional() {
  const el = document.getElementById('rank-regional');
  if (!el) return;

  const pr = _analise?.por_regional || [];
  if (pr.length === 0) { el.innerHTML = '<div class="empty">Sem dados por unidade</div>'; return; }

  const max = Math.max(...pr.map(r => r.cancelamentos), 1);
  el.innerHTML = pr.map((r, i) => {
    const pct = Math.round((r.cancelamentos / max) * 100);
    return `<div class="rank-row">
      <span class="rank-label">${r.regional || `Regional ${i+1}`}</span>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${pct}%;background:${RANK_COLORS[i % RANK_COLORS.length]}"></div></div>
      <span class="rank-val">${r.cancelamentos}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   PAGE 2 — ZONA DE CHURN
   ============================================================ */

function renderP2() {
  if (!_zona) return;

  const fs = _fs.p2;

  /* Dropdowns */
  const regsInad = [...new Set((_zona.inadimplentes || []).map(a => a.codigo_regional).filter(Boolean))].sort();
  populateSel('p2-regional', regsInad, v => regionalLabel(v), fs.regional);

  /* Reativações */
  setText('cnt-reat', fmtNum((_zona.reativacoes_recentes || []).length));

  rerender2();
}

function rerender2() {
  if (!_zona) return;
  const fs = _fs.p2;

  let inadList = _zona.inadimplentes || [];
  if (fs.regional) inadList = inadList.filter(a => a.codigo_regional === fs.regional);

  let cancList = _zona.cancelamentos_solicitados || [];
  if (fs.regional) cancList = cancList.filter(a => a.codigo_regional === fs.regional);

  setText('cnt-risco', fmtNum(inadList.length + cancList.length));
  setText('cnt-inad',  fmtNum(inadList.length));
  setText('cnt-canc',  fmtNum(cancList.length));

  /* Prog bar */
  const meta  = _zona.meta_recuperacao || {};
  const total = meta.total_em_risco || 0;
  const rec   = meta.recuperados    || 0;
  const pct   = total > 0 ? Math.round((rec / total) * 100) : 0;
  setText('meta-txt', `${rec} de ${total} associados em risco recuperados`);
  setText('meta-pct', pct + '%');
  const fill = document.getElementById('meta-fill');
  if (fill) fill.style.width = pct + '%';

  renderInad(inadList);
  renderCanc(cancList);
  renderReat(_zona.reativacoes_recentes || []);

  /* Update badge counts */
  setText('tab-cnt-inad', inadList.length);
  setText('tab-cnt-canc', cancList.length);
  setText('tab-cnt-reat', (_zona.reativacoes_recentes || []).length);
}

function renderInad(lista) {
  const search = _stateInad.search.toLowerCase();
  let rows = search ? lista.filter(a =>
    (a.nome || '').toLowerCase().includes(search) ||
    (a.cpf  || '').replace(/\D/g,'').includes(search.replace(/\D/g,''))
  ) : lista;
  rows = sortArr(rows, _stateInad.sort.col, _stateInad.sort.dir);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PP));
  if (_stateInad.page > pages) _stateInad.page = pages;
  setText('rc-inad', fmtNum(total) + ' registro' + (total !== 1 ? 's' : ''));

  const page  = paginateData(rows, _stateInad.page, PP);
  const tbody = document.getElementById('tb-inad');
  if (!tbody) return;

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty">✅ Nenhum inadimplente encontrado</div></td></tr>`;
    renderPag('pag-inad', 1, 1, 0, () => {});
    return;
  }

  tbody.innerHTML = page.map(a => {
    const fn   = (a.nome || '').split(' ')[0];
    const msg  = `Olá ${fn}, tudo bem? Identificamos que sua proteção veicular está pendente desde o dia ${a.dia_vencimento}. Podemos ajudar a regularizar? 🚗🛡️`;
    const wa   = waLink(a.telefone_celular, a.nome, msg);
    const hasTel = !!cleanPhone(a.telefone_celular);
    const atraso = Number(a.dias_atraso || 0);
    const atrasoCls = atraso >= 7 ? 'tag-red' : atraso >= 4 ? 'tag-amber' : 'tag-gray';
    return `<tr>
      <td><div class="td-name">${a.nome || '—'}</div><div class="td-sub">${maskCPF(a.cpf)}</div></td>
      <td class="td-mono">${maskPhone(a.telefone_celular)}</td>
      <td class="td-mono">Dia ${a.dia_vencimento || '—'}</td>
      <td><span class="tag ${atrasoCls}">${atraso}d</span></td>
      <td class="td-mono">${fmtTempoCasa(a.dias_associado)}</td>
      <td>${cdBadge(a.dias_para_churn)}</td>
      <td>${statusBadge(a.status_churn)}</td>
      <td style="white-space:nowrap">${sgaBtn(a.codigo_associado)}${hasTel ? ` <a href="${wa}" target="_blank" rel="noopener" class="btn-wa">${WA_SVG} WA</a>` : ''}</td>
    </tr>`;
  }).join('');

  renderPag('pag-inad', _stateInad.page, pages, total, p => { _stateInad.page = p; renderInad(lista); });
}

function renderCanc(lista) {
  const search = _stateCanc.search.toLowerCase();
  let rows = search ? lista.filter(a =>
    (a.nome || '').toLowerCase().includes(search) ||
    (a.cpf  || '').replace(/\D/g,'').includes(search.replace(/\D/g,''))
  ) : lista;
  rows = sortArr(rows, _stateCanc.sort.col, _stateCanc.sort.dir);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PP));
  if (_stateCanc.page > pages) _stateCanc.page = pages;
  setText('rc-canc', fmtNum(total) + ' registro' + (total !== 1 ? 's' : ''));

  const page  = paginateData(rows, _stateCanc.page, PP);
  const tbody = document.getElementById('tb-canc');
  if (!tbody) return;

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty">✅ Nenhum cancelamento encontrado</div></td></tr>`;
    renderPag('pag-canc', 1, 1, 0, () => {});
    return;
  }

  tbody.innerHTML = page.map(a => `<tr>
    <td><div class="td-name">${a.nome || '—'}</div><div class="td-sub">${maskCPF(a.cpf)}</div></td>
    <td class="td-mono">${fmtDate(a.data_alteracao)}</td>
    <td>${a.usuario_alteracao || '—'}</td>
    <td><span class="tag tag-red">Ativo → Inativo</span></td>
    <td style="font-size:11px;color:#6B6B67">${(a.observacao || '').trim() || '—'}</td>
    <td>${sgaBtn(a.codigo_associado)}</td>
  </tr>`).join('');

  renderPag('pag-canc', _stateCanc.page, pages, total, p => { _stateCanc.page = p; renderCanc(lista); });
}

function renderReat(lista) {
  const search = _stateReat.search.toLowerCase();
  let rows = search ? lista.filter(a =>
    (a.nome || '').toLowerCase().includes(search) ||
    (a.cpf  || '').replace(/\D/g,'').includes(search.replace(/\D/g,''))
  ) : lista;
  rows = sortArr(rows, _stateReat.sort.col, _stateReat.sort.dir);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PP));
  if (_stateReat.page > pages) _stateReat.page = pages;
  setText('rc-reat', fmtNum(total) + ' registro' + (total !== 1 ? 's' : ''));

  const page  = paginateData(rows, _stateReat.page, PP);
  const tbody = document.getElementById('tb-reat');
  if (!tbody) return;

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty">🔄 Nenhuma reativação recente</div></td></tr>`;
    renderPag('pag-reat', 1, 1, 0, () => {});
    return;
  }

  tbody.innerHTML = page.map(a => {
    const fn  = (a.nome || '').split(' ')[0];
    const msg = `Olá ${fn}, tudo bem? Ótima notícia — sua proteção veicular foi reativada com sucesso! 🚗🛡️`;
    const wa  = waLink(a.telefone_celular, a.nome, msg);
    const hasTel = !!cleanPhone(a.telefone_celular);
    return `<tr>
      <td><div class="td-name">${a.nome || '—'}</div><div class="td-sub">${maskCPF(a.cpf)}</div></td>
      <td class="td-mono">${fmtDate(a.data_reativacao)}</td>
      <td class="td-mono">${fmtTempoCasa(a.dias_associado)}</td>
      <td class="td-mono">${maskPhone(a.telefone_celular)}</td>
      <td style="white-space:nowrap">${sgaBtn(a.codigo_associado)}${hasTel ? ` <a href="${wa}" target="_blank" rel="noopener" class="btn-wa">${WA_SVG} WA</a>` : ''}</td>
    </tr>`;
  }).join('');

  renderPag('pag-reat', _stateReat.page, pages, total, p => { _stateReat.page = p; renderReat(lista); });
}

/* ============================================================
   PAGE 3 — ANÁLISE
   ============================================================ */

function renderP3() {
  if (!_analise) return;
  const fs = _fs.p3;

  /* Dropdowns */
  const regs = [...new Set((_analise.por_regional || []).map(r => r.regional).filter(Boolean))].sort();
  populateSel('p3-regional', regs, v => v, fs.regional);

  renderCancelChart();
  renderRankUnidade();
  renderRankTempo();
  renderEvolucaoChart();
  renderAltTable();
}

function renderCancelChart() {
  const ctx = document.getElementById('c-cancel');
  if (!ctx) return;
  if (_cCancel) _cCancel.destroy();

  const pm = _analise?.por_mes || [];
  if (pm.length === 0) { ctx.closest('.chart-area').innerHTML = '<div class="empty">Sem dados mensais</div>'; return; }

  const labels = pm.map(m => {
    const [y, mo] = m.mes.split('-');
    return monthShort(Number(mo)) + '/' + String(y).slice(2);
  });

  const media = Math.round(pm.reduce((s, m) => s + m.cancelamentos, 0) / pm.length);

  _cCancel = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Cancelamentos', data: pm.map(m => m.cancelamentos), backgroundColor: C.red + 'AA', borderColor: C.red, borderWidth: 1, borderRadius: 3 },
        { label: 'Média', data: pm.map(() => media), type: 'line', borderColor: C.amber, backgroundColor: 'transparent', borderWidth: 1.5, borderDash: [4,4], pointRadius: 0 },
      ],
    },
    options: { ...CHART_OPTS, interaction: { mode: 'index', intersect: false } },
  });
}

function renderRankUnidade() {
  const el = document.getElementById('rank-unidade');
  if (!el) return;

  const pr = _analise?.por_regional || [];
  if (pr.length === 0) { el.innerHTML = '<div class="empty">Sem dados por unidade</div>'; return; }

  const max = Math.max(...pr.map(r => r.cancelamentos), 1);
  el.innerHTML = pr.map((r, i) => {
    const pct = Math.round((r.cancelamentos / max) * 100);
    return `<div class="rank-row">
      <span class="rank-label">${r.regional || `Reg. ${i+1}`}</span>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${pct}%;background:${RANK_COLORS[i % RANK_COLORS.length]}"></div></div>
      <span class="rank-val">${r.cancelamentos}</span>
    </div>`;
  }).join('');
}

function renderRankTempo() {
  const el = document.getElementById('rank-tempo');
  if (!el) return;

  const dt = _analise?.distribuicao_tempo_casa || [];
  if (dt.length === 0) { el.innerHTML = '<div class="empty">Sem dados de tempo de casa</div>'; return; }

  const FAIXAS = [
    { k: '0-30',    l: 'Até 30d' },
    { k: '31-90',   l: '31–90d' },
    { k: '91-180',  l: '91–180d' },
    { k: '181-365', l: '6m–1a' },
    { k: '366-730', l: '1–2 anos' },
    { k: '730+',    l: '2+ anos' },
  ];
  const sorted = FAIXAS.map(f => ({ ...f, q: (dt.find(d => d.faixa === f.k) || { quantidade: 0 }).quantidade }));
  const max = Math.max(...sorted.map(f => f.q), 1);

  el.innerHTML = sorted.map((f, i) => {
    const pct = Math.round((f.q / max) * 100);
    return `<div class="rank-row">
      <span class="rank-label">${f.l}</span>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${pct}%;background:${RANK_COLORS[i % RANK_COLORS.length]}"></div></div>
      <span class="rank-val">${f.q}</span>
    </div>`;
  }).join('');
}

function renderEvolucaoChart() {
  const ctx = document.getElementById('c-evolucao');
  if (!ctx) return;
  if (_cEvolucao) _cEvolucao.destroy();

  const pm = _hist?.por_mes;
  if (!pm || pm.length === 0) { ctx.closest('.chart-area').innerHTML = '<div class="empty">Sem histórico</div>'; return; }

  const labels = pm.map(m => {
    const [y, mo] = m.mes.split('-');
    return monthShort(Number(mo)) + '/' + String(y).slice(2);
  });

  _cEvolucao = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Cancelamentos',
        data: pm.map(m => m.cancelamentos),
        borderColor: C.red,
        backgroundColor: C.red + '15',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: C.red,
        borderWidth: 2,
      }],
    },
    options: { ...CHART_OPTS },
  });
}

function renderAltTable() {
  const fs    = _fs.p3;
  let rows    = _analise?.detalhes || [];
  const { from, to } = getPeriodDates(fs.period, fs.from, fs.to);
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
  if (fs.regional) rows = rows.filter(r => r.regional === fs.regional);

  const search = _stateAlt.search.toLowerCase();
  if (search) rows = rows.filter(r => (r.nome || '').toLowerCase().includes(search));

  rows = sortArr(rows, _stateAlt.sort.col, _stateAlt.sort.dir);

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PP));
  if (_stateAlt.page > pages) _stateAlt.page = pages;
  setText('rc-alt', fmtNum(total) + ' cancelamento' + (total !== 1 ? 's' : ''));

  const page  = paginateData(rows, _stateAlt.page, PP);
  const tbody = document.getElementById('tb-alt');
  if (!tbody) return;

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty">🔍 Nenhum cancelamento no período</div></td></tr>`;
    renderPag('pag-alt', 1, 1, 0, () => {});
    return;
  }

  tbody.innerHTML = page.map(r => `<tr>
    <td><div class="td-name">${r.nome || '—'}</div></td>
    <td class="td-mono">${fmtDate(r.data_cancelamento)}</td>
    <td class="td-mono">${fmtTempoCasa(r.dias_casa)}</td>
    <td>${r.regional || '—'}</td>
    <td>${r.operadora || '—'}</td>
    <td>${sgaBtn(r.codigo_associado)}</td>
  </tr>`).join('');

  renderPag('pag-alt', _stateAlt.page, pages, total, p => { _stateAlt.page = p; renderAltTable(); });
}

/* ============================================================
   FILTER SETUP
   ============================================================ */

function setupFilters() {
  /* Page 1 pills */
  document.querySelectorAll('[data-page="p1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-page="p1"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _fs.p1.period = btn.dataset.d;
      const dr = document.getElementById('p1-daterange');
      if (dr) dr.style.display = btn.dataset.d === 'custom' ? 'flex' : 'none';
      if (btn.dataset.d !== 'custom' && _panorama) renderP1();
    });
  });
  document.getElementById('p1-apply')?.addEventListener('click', () => {
    _fs.p1.from   = document.getElementById('p1-from')?.value || '';
    _fs.p1.to     = document.getElementById('p1-to')?.value   || '';
    _fs.p1.period = 'custom';
    if (_panorama) renderP1();
  });
  document.getElementById('p1-regional')?.addEventListener('change', e => {
    _fs.p1.regional = e.target.value;
    if (_panorama) renderP1();
  });

  /* Page 2 selects */
  document.getElementById('p2-regional')?.addEventListener('change', e => {
    _fs.p2.regional = e.target.value;
    if (_zona) rerender2();
  });

  /* Page 3 pills */
  document.querySelectorAll('[data-page="p3"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-page="p3"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _fs.p3.period = btn.dataset.d;
      const dr = document.getElementById('p3-daterange');
      if (dr) dr.style.display = btn.dataset.d === 'custom' ? 'flex' : 'none';
      if (btn.dataset.d !== 'custom' && _analise) renderAltTable();
    });
  });
  document.getElementById('p3-apply')?.addEventListener('click', () => {
    _fs.p3.from   = document.getElementById('p3-from')?.value || '';
    _fs.p3.to     = document.getElementById('p3-to')?.value   || '';
    _fs.p3.period = 'custom';
    if (_analise) renderAltTable();
  });
  document.getElementById('p3-regional')?.addEventListener('change', e => {
    _fs.p3.regional = e.target.value;
    if (_analise) renderAltTable();
  });
}

function setupTabs() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      ['inad','canc','reat'].forEach(t => {
        const p = document.getElementById('panel-' + t);
        if (p) p.style.display = t === tab ? 'flex' : 'none';
      });
    });
  });
}

function setupSearch() {
  document.getElementById('search-inad')?.addEventListener('input', e => {
    _stateInad.search = e.target.value; _stateInad.page = 1;
    if (_zona) renderInad(_zona.inadimplentes || []);
  });
  document.getElementById('search-canc')?.addEventListener('input', e => {
    _stateCanc.search = e.target.value; _stateCanc.page = 1;
    if (_zona) renderCanc(_zona.cancelamentos_solicitados || []);
  });
  document.getElementById('search-reat')?.addEventListener('input', e => {
    _stateReat.search = e.target.value; _stateReat.page = 1;
    if (_zona) renderReat(_zona.reativacoes_recentes || []);
  });
  document.getElementById('search-alt')?.addEventListener('input', e => {
    _stateAlt.search = e.target.value; _stateAlt.page = 1;
    if (_analise) renderAltTable();
  });
}

function setupExports() {
  document.getElementById('exp-inad')?.addEventListener('click', () => {
    if (!_zona) return;
    const fs = _fs.p2;
    let rows = _zona.inadimplentes || [];
    if (fs.regional) rows = rows.filter(a => a.codigo_regional === fs.regional);
    exportCSV(
      ['Nome','CPF','Telefone','Dia Vencimento','Dias Atraso','Tempo na ANPARA (dias)','Dias para Churn','Status','Codigo Associado'],
      rows.map(a => [a.nome, a.cpf, a.telefone_celular, a.dia_vencimento, a.dias_atraso, a.dias_associado || '', a.dias_para_churn, a.status_churn, a.codigo_associado]),
      'inadimplentes.csv'
    );
  });
  document.getElementById('exp-canc')?.addEventListener('click', () => {
    if (!_zona) return;
    const fs = _fs.p2;
    let rows = _zona.cancelamentos_solicitados || [];
    if (fs.regional) rows = rows.filter(a => a.codigo_regional === fs.regional);
    exportCSV(
      ['Nome','CPF','Data','Operador','Motivo','Codigo Associado'],
      rows.map(a => [a.nome, a.cpf, a.data_alteracao, a.usuario_alteracao, a.observacao || '', a.codigo_associado]),
      'cancelamentos.csv'
    );
  });
  document.getElementById('exp-alt')?.addEventListener('click', () => {
    if (!_analise) return;
    const rows = _analise.detalhes || [];
    exportCSV(
      ['Nome','Data Cancelamento','Dias de Casa','Regional','Operadora','Codigo Associado'],
      rows.map(r => [r.nome, r.data_cancelamento, r.dias_casa, r.regional, r.operadora, r.codigo_associado]),
      'analise-churn.csv'
    );
  });
}

/* ============================================================
   HELPERS
   ============================================================ */

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function populateSel(id, values, labelFn, curVal) {
  const sel = document.getElementById(id);
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  values.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = labelFn(v);
    sel.appendChild(o);
  });
  if (curVal) sel.value = curVal;
}

function renderPag(id, page, pages, total, onPage) {
  const el = document.getElementById(id);
  if (!el) return;
  if (pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="pag">
    <button class="pag-btn" ${page <= 1 ? 'disabled' : ''} data-p="${page-1}">‹ Anterior</button>
    <span class="pag-info">Pág. ${page}/${pages} · ${fmtNum(total)} registros</span>
    <button class="pag-btn" ${page >= pages ? 'disabled' : ''} data-p="${page+1}">Próxima ›</button>
  </div>`;
  el.querySelectorAll('.pag-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => onPage(Number(btn.dataset.p)));
  });
}

function cdBadge(dias) {
  const d = Number(dias);
  if (d <= 1) return `<span class="cd danger">⚠ ${d}d restante</span>`;
  if (d <= 3) return `<span class="cd warn">⏱ ${d}d restantes</span>`;
  return `<span class="cd safe">✓ ${d}d restantes</span>`;
}

function statusBadge(s) {
  if (s === 'CHURN_IMINENTE') return `<span class="tag tag-red">Churn iminente</span>`;
  if (s === 'EM_RISCO')       return `<span class="tag tag-amber">Em risco</span>`;
  return `<span class="tag tag-gray">${s || '—'}</span>`;
}

function fmtTempoCasa(dias) {
  if (!dias || isNaN(dias)) return '—';
  const d = Number(dias);
  if (d < 30)  return `${d}d`;
  if (d < 365) return `${Math.floor(d/30)}m`;
  const anos  = Math.floor(d / 365);
  const meses = Math.floor((d % 365) / 30);
  return meses > 0 ? `${anos}a ${meses}m` : `${anos}a`;
}

function monthShort(n) {
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][n - 1] || '';
}

const REGIONAL_NAMES = { '1': 'Ipatinga', '2': 'Betim' };
function regionalLabel(code) {
  return REGIONAL_NAMES[String(code)] || `Regional ${code}`;
}

const WA_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

/* ---- Re-export from api.js ---- */
function fmtNum(n)   { return Number(n).toLocaleString('pt-BR'); }
function fmtDate(s)  {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('pt-BR');
}
function maskCPF(cpf) {
  if (!cpf) return '—';
  const d = String(cpf).replace(/\D/g,'');
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.***.***-${d.slice(9)}`;
}
function maskPhone(p) {
  if (!p) return '—';
  const d = String(p).replace(/\D/g,'');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d[2]}****-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ****-${d.slice(6)}`;
  return p;
}
function cleanPhone(p) { return String(p || '').replace(/\D/g,''); }
function waLink(phone, nome, msg) {
  const c = cleanPhone(phone);
  if (!c) return '#';
  return `https://wa.me/55${c}?text=${encodeURIComponent(msg || '')}`;
}
const SGA_BASE = 'https://sga.hinova.com.br/associado/consulta';
function sgaBtn(cod) {
  if (!cod) return '—';
  return `<a href="${SGA_BASE}?codigo_associado=${encodeURIComponent(cod)}" target="_blank" rel="noopener" class="btn-sga">↗ SGA</a>`;
}
function exportCSV(headers, rows, filename) {
  const BOM = '﻿';
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g,'""')}"`;
  const csv = BOM + [headers, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
  const a   = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})), download: filename || 'export.csv' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
function sortArr(arr, col, dir) {
  return [...arr].sort((a, b) => {
    let va = a[col], vb = b[col];
    if (va == null) va = ''; if (vb == null) vb = '';
    const na = Number(va), nb = Number(vb);
    const cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(va).localeCompare(String(vb), 'pt-BR');
    return dir === 'asc' ? cmp : -cmp;
  });
}
function paginateData(arr, page, pp) { return arr.slice((page-1)*pp, page*pp); }

function getPeriodDates(period, from, to) {
  const now = new Date();
  const end = new Date(now); end.setHours(23,59,59,999);
  let start = new Date(now);
  if (period === 'today')  { start.setHours(0,0,0,0); }
  else if (period === 'week')  { const d = start.getDay()||7; start.setDate(start.getDate()-(d-1)); start.setHours(0,0,0,0); }
  else if (period === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  else if (period === 'year')  { start = new Date(now.getFullYear(), 0, 1); }
  else if (period === 'custom') {
    return { from: from ? new Date(from+'T00:00:00') : null, to: to ? new Date(to+'T23:59:59') : null };
  }
  return { from: start, to: end };
}

function getPeriodLabel(period, from, to) {
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const now = new Date();
  if (period === 'today')  return 'Hoje';
  if (period === 'week')   return 'Esta Semana';
  if (period === 'month')  return `${months[now.getMonth()]}/${now.getFullYear()}`;
  if (period === 'year')   return String(now.getFullYear());
  if (period === 'custom') {
    const f = from ? new Date(from+'T00:00:00').toLocaleDateString('pt-BR') : '?';
    const t = to   ? new Date(to+'T00:00:00').toLocaleDateString('pt-BR')   : '?';
    return `${f} − ${t}`;
  }
  return '';
}

function filterByDate(items, field, from, to) {
  if (!from && !to) return items;
  return items.filter(item => {
    const d = new Date(item[field]);
    if (isNaN(d)) return false;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  setupFilters();
  setupTabs();
  setupSearch();
  setupExports();

  document.getElementById('btn-refresh')?.addEventListener('click', init);
  document.getElementById('p2-refresh')?.addEventListener('click', init);
  document.getElementById('p3-refresh')?.addEventListener('click', init);

  init();
  setInterval(init, 5 * 60 * 1000);
});

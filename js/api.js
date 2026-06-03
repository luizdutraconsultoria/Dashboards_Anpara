const API_BASE = 'https://anpara-proxy.luizdutraconsultoria.workers.dev';

const API = {
  async _get(acao) {
    const res = await fetch(`${API_BASE}?acao=${acao}`);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status} ao buscar "${acao}"`);
    return res.json();
  },
  panorama()  { return this._get('panorama'); },
  zonaChurn() { return this._get('zona_churn'); },
  alteracoes(){ return this._get('alteracoes'); },
};

/* ——— UTILITIES ——— */

function maskCPF(cpf) {
  if (!cpf) return '—';
  const d = String(cpf).replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.***.***-${d.slice(9)}`;
}

function maskPhone(phone) {
  if (!phone) return '—';
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d[2]}****-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ****-${d.slice(6)}`;
  return phone;
}

function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function fmtNum(n) {
  return Number(n).toLocaleString('pt-BR');
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (!isNaN(d)) return d.toLocaleDateString('pt-BR');
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return str;
}

function waLink(phone, nome, msg) {
  const clean = cleanPhone(phone);
  if (!clean) return '#';
  const text = encodeURIComponent(msg || `Olá ${(nome || '').split(' ')[0]}, somos da Anpara. Gostaríamos de conversar sobre seu plano de proteção veicular.`);
  return `https://wa.me/55${clean}?text=${text}`;
}

const WA_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

/* ——— SGA LINK ——— */
const SGA_BASE = 'https://sga.hinova.com.br/associado/consulta';
function sgaBtn(codigo) {
  if (!codigo) return '—';
  return `<a href="${SGA_BASE}?codigo_associado=${encodeURIComponent(codigo)}" target="_blank" rel="noopener" class="btn-sga">&#8599; SGA</a>`;
}

/* ——— EXPORT CSV ——— */
function exportCSV(headers, rows, filename) {
  const BOM = '﻿';
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const csv = BOM + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'export.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ——— PERIOD UTILITIES ——— */

function getPeriodDates(period, customFrom, customTo) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  let from = new Date();

  if (period === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    const day = from.getDay() || 7; // Mon=1 … Sun=7
    from.setDate(from.getDate() - (day - 1));
    from.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    from = new Date(from.getFullYear(), from.getMonth(), 1, 0, 0, 0, 0);
  } else if (period === 'year') {
    from = new Date(from.getFullYear(), 0, 1, 0, 0, 0, 0);
  } else if (period === 'custom') {
    return {
      from: customFrom ? new Date(customFrom + 'T00:00:00') : null,
      to:   customTo   ? new Date(customTo   + 'T23:59:59') : null,
    };
  } else {
    // Fallback numérico legado
    const days = Number(period) || 7;
    from = new Date(to);
    from.setDate(from.getDate() - days + 1);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

function getPeriodLabel(period, customFrom, customTo) {
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const now = new Date();
  if (period === 'today') return 'Hoje';
  if (period === 'week')  return 'Esta Semana';
  if (period === 'month') return `${months[now.getMonth()]}/${String(now.getFullYear()).slice(2)}`;
  if (period === 'year')  return String(now.getFullYear());
  if (period === 'custom') {
    const f = customFrom ? new Date(customFrom + 'T00:00:00').toLocaleDateString('pt-BR') : '?';
    const t = customTo   ? new Date(customTo   + 'T00:00:00').toLocaleDateString('pt-BR') : '?';
    return `${f} − ${t}`;
  }
  return '';
}

function filterByDate(items, field, from, to) {
  if (!from && !to) return items;
  return items.filter(item => {
    const raw = item[field];
    if (!raw) return false;
    const d = new Date(raw);
    if (isNaN(d)) return false;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
}

/* ——— GRANULARITY ——— */

function getGranularity(period) {
  if (period === 'today') return 'day';
  if (period === 'week')  return 'day';
  if (period === 'month') return 'week';
  if (period === 'year')  return 'month';
  if (period === 'custom') return 'day';
  const days = Number(period) || 7;
  if (days <= 7)  return 'day';
  if (days <= 30) return 'week';
  return 'month';
}

function _isoWeek(d) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
}

function _granKey(d, gran) {
  if (gran === 'day')   return d.toISOString().slice(0, 10);
  if (gran === 'week')  return `${d.getFullYear()}-W${String(_isoWeek(d)).padStart(2,'0')}`;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function _granLabel(key, gran) {
  if (gran === 'day') {
    const [,m,dd] = key.split('-');
    return `${dd}/${m}`;
  }
  if (gran === 'week') {
    const [, w] = key.split('-W');
    return `Sem ${Number(w)}`;
  }
  const [y, m] = key.split('-');
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${months[Number(m)-1]}/${String(y).slice(2)}`;
}

function groupItems(items, dateField, gran) {
  const map = new Map();
  items.forEach(item => {
    const raw = item[dateField];
    if (!raw) return;
    const d = new Date(raw);
    if (isNaN(d)) return;
    const key = _granKey(d, gran);
    if (!map.has(key)) map.set(key, { key, label: _granLabel(key, gran), items: [] });
    map.get(key).items.push(item);
  });
  return [...map.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([, v]) => v);
}

function groupSnapshots(snaps, gran) {
  const map = new Map();
  snaps.forEach(s => {
    const raw = s.Data;
    if (!raw) return;
    const d = new Date(raw);
    if (isNaN(d)) return;
    const key = _granKey(d, gran);
    if (!map.has(key)) map.set(key, { key, label: _granLabel(key, gran), ativos: 0, inativos: 0, count: 0 });
    const g = map.get(key);
    g.ativos   += Number(s.Ativos   || 0);
    g.inativos += Number(s.Inativos || 0);
    g.count    += 1;
  });
  return [...map.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([, v]) => ({
    label:    v.label,
    ativos:   Math.round(v.ativos   / v.count),
    inativos: Math.round(v.inativos / v.count),
  }));
}

/* ——— FILTER STATE & INITIALIZER ——— */

let _filterState = { period: 'month', customFrom: '', customTo: '', regional: '', coop: '', operadora: '' };

function initFilters(onChange) {
  document.querySelectorAll('.pb').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pb').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _filterState.period = btn.dataset.d;
      const cr = document.getElementById('custom-range');
      if (cr) cr.style.display = btn.dataset.d === 'custom' ? 'flex' : 'none';
      if (btn.dataset.d !== 'custom') onChange(_filterState);
    });
  });

  document.getElementById('btn-apply')?.addEventListener('click', () => {
    _filterState.customFrom = document.getElementById('date-from')?.value || '';
    _filterState.customTo   = document.getElementById('date-to')?.value   || '';
    _filterState.period = 'custom';
    onChange(_filterState);
  });

  document.getElementById('sel-regional')?.addEventListener('change', e => {
    _filterState.regional = e.target.value;
    _filterState.coop = '';
    const selCoop = document.getElementById('sel-coop');
    if (selCoop) selCoop.value = '';
    onChange(_filterState);
  });

  document.getElementById('sel-coop')?.addEventListener('change', e => {
    _filterState.coop = e.target.value;
    onChange(_filterState);
  });

  document.getElementById('sel-operadora')?.addEventListener('change', e => {
    _filterState.operadora = e.target.value;
    onChange(_filterState);
  });

  return _filterState;
}

function getFilterState() {
  return _filterState;
}

function populateRegionals(items, field, curVal) {
  const sel = document.getElementById('sel-regional');
  if (!sel) return;
  const vals = [...new Set(items.map(i => i[field]).filter(Boolean))].sort();
  while (sel.options.length > 1) sel.remove(1);
  vals.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = `Regional ${v}`;
    sel.appendChild(o);
  });
  if (curVal) sel.value = curVal;
}

function populateDropdowns(items, regionalField, coopField, curRegional, curCoop) {
  const selReg  = document.getElementById('sel-regional');
  const selCoop = document.getElementById('sel-coop');

  if (selReg) {
    const regs = [...new Set(items.map(i => i[regionalField]).filter(Boolean))].sort();
    while (selReg.options.length > 1) selReg.remove(1);
    regs.forEach(r => {
      const o = document.createElement('option');
      o.value = r; o.textContent = `Regional ${r}`;
      selReg.appendChild(o);
    });
    if (curRegional) selReg.value = curRegional;
  }

  if (selCoop) {
    const coops = [...new Set(items.map(i => i[coopField]).filter(Boolean))].sort();
    while (selCoop.options.length > 1) selCoop.remove(1);
    coops.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = `Cooperativa ${c}`;
      selCoop.appendChild(o);
    });
    if (curCoop) selCoop.value = curCoop;
  }
}

function populateOperadoras(items, field) {
  const sel = document.getElementById('sel-operadora');
  if (!sel) return;
  const ops = [...new Set(items.map(i => i[field]).filter(Boolean))].sort();
  while (sel.options.length > 1) sel.remove(1);
  ops.forEach(op => {
    const o = document.createElement('option');
    o.value = op; o.textContent = op;
    sel.appendChild(o);
  });
}

/* ——— SORT / PAGINATE ——— */

function sortArr(arr, col, dir) {
  return [...arr].sort((a, b) => {
    let va = a[col], vb = b[col];
    if (va == null) va = '';
    if (vb == null) vb = '';
    const na = Number(va), nb = Number(vb);
    const cmp = (!isNaN(na) && !isNaN(nb))
      ? na - nb
      : String(va).localeCompare(String(vb), 'pt-BR');
    return dir === 'asc' ? cmp : -cmp;
  });
}

function paginateData(arr, page, pp) {
  pp = pp || 50;
  const start = (page - 1) * pp;
  return arr.slice(start, start + pp);
}

function renderPagination(el, page, pages, total, onPage) {
  if (!el) return;
  if (pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="pag">
      <button class="pag-btn" ${page <= 1 ? 'disabled' : ''} data-p="${page-1}">&#8249; Anterior</button>
      <span class="pag-info">Página ${page} de ${pages} &nbsp;·&nbsp; ${fmtNum(total)} registros</span>
      <button class="pag-btn" ${page >= pages ? 'disabled' : ''} data-p="${page+1}">Próxima &#8250;</button>
    </div>`;
  el.querySelectorAll('.pag-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => onPage(Number(btn.dataset.p)));
  });
}

function initSortableTable(tableEl, onSort) {
  tableEl.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      const cur = th.dataset.dir || 'none';
      const next = cur === 'asc' ? 'desc' : 'asc';
      tableEl.querySelectorAll('th.sortable').forEach(h => {
        h.dataset.dir = 'none';
        const si = h.querySelector('.si');
        if (si) si.textContent = '↕';
      });
      th.dataset.dir = next;
      const si = th.querySelector('.si');
      if (si) si.textContent = next === 'asc' ? '↑' : '↓';
      onSort(col, next);
    });
  });
}

/* ——— DOM HELPERS ——— */

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showLoading(show) {
  const el = document.getElementById('loading');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  if (!el) return;
  el.style.display = 'flex';
  const m = el.querySelector('.error-msg');
  if (m) m.textContent = msg;
}

function hideError() {
  const el = document.getElementById('error-banner');
  if (el) el.style.display = 'none';
}

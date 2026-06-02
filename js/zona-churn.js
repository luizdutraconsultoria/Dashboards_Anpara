let _data = null;

async function init() {
  showLoading(true);
  hideError();
  try {
    _data = await API.zonaChurn();
    render(_data);
  } catch (e) {
    showError('Falha ao carregar dados: ' + e.message);
  } finally {
    showLoading(false);
  }
}

function render(d) {
  setEl('ts', `Atualizado ${new Date(d.timestamp).toLocaleString('pt-BR')}`);

  /* Meta de recuperação */
  const meta = d.meta_recuperacao || {};
  const total = meta.total_em_risco || 0;
  const rec   = meta.recuperados || 0;
  const pct   = total > 0 ? Math.round((rec / total) * 100) : 0;
  setEl('meta-txt', `${rec} de ${total} associados em risco recuperados este mês`);
  setEl('meta-pct', pct + '%');
  const fill = document.getElementById('meta-fill');
  if (fill) fill.style.width = pct + '%';

  /* Cards resumo */
  setEl('cnt-inad', fmtNum(d.total_inadimplentes));
  setEl('cnt-canc', fmtNum(d.total_cancelamentos_solicitados));
  setEl('cnt-zona', fmtNum(d.total_zona_churn));

  /* Preenche filtro de regional com dados dos inadimplentes */
  const regs = new Set((d.inadimplentes || []).map(a => a.codigo_regional).filter(Boolean));
  populateRegional(regs);

  renderInadimplentes(d.inadimplentes || []);
  renderCancelamentos(d.cancelamentos_solicitados || []);
}

function populateRegional(regs) {
  const sel = document.getElementById('sel-regional');
  if (!sel || regs.size === 0) return;
  while (sel.options.length > 1) sel.remove(1);
  [...regs].sort().forEach(r => {
    const o = document.createElement('option');
    o.value = r;
    o.textContent = `Regional ${r}`;
    sel.appendChild(o);
  });
}

function cdBadge(dias) {
  const d = Number(dias);
  if (d <= 1) return `<span class="cd danger">⚠ ${d}d restante</span>`;
  if (d <= 3) return `<span class="cd warn">⏱ ${d}d restantes</span>`;
  return `<span class="cd safe">✓ ${d}d restantes</span>`;
}

function statusBadge(s) {
  if (s === 'CHURN_IMINENTE') return `<span class="badge b-red">Churn iminente</span>`;
  if (s === 'EM_RISCO')       return `<span class="badge b-yellow">Em risco</span>`;
  return `<span class="badge b-gray">${s}</span>`;
}

function renderInadimplentes(lista) {
  const tbody = document.getElementById('tb-inad');
  if (!tbody) return;

  const regional = document.getElementById('sel-regional')?.value || '';
  const rows = regional ? lista.filter(a => a.codigo_regional === regional) : lista;

  setEl('rc-inad', `${rows.length} registro${rows.length !== 1 ? 's' : ''}`);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-ico">✅</div><div class="empty-txt">Nenhum inadimplente encontrado</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(a => {
    const msgInad = `Olá ${a.nome.split(' ')[0]}, aqui é da Anpara! Identificamos que seu plano está com pagamento em aberto há ${a.dias_atraso} dia(s). Entre em contato para regularizar e manter sua proteção ativa! 🚗🛡️`;
    const href = waLink(a.telefone_celular, a.nome, msgInad);
    const hasTel = !!cleanPhone(a.telefone_celular);

    return `<tr>
      <td>
        <div class="td-name">${a.nome}</div>
        <div class="td-sub">${maskCPF(a.cpf)}</div>
      </td>
      <td class="td-mono">${maskPhone(a.telefone_celular)}</td>
      <td class="td-mono" style="color:var(--accent)">Dia ${a.dia_vencimento}</td>
      <td class="td-mono" style="color:var(--red);font-weight:600">${a.dias_atraso}d</td>
      <td>${cdBadge(a.dias_para_churn)}</td>
      <td>${statusBadge(a.status_churn)}</td>
      <td>${hasTel
        ? `<a href="${href}" target="_blank" rel="noopener" class="btn-wa">${WA_SVG} WhatsApp</a>`
        : `<span class="td-muted">Sem tel.</span>`}
      </td>
    </tr>`;
  }).join('');
}

function renderCancelamentos(lista) {
  const tbody = document.getElementById('tb-canc');
  if (!tbody) return;

  setEl('rc-canc', `${lista.length} registro${lista.length !== 1 ? 's' : ''}`);

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="empty-ico">✅</div><div class="empty-txt">Nenhum cancelamento solicitado no período</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(a => {
    /* cancelamentos_solicitados não tem telefone no retorno da API */
    return `<tr>
      <td>
        <div class="td-name">${a.nome}</div>
        <div class="td-sub">${maskCPF(a.cpf)}</div>
      </td>
      <td class="td-mono">${fmtDate(a.data_alteracao)}</td>
      <td>${a.usuario_alteracao || '—'}</td>
      <td><span class="badge b-red">Ativo → Inativo</span></td>
      <td><span class="td-muted" style="font-size:11px">Tel. não disponível</span></td>
    </tr>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('btn-refresh')?.addEventListener('click', init);
  document.getElementById('sel-regional')?.addEventListener('change', () => {
    if (_data) renderInadimplentes(_data.inadimplentes || []);
  });
});

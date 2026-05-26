
const API_URL = "https://script.google.com/macros/s/AKfycbx0SG5vpHCCtxV8i0zZ2Rkg931Mh1lQdCoHzXNdFRHi2Sj_-YU5mbzlW75ZpGNluhhutA/exec";

// ── Status ──
function setStatus(status, msg) {
  var el = document.getElementById("statusIndicator");
  var btn = document.getElementById("btnAtualizar");
  var errBox = document.getElementById("errorBox");
  var errMsg = document.getElementById("errorMsg");

  el.className = "status-dot status-" + status;
  var labels = { loading: "Carregando...", success: "Conectado", error: "Erro na API" };
  el.querySelector("span").textContent = labels[status] || "";

  btn.disabled = (status === "loading");
  btn.textContent = (status === "loading") ? "Carregando..." : "⟳ Atualizar";

  if (status === "error" && errBox) {
    errBox.style.display = "block";
    if (errMsg) errMsg.textContent = msg || "";
  } else if (errBox) {
    errBox.style.display = "none";
  }
}

// ── JSONP loader ──
var _jsonpTimeout = null;

function carregarDados() {
  setStatus("loading");

  // Remove previous JSONP script if any
  var old = document.getElementById("jsonpScript");
  if (old) old.remove();

  // Timeout: if no response in 10s, show error
  clearTimeout(_jsonpTimeout);
  _jsonpTimeout = setTimeout(function() {
    if (document.getElementById("statusIndicator").className.indexOf("loading") !== -1) {
      setStatus("error", "Timeout — sem resposta da API em 10 segundos. Verifique se o doGet() no Apps Script suporta JSONP (parâmetro callback).");
    }
  }, 10000);

  var script = document.createElement("script");
  script.id = "jsonpScript";
  script.src = API_URL + "?callback=renderizarDashboard";
  script.onerror = function() {
    clearTimeout(_jsonpTimeout);
    setStatus("error", "Falha ao carregar script da API. Verifique a URL e a implantação do Apps Script.");
  };
  document.body.appendChild(script);
}

// ── Formatters ──
function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === "" || valor === "-") return "—";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0
  });
}

function formatarNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  var n = Number(valor);
  return (n > 0 ? "+" : "") + n.toLocaleString("pt-BR");
}

function formatarValor(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "number") {
    if (Math.abs(valor) > 0 && Math.abs(valor) < 1) return (valor * 100).toFixed(0) + "%";
    return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  return String(valor);
}

function preencherTexto(id, valor) {
  var el = document.getElementById(id);
  if (el) el.textContent = (valor !== null && valor !== undefined) ? valor : "—";
}

// ── Color helpers ──
function custoColor(custo, ref) {
  if (custo === "-" || custo === null || custo === undefined || custo === "") return "#facc15";
  var c = Number(custo), r = Number(ref);
  if (c <= r) return "#22c55e";
  if (c <= r * 1.5) return "#facc15";
  return "#ef4444";
}

function crescColor(v) {
  var n = Number(v);
  if (n > 0) return "#22c55e";
  if (n < 0) return "#ef4444";
  return "#facc15";
}

// ── Main render (called by JSONP) ──
function renderizarDashboard(data) {
  clearTimeout(_jsonpTimeout);

  console.log("Dados recebidos:", data);

  var resumo = data.resumo || {};

  // Crescimento líquido
  preencherTexto("crescimentoLiquido", formatarNumero(resumo.crescimentoLiquido));
  var cColor = crescColor(resumo.crescimentoLiquido);
  document.getElementById("crescimentoLiquido").style.color = cColor;
  document.getElementById("kpiCrescimento").style.borderLeftColor = cColor;

  // Comissão total
  preencherTexto("comissaoTotal", formatarMoeda(resumo.comissaoTotal));

  // Custo por associado líquido
  preencherTexto("custoLiquido", formatarMoeda(resumo.custoPorAssociadoLiquido));
  var kColor = custoColor(resumo.custoPorAssociadoLiquido, resumo.referenciaRonaldo);
  document.getElementById("custoLiquido").style.color = kColor;
  document.getElementById("kpiCusto").style.borderLeftColor = kColor;
  if (resumo.referenciaRonaldo) {
    preencherTexto("referencia", "Referência: " + formatarMoeda(resumo.referenciaRonaldo));
  }

  // Vendas válidas
  preencherTexto("vendasValidas", resumo.vendasValidas);

  // Comissão por área
  preencherTexto("comissaoVendas", formatarMoeda(resumo.comissaoVendas));
  preencherTexto("comissaoRetencao", formatarMoeda(resumo.comissaoRetencao));
  preencherTexto("comissaoSinistro", formatarMoeda(resumo.comissaoSinistro));

  // Tabela
  renderizarTabela(data.resultados || []);

  setStatus("success");
}

// ── Table ──
function renderizarTabela(resultados) {
  var tbody = document.getElementById("resultadosTabela");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!resultados.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3">Nenhum dado disponível</td></tr>';
    return;
  }

  resultados.forEach(function(row, i) {
    var tr = document.createElement("tr");
    var isNewBlock = (i === 0 || row.Bloco !== resultados[i - 1].Bloco);

    if (i % 2 !== 0) tr.classList.add("alt");
    if (isNewBlock && i > 0) tr.classList.add("block-start");

    var blocoTd = document.createElement("td");
    if (isNewBlock) {
      blocoTd.textContent = row.Bloco || "";
      blocoTd.classList.add("block-label");
    }

    var metricaTd = document.createElement("td");
    metricaTd.textContent = row["Métrica"] || row.Metrica || "";

    var valorTd = document.createElement("td");
    valorTd.textContent = formatarValor(row.Valor);

    tr.appendChild(blocoTd);
    tr.appendChild(metricaTd);
    tr.appendChild(valorTd);
    tbody.appendChild(tr);
  });
}

// ── Auto-load ──
document.addEventListener("DOMContentLoaded", carregarDados);

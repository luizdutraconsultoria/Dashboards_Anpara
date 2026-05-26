const API_URL = "https://script.google.com/macros/s/AKfycbx0SG5vpHCCtxV8i0zZ2Rkg931Mh1lQdCoHzXNdFRHi2Sj_-YU5mbzlW75ZpGNluhhutA/exec";

async function carregarDados() {
  try {
    console.log("Carregando dados do simulador...");

    const response = await fetch(API_URL);
    const data = await response.json();

    console.log("Dados recebidos:", data);

    renderizarDashboard(data);
  } catch (error) {
    console.error("Erro ao carregar dados:", error);
  }
}

function renderizarDashboard(data) {
  const resumo = data.resumo || {};

  preencherTexto("crescimentoLiquido", resumo.crescimentoLiquido);
  preencherTexto("comissaoTotal", formatarMoeda(resumo.comissaoTotal));
  preencherTexto("custoLiquido", formatarMoeda(resumo.custoPorAssociadoLiquido));
  preencherTexto("vendasValidas", resumo.vendasValidas);

  preencherTexto("comissaoVendas", formatarMoeda(resumo.comissaoVendas));
  preencherTexto("comissaoRetencao", formatarMoeda(resumo.comissaoRetencao));
  preencherTexto("comissaoSinistro", formatarMoeda(resumo.comissaoSinistro));

  renderizarTabela(data.resultados || []);
}

function renderizarTabela(resultados) {
  const tabela = document.getElementById("resultadosTabela");
  if (!tabela) return;

  tabela.innerHTML = "";

  resultados.forEach(item => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${item.Bloco || ""}</td>
      <td>${item.Métrica || ""}</td>
      <td>${formatarValor(item.Valor)}</td>
    `;

    tabela.appendChild(tr);
  });
}

function preencherTexto(id, valor) {
  const el = document.getElementById(id);
  if (!el) return;

  el.textContent = valor ?? "-";
}

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === "" || valor === "-") return "-";

  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
}

function formatarValor(valor) {
  if (valor === null || valor === undefined || valor === "") return "-";

  if (typeof valor === "number") {
    return valor.toLocaleString("pt-BR", {
      maximumFractionDigits: 2
    });
  }

  return valor;
}

document.addEventListener("DOMContentLoaded", carregarDados);

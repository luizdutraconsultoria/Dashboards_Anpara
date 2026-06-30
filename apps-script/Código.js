// ============================================================
// ANPARA — EXTRAÇÃO COMPLETA VIA API HINOVA SGA v2
// ============================================================

const BASE_URL        = 'https://api.hinova.com.br/api/sga/v2';
const POWER_CRM_URL   = 'https://api.powercrm.com.br';
const POWER_CRM_TOKEN = '67lNJQsBWQWgIOioh0FIuwlec91TS7RnbLY9IzbU1xtdEbptGrWR6kR1wqbDmAJKDwgtJ3rRsW5g2YLfGPQHLrvm3Mt5u3eDuUoH3uW91hH5zzLNSvIwahUHGUXkVGYtryMKVL1n4CUXaCYXksvvvYK5IpD4ekP589HFfIdXcTlUfRJMOebyT4rFfiVDdMzV79FgwlMPr9R1T8Z2Mu5SVY6s';
const HINOVA_API_KEY  = 'd72a483496963a9ff6dd35326e633418754e0474b89e7934fffb830a67139f49e7945aaf7b5f5e54ecdaf1f9fc2abc2767326aa6b1de68c1b2964d45e7242004ffcc923693b641710c0810efec8e6aee3a92c6a85c172119e424e88514adbc1fdb82cfe3fc23058af75166eedc1119ad';
const HINOVA_LOGIN    = 'Luiz';
const HINOVA_SENHA    = '187987Anpara';

let TOKEN_USUARIO = null;

// ===================== HELPER UI =====================
// Usa getUi() quando disponível (menu da planilha), cai no Logger se não estiver
// (evita o erro "Cannot call SpreadsheetApp.getUi() from this context")
function getUI() {
  try {
    return SpreadsheetApp.getUi();
  } catch(e) {
    return {
      alert: function(titulo, msg, btn) {
        Logger.log("[ALERT] " + titulo + (msg ? ": " + msg : ""));
      },
      ButtonSet: { OK: null }
    };
  }
}

// ===================== MENU =====================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📊 Anpara")
    .addItem("🧪 Testar conexão", "autenticarETestar")
    .addSeparator()
    .addItem("📊 Resumo Ativos/Inativos", "extrairResumoRapido")
    .addItem("👥 Extrair Associados Ativos", "extrairAssociadosAtivos")
    .addItem("🚗 Extrair Veículos Ativos", "extrairVeiculosAtivos")
    .addItem("📋 Listar Situações e Motivos", "extrairSituacoesEMotivos")
    .addItem("🔄 Extrair Alterações (últimos 7 dias)", "extrairAlteracoes7dias")
    .addSeparator()
    .addItem("📸 Salvar Snapshot de Hoje", "salvarSnapshot")
    .addItem("📅 Agendar Snapshot de Fim de Mês", "agendarSnapshotFimMes")
    .addItem("🕰️ Preencher Histórico (últimos 12 meses)", "backfillSnapshots")
    .addSeparator()
    .addItem("📅 Reconstruir Histórico de Cancelamentos (3 anos)", "reconstruirHistoricoCancelamentos")
    .addItem("📈 Analisar Cancelamentos 60 e 90 dias", "analisarCancelamentos60e90")
    .addSeparator()
    .addItem("🔍 Diagnosticar Motivo Cancelamento", "diagnosticarMotivoCancelamento")
    .addSeparator()
    .addItem("🗑️ Invalidar Cache de Alterações", "invalidarCacheAlteracoes")
    .addItem("🗑️ Invalidar Cache de Zona de Churn", "invalidarCacheZonaChurn")
    .addItem("🗑️ Invalidar Cache Power CRM", "invalidarCachePowerCRM")
    .addToUi();
}

// ===================== AUTENTICAÇÃO =====================
function autenticar() {
  var response = UrlFetchApp.fetch(BASE_URL + "/usuario/autenticar", {
    method: "post",
    headers: {
      "Authorization": "Bearer " + HINOVA_API_KEY,
      "Content-Type":  "application/json"
    },
    payload: JSON.stringify({ "usuario": HINOVA_LOGIN, "senha": HINOVA_SENHA }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = JSON.parse(response.getContentText());

  if (code !== 200 || !body.token_usuario) {
    throw new Error("Falha na autenticação: " + response.getContentText());
  }

  TOKEN_USUARIO = body.token_usuario;
  Logger.log("✅ Autenticado com sucesso!");
  return TOKEN_USUARIO;
}

function chamarAPI(path, method, payload) {
  if (!TOKEN_USUARIO) autenticar();

  var options = {
    method: method || "get",
    headers: {
      "Authorization": "Bearer " + TOKEN_USUARIO,
      "Content-Type":  "application/json"
    },
    muteHttpExceptions: true
  };

  if (payload && (method === "post" || method === "POST")) {
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(BASE_URL + path, options);
  var code     = response.getResponseCode();
  var text     = response.getContentText();

  Logger.log((method || "get").toUpperCase() + " " + path + " → " + code);

  if (code === 401) {
    autenticar();
    options.headers["Authorization"] = "Bearer " + TOKEN_USUARIO;
    response = UrlFetchApp.fetch(BASE_URL + path, options);
    code     = response.getResponseCode();
    text     = response.getContentText();
  }

  if (code !== 200) {
    Logger.log("ERRO: " + text.substring(0, 500));
    return null;
  }

  return JSON.parse(text);
}

// Wrapper raw — retorna erros em vez de null, usado no diagnóstico
function chamarAPIRaw(path) {
  if (!TOKEN_USUARIO) autenticar();

  var options = {
    method: "get",
    headers: {
      "Authorization": "Bearer " + TOKEN_USUARIO,
      "Content-Type":  "application/json"
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(BASE_URL + path, options);
  var code     = response.getResponseCode();
  var text     = response.getContentText();

  Logger.log("GET " + path + " → HTTP " + code);
  Logger.log("Resposta (primeiros 500 chars): " + text.substring(0, 500));

  if (code === 401) {
    autenticar();
    options.headers["Authorization"] = "Bearer " + TOKEN_USUARIO;
    response = UrlFetchApp.fetch(BASE_URL + path, options);
    code     = response.getResponseCode();
    text     = response.getContentText();
  }

  if (code !== 200) {
    return { erro: "HTTP " + code, body: text.substring(0, 300) };
  }

  try {
    return JSON.parse(text);
  } catch(e) {
    return { erro: "JSON inválido", body: text.substring(0, 300) };
  }
}

// ===================== TESTE DE CONEXÃO =====================
function autenticarETestar() {
  var ui = getUI();
  try {
    autenticar();
    var resumo = chamarAPI("/associado-ativo-inativo/listar", "get");
    if (resumo) {
      ui.alert(
        "✅ Conexão OK!",
        "Autenticação funcionou!\n\n" +
        "Associados ativos: "   + (resumo.associados_ativos   || "N/D") + "\n" +
        "Associados inativos: " + (resumo.associados_inativos || "N/D") + "\n\n" +
        "Agora você pode usar o menu 📊 Anpara para extrair dados.",
        ui.ButtonSet.OK
      );
    } else {
      ui.alert("⚠️ Autenticação OK, mas erro ao buscar resumo. Verifique as permissões do token no SGA.", "", ui.ButtonSet.OK);
    }
  } catch(e) {
    ui.alert("❌ Erro", e.message, ui.ButtonSet.OK);
  }
}

// ===================== RESUMO RÁPIDO =====================
function extrairResumoRapido() {
  var ui = getUI();
  try {
    autenticar();
    var resumo    = chamarAPI("/associado-ativo-inativo/listar", "get");
    if (!resumo) { ui.alert("❌ Erro ao buscar resumo", "", ui.ButtonSet.OK); return; }

    var situacoes = chamarAPI("/listar/situacao/todos", "get");
    var motivos   = chamarAPI("/listar/situacaomotivo/todos", "get");

    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var aba = ss.getSheetByName("Resumo") || ss.insertSheet("Resumo");
    aba.clear();

    var dados = [
      ["📊 RESUMO ANPARA", "", Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy HH:mm")],
      ["", "", ""],
      ["Associados Ativos",   resumo.associados_ativos   || 0, ""],
      ["Associados Inativos", resumo.associados_inativos || 0, ""],
      ["", "", ""],
      ["📋 SITUAÇÕES CADASTRADAS", "", ""],
      ["Código", "Descrição", "Status"]
    ];

    if (Array.isArray(situacoes)) {
      situacoes.forEach(function(s) {
        dados.push([s.codigo_situacao, s.descricao_situacao, s.situacao]);
      });
    }

    dados.push(["", "", ""]);
    dados.push(["📋 MOTIVOS DE CANCELAMENTO/INATIVAÇÃO", "", ""]);
    dados.push(["Código", "Descrição", "Objeto"]);

    if (Array.isArray(motivos)) {
      motivos.forEach(function(m) {
        dados.push([m.codigo || "", m.descricao || "", m.objeto || ""]);
      });
    }

    aba.getRange(1, 1, dados.length, 3).setValues(dados);
    aba.getRange(1, 1, 1, 3).setFontWeight("bold").setFontSize(14);
    aba.getRange(6, 1, 1, 3).setFontWeight("bold");
    aba.autoResizeColumns(1, 3);
    aba.setFrozenRows(1);

    ui.alert("✅ Resumo extraído!", "Aba 'Resumo' criada com sucesso.", ui.ButtonSet.OK);
  } catch(e) {
    ui.alert("❌ Erro", e.message, ui.ButtonSet.OK);
    Logger.log(e.stack);
  }
}

// ===================== EXTRAIR ASSOCIADOS =====================
function extrairAssociadosAtivos() {
  extrairAssociadosPorSituacao(1, "Associados Ativos");
}

function extrairAssociadosInativos() {
  extrairAssociadosPorSituacao(2, "Associados Inativos");
}

function extrairAssociadosPorSituacao(codigoSituacao, nomeAba) {
  var ui = getUI();
  try {
    autenticar();
    var todos          = [];
    var pagina         = 0;
    var totalRegistros = 1;
    var qtdPorPagina   = 1000;

    while (pagina < totalRegistros) {
      var resultado = chamarAPI("/listar/associado", "post", {
        "codigo_situacao":      codigoSituacao,
        "inicio_paginacao":     pagina,
        "quantidade_por_pagina": qtdPorPagina
      });
      if (!resultado || !resultado.associados || resultado.associados.length === 0) break;
      totalRegistros = parseInt(resultado.total_associados) || 0;
      todos = todos.concat(resultado.associados);
      Logger.log("Offset " + pagina + "/" + totalRegistros + " — " + resultado.associados.length + " registros");
      pagina += qtdPorPagina;
      if (pagina < totalRegistros) Utilities.sleep(500);
    }

    if (todos.length === 0) { ui.alert("⚠️ Nenhum associado encontrado.", "", ui.ButtonSet.OK); return; }

    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var aba    = ss.getSheetByName(nomeAba) || ss.insertSheet(nomeAba);
    aba.clear();
    var campos = Object.keys(todos[0]);
    aba.getRange(1, 1, 1, campos.length).setValues([campos]);
    aba.getRange(1, 1, 1, campos.length).setBackground("#1a1a2e").setFontColor("#ffffff").setFontWeight("bold");
    var linhas = todos.map(function(reg) {
      return campos.map(function(c) {
        var v = reg[c];
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return v;
      });
    });
    aba.getRange(2, 1, linhas.length, campos.length).setValues(linhas);
    aba.setFrozenRows(1);
    campos.forEach(function(_, i) { aba.autoResizeColumn(i + 1); });

    ui.alert("✅ Extração concluída!", "Total: " + todos.length + " associados", ui.ButtonSet.OK);
  } catch(e) {
    ui.alert("❌ Erro", e.message, ui.ButtonSet.OK);
    Logger.log(e.stack);
  }
}

// ===================== EXTRAIR VEÍCULOS =====================
function extrairVeiculosAtivos() {
  var ui = getUI();
  try {
    autenticar();
    var todos          = [];
    var pagina         = 0;
    var totalRegistros = 1;

    while (pagina < totalRegistros) {
      var resultado = chamarAPI("/listar/veiculo", "post", {
        "codigo_situacao":      1,
        "inicio_paginacao":     pagina,
        "quantidade_por_pagina": 1000
      });
      if (!resultado || !resultado.veiculos || resultado.veiculos.length === 0) break;
      totalRegistros = parseInt(resultado.total_veiculos) || 0;
      todos = todos.concat(resultado.veiculos);
      pagina += 1000;
      if (pagina < totalRegistros) Utilities.sleep(500);
    }

    if (todos.length === 0) { ui.alert("⚠️ Nenhum veículo encontrado.", "", ui.ButtonSet.OK); return; }

    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var aba    = ss.getSheetByName("Veículos Ativos") || ss.insertSheet("Veículos Ativos");
    aba.clear();
    var campos = Object.keys(todos[0]);
    aba.getRange(1, 1, 1, campos.length).setValues([campos]);
    aba.getRange(1, 1, 1, campos.length).setBackground("#1a1a2e").setFontColor("#ffffff").setFontWeight("bold");
    var linhas = todos.map(function(reg) {
      return campos.map(function(c) {
        var v = reg[c];
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return v;
      });
    });
    aba.getRange(2, 1, linhas.length, campos.length).setValues(linhas);
    aba.setFrozenRows(1);
    campos.forEach(function(_, i) { aba.autoResizeColumn(i + 1); });

    ui.alert("✅ Veículos extraídos!", "Total: " + todos.length + " veículos", ui.ButtonSet.OK);
  } catch(e) {
    ui.alert("❌ Erro", e.message, ui.ButtonSet.OK);
    Logger.log(e.stack);
  }
}

// ===================== SITUAÇÕES E MOTIVOS =====================
function extrairSituacoesEMotivos() {
  var ui = getUI();
  try {
    autenticar();
    var situacoes = chamarAPI("/listar/situacao/todos", "get");
    var motivos   = chamarAPI("/listar/situacaomotivo/todos", "get");
    var ss        = SpreadsheetApp.getActiveSpreadsheet();

    var abaSit = ss.getSheetByName("Situações") || ss.insertSheet("Situações");
    abaSit.clear();
    if (Array.isArray(situacoes) && situacoes.length > 0) {
      var camposSit = Object.keys(situacoes[0]);
      abaSit.getRange(1, 1, 1, camposSit.length).setValues([camposSit]);
      abaSit.getRange(2, 1, situacoes.length, camposSit.length).setValues(
        situacoes.map(function(s) { return camposSit.map(function(c) { return s[c] || ""; }); })
      );
      abaSit.getRange(1, 1, 1, camposSit.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#fff");
    }

    var abaMot = ss.getSheetByName("Motivos Cancelamento") || ss.insertSheet("Motivos Cancelamento");
    abaMot.clear();
    if (Array.isArray(motivos) && motivos.length > 0) {
      var camposMot = Object.keys(motivos[0]);
      abaMot.getRange(1, 1, 1, camposMot.length).setValues([camposMot]);
      abaMot.getRange(2, 1, motivos.length, camposMot.length).setValues(
        motivos.map(function(m) { return camposMot.map(function(c) { return m[c] || ""; }); })
      );
      abaMot.getRange(1, 1, 1, camposMot.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#fff");
    }

    ui.alert("✅ Extraído!", "Abas 'Situações' e 'Motivos Cancelamento' criadas.", ui.ButtonSet.OK);
  } catch(e) {
    ui.alert("❌ Erro", e.message, ui.ButtonSet.OK);
    Logger.log(e.stack);
  }
}

// ===================== EXTRAIR ALTERAÇÕES 7 DIAS =====================
function extrairAlteracoes7dias() {
  var ui = getUI();
  try {
    autenticar();
    var hoje          = new Date();
    var seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
    var dataFinal     = Utilities.formatDate(hoje,          "America/Sao_Paulo", "dd/MM/yyyy");
    var dataInicial   = Utilities.formatDate(seteDiasAtras, "America/Sao_Paulo", "dd/MM/yyyy");

    var alteracoesAssoc = chamarAPI("/listar/alteracao-associados/", "post", {
      "data_inicial": dataInicial, "data_final": dataFinal, "campos": ["codigo_situacao"]
    });
    var alteracoesVeic = chamarAPI("/listar/alteracao-veiculos", "post", {
      "data_inicial": dataInicial, "data_final": dataFinal, "campos": ["codigo_situacao"]
    });

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (Array.isArray(alteracoesAssoc) && alteracoesAssoc.length > 0) {
      var abaAA    = ss.getSheetByName("Alterações Associados") || ss.insertSheet("Alterações Associados");
      abaAA.clear();
      var camposAA = Object.keys(alteracoesAssoc[0]);
      abaAA.getRange(1, 1, 1, camposAA.length).setValues([camposAA]);
      abaAA.getRange(2, 1, alteracoesAssoc.length, camposAA.length).setValues(
        alteracoesAssoc.map(function(r) { return camposAA.map(function(c) { return r[c] || ""; }); })
      );
      abaAA.getRange(1, 1, 1, camposAA.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#fff");
      abaAA.setFrozenRows(1);
    }

    if (Array.isArray(alteracoesVeic) && alteracoesVeic.length > 0) {
      var abaAV    = ss.getSheetByName("Alterações Veículos") || ss.insertSheet("Alterações Veículos");
      abaAV.clear();
      var camposAV = Object.keys(alteracoesVeic[0]);
      abaAV.getRange(1, 1, 1, camposAV.length).setValues([camposAV]);
      abaAV.getRange(2, 1, alteracoesVeic.length, camposAV.length).setValues(
        alteracoesVeic.map(function(r) { return camposAV.map(function(c) { return r[c] || ""; }); })
      );
      abaAV.getRange(1, 1, 1, camposAV.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#fff");
      abaAV.setFrozenRows(1);
    }

    ui.alert(
      "✅ Alterações extraídas!",
      "Período: " + dataInicial + " a " + dataFinal + "\n\n" +
      "Alterações de associados: " + (Array.isArray(alteracoesAssoc) ? alteracoesAssoc.length : 0) + "\n" +
      "Alterações de veículos: "   + (Array.isArray(alteracoesVeic)  ? alteracoesVeic.length  : 0),
      ui.ButtonSet.OK
    );
  } catch(e) {
    ui.alert("❌ Erro", e.message, ui.ButtonSet.OK);
    Logger.log(e.stack);
  }
}

// ===================== SNAPSHOT =====================
function _salvarSnapshotCore() {
  autenticar();
  var resumo = chamarAPI("/associado-ativo-inativo/listar", "get");
  if (!resumo) throw new Error("Falha ao buscar resumo da API");

  var veicResult    = chamarAPI("/listar/veiculo", "post", {
    "codigo_situacao": 1, "inicio_paginacao": 0, "quantidade_por_pagina": 1
  });
  var totalVeiculos = veicResult ? (parseInt(veicResult.total_veiculos) || 0) : 0;

  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName("Snapshots") || ss.insertSheet("Snapshots");

  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, 4).setValues([["Data", "Membros Ativos", "Inativos", "Veículos Ativos"]]);
    aba.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#fff");
    aba.setFrozenRows(1);
  }

  var dataHoje = Utilities.formatDate(new Date(), "America/Sao_Paulo", "yyyy-MM-dd");
  aba.getRange(aba.getLastRow() + 1, 1, 1, 4).setValues([[
    dataHoje,
    resumo.associados_ativos   || 0,
    resumo.associados_inativos || 0,
    totalVeiculos
  ]]);

  return {
    data:     dataHoje,
    ativos:   resumo.associados_ativos   || 0,
    inativos: resumo.associados_inativos || 0,
    veiculos: totalVeiculos
  };
}

function salvarSnapshot() {
  var ui = getUI();
  try {
    var r = _salvarSnapshotCore();
    ui.alert(
      "📸 Snapshot salvo!",
      "Data: " + r.data + "\nMembros ativos: " + r.ativos + "\nVeículos ativos: " + r.veiculos,
      ui.ButtonSet.OK
    );
  } catch(e) {
    ui.alert("❌ Erro", e.message, ui.ButtonSet.OK);
    Logger.log(e.stack);
  }
}

function snapshotFimMes() {
  var hoje  = new Date();
  var amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  if (amanha.getDate() !== 1) return;
  try {
    var r = _salvarSnapshotCore();
    Logger.log("Snapshot fim de mês: " + r.data + " | Membros: " + r.ativos + " | Veículos: " + r.veiculos);
  } catch(e) {
    Logger.log("Erro no snapshot de fim de mês: " + e.message + "\n" + e.stack);
  }
}

function agendarSnapshotFimMes() {
  var ui = getUI();
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "snapshotFimMes") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("snapshotFimMes").timeBased().everyDays(1).atHour(23).create();
  ui.alert("⏰ Agendado!", "Snapshot de fim de mês agendado (dispara às 23h — só grava no último dia do mês).", ui.ButtonSet.OK);
}

function agendarExtracaoDiaria() {
  var ui = getUI();
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("salvarSnapshot").timeBased().everyDays(1).atHour(6).create();
  ui.alert("⏰ Agendado!", "Snapshot diário agendado para 6h da manhã.", ui.ButtonSet.OK);
}

// ===================== BACKFILL DE SNAPSHOTS =====================
function backfillSnapshots() {
  var ui = getUI();
  try {
    autenticar();

    var resumo = chamarAPI("/associado-ativo-inativo/listar", "get");
    if (!resumo) throw new Error("Falha ao buscar resumo da API");
    var membrosHoje  = parseInt(resumo.associados_ativos || 0);

    var veicResult   = chamarAPI("/listar/veiculo", "post", {
      "codigo_situacao": 1, "inicio_paginacao": 0, "quantidade_por_pagina": 1
    });
    var veiculosHoje = veicResult ? (parseInt(veicResult.total_veiculos) || 0) : 0;
    var ratioVeic    = membrosHoje > 0 ? veiculosHoje / membrosHoje : 1;

    var hist = getHistoricoMensal();
    var pm   = (hist && hist.por_mes) ? hist.por_mes : [];
    if (pm.length < 2) throw new Error("Histórico mensal insuficiente (mínimo 2 meses)");

    var rows    = [];
    var curBase = membrosHoje;

    for (var i = pm.length - 1; i >= 0; i--) {
      var m       = pm[i];
      var novos   = m.novos         || 0;
      var cancels = m.cancelamentos || 0;
      var reat    = m.reativacoes   || 0;

      curBase = curBase - novos - reat + cancels;
      if (i === pm.length - 1) continue;

      var partes    = m.mes.split('-');
      var ano       = parseInt(partes[0]);
      var mes       = parseInt(partes[1]);
      var ultimoDia = new Date(ano, mes, 0).getDate();
      var dataFim   = m.mes + '-' + (ultimoDia < 10 ? '0' + ultimoDia : '' + ultimoDia);

      rows.push([dataFim, curBase, "—", Math.round(curBase * ratioVeic)]);
    }

    rows.reverse();

    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var aba = ss.getSheetByName("Snapshots") || ss.insertSheet("Snapshots");

    if (aba.getLastRow() === 0) {
      aba.getRange(1, 1, 1, 4).setValues([["Data", "Membros Ativos", "Inativos", "Veículos Ativos"]]);
      aba.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#fff");
      aba.setFrozenRows(1);
    }

    var existentes = {};
    if (aba.getLastRow() > 1) {
      aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues()
        .forEach(function(r) { if (r[0]) existentes[String(r[0])] = true; });
    }

    var paraInserir = rows.filter(function(r) { return !existentes[r[0]]; });

    if (paraInserir.length === 0) {
      ui.alert("ℹ️ Sem dados novos", "Todos os meses já estão na aba Snapshots.", ui.ButtonSet.OK);
      return;
    }

    aba.getRange(aba.getLastRow() + 1, 1, paraInserir.length, 4).setValues(paraInserir);

    ui.alert(
      "✅ Backfill concluído!",
      paraInserir.length + " meses inseridos na aba Snapshots.\n\n" +
      "Membros: reconstrução exata via historico_mensal.\n" +
      "Veículos: estimados pelo ratio atual (" + ratioVeic.toFixed(3) + " veíc/membro).\n" +
      "Inativos: não reconstruível — preenchido como '—'.",
      ui.ButtonSet.OK
    );
  } catch(e) {
    ui.alert("❌ Erro no backfill", e.message, ui.ButtonSet.OK);
    Logger.log(e.stack);
  }
}

// ===================== DIAGNÓSTICO DE MOTIVOS =====================
function diagnosticarMotivoCancelamento() {
  var ui = getUI();

  var cancelamentosRecentes = [
    { codigo: 17423, cpf: "11320562418", nome: "JONAS RODRIGO DA SILVA",          data: "2026-06-02" },
    { codigo: 11231, cpf: "26280086615", nome: "MARCO ANTONIO DE ALMEIDA",         data: "2026-06-03" },
    { codigo: 16587, cpf: "13732045676", nome: "ICARO AUGUSTO ANDRADE DE ALMEIDA", data: "2026-06-05" },
    { codigo: 15444, cpf: "4907212658",  nome: "ANTONIEL DAMASCENO GOMES",         data: "2026-06-06" },
    { codigo: 16429, cpf: "9638675632",  nome: "WEMERSON MARTINS TONELO",          data: "2026-06-08" }
  ];

  try {
    autenticar();
  } catch(e) {
    ui.alert("❌ Falha na autenticação", e.message, ui.ButtonSet.OK);
    return;
  }

  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName("Diagnóstico Motivos") || ss.insertSheet("Diagnóstico Motivos");
  aba.clear();

  var cabecalho = [
    "codigo_associado", "nome", "data_cancelamento",
    "qtd_atendimentos", "atend_mais_proximo_data", "titulo_atendimento",
    "descricao_atendimento", "tipo_atendimento", "status_atendimento",
    "departamento", "usuario_atendimento", "cpf_usado"
  ];
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
  aba.getRange(1, 1, 1, cabecalho.length).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#fff");

  var linhas    = [];
  var relatorio = "=== DIAGNÓSTICO MOTIVO CANCELAMENTO ===\n\n";

  cancelamentosRecentes.forEach(function(assoc) {
    relatorio += "─────────────────────────────────────\n";
    relatorio += "Associado: " + assoc.nome + " (cod: " + assoc.codigo + ")\n";
    relatorio += "Cancelamento: " + assoc.data + "\n";

    var resultado = null;
    var cpfUsado  = assoc.cpf;

    try {
      resultado = chamarAPIRaw("/buscar/historico-atendimento-associado/" + assoc.cpf);
    } catch(e) {
      relatorio += "  ⚠️ Erro buscando por CPF: " + e.message + "\n";
    }

    if (!resultado || resultado.erro) {
      try {
        resultado = chamarAPIRaw("/buscar/historico-atendimento-associado/" + assoc.codigo);
        cpfUsado  = "codigo:" + assoc.codigo;
      } catch(e) {
        relatorio += "  ⚠️ Erro buscando por código: " + e.message + "\n";
      }
    }

    if (!resultado) {
      relatorio += "  ❌ Nenhum retorno da API\n\n";
      linhas.push([assoc.codigo, assoc.nome, assoc.data, "ERRO API", "", "", "", "", "", "", "", cpfUsado]);
      return;
    }

    if (resultado.erro) {
      relatorio += "  ❌ API retornou erro: " + JSON.stringify(resultado) + "\n\n";
      linhas.push([assoc.codigo, assoc.nome, assoc.data, "ERRO: " + JSON.stringify(resultado), "", "", "", "", "", "", "", cpfUsado]);
      return;
    }

    var historico = resultado.historico_atendimento || [];
    relatorio += "  Total de atendimentos encontrados: " + historico.length + "\n";

    if (historico.length === 0) {
      relatorio += "  ℹ️ Nenhum atendimento registrado para este associado.\n\n";
      linhas.push([assoc.codigo, assoc.nome, assoc.data, 0, "", "", "", "", "", "", "", cpfUsado]);
      return;
    }

    var dataCancel = new Date(assoc.data);
    var melhor     = null;
    var menorDiff  = Infinity;

    historico.forEach(function(h) {
      var dtAtend = new Date(h.data_cadastro || "");
      if (!isNaN(dtAtend)) {
        var diff = Math.abs(dtAtend - dataCancel);
        if (diff < menorDiff) { menorDiff = diff; melhor = h; }
      }
    });

    historico.forEach(function(h, idx) {
      relatorio += "  [" + (idx + 1) + "] " +
        (h.data_cadastro || "sem data") + " | " +
        (h.titulo || "sem título") + " | " +
        (h.descricao || "sem descrição").substring(0, 80) + " | " +
        "tipo: "   + (h.descricao_tipo_atendimento  || h.codigo_tipo_atendimento  || "?") + " | " +
        "status: " + (h.descricao_status_atendimento || "?") + " | " +
        "dept: "   + (h.descricao_departamento       || "?") + " | " +
        "user: "   + (h.nome_usuario                 || "?") + "\n";
    });

    if (melhor) {
      relatorio += "  ★ Mais próximo do cancelamento: [" + melhor.data_cadastro + "] " + (melhor.titulo || "") + "\n";
    }
    relatorio += "\n";

    linhas.push([
      assoc.codigo,
      assoc.nome,
      assoc.data,
      historico.length,
      melhor ? (melhor.data_cadastro || "") : "",
      melhor ? (melhor.titulo        || "") : "",
      melhor ? ((melhor.descricao    || "").substring(0, 200)) : "",
      melhor ? (melhor.descricao_tipo_atendimento  || melhor.codigo_tipo_atendimento  || "") : "",
      melhor ? (melhor.descricao_status_atendimento || "") : "",
      melhor ? (melhor.descricao_departamento       || "") : "",
      melhor ? (melhor.nome_usuario                 || "") : "",
      cpfUsado
    ]);

    Utilities.sleep(400);
  });

  if (linhas.length > 0) {
    aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
  }
  aba.setFrozenRows(1);
  for (var c = 1; c <= cabecalho.length; c++) aba.autoResizeColumn(c);

  var abaLog = ss.getSheetByName("Log Diagnóstico") || ss.insertSheet("Log Diagnóstico");
  abaLog.clear();
  abaLog.getRange(1, 1).setValue(relatorio);
  abaLog.autoResizeColumn(1);

  Logger.log(relatorio);
  ui.alert(
    "✅ Diagnóstico concluído",
    "Resultados gravados nas abas:\n" +
    "• 'Diagnóstico Motivos' — tabela resumo\n" +
    "• 'Log Diagnóstico' — relatório completo\n\n" +
    "Verifique se os atendimentos próximos ao cancelamento\n" +
    "contêm o motivo nos campos título/descrição.",
    ui.ButtonSet.OK
  );
}

// ===================== FUNÇÕES DE DIAGNÓSTICO =====================
function mapearSituacoes() {
  var ui = getUI();
  autenticar();
  var resultado = "";
  for (var cod = 1; cod <= 40; cod++) {
    var r = chamarAPI("/listar/associado", "post", {
      "codigo_situacao": cod, "inicio_paginacao": 0, "quantidade_por_pagina": 1
    });
    if (r && r.total_associados && parseInt(r.total_associados) > 0) {
      resultado += "Código " + cod + " → " + r.total_associados + " associados\n";
    }
    Utilities.sleep(300);
  }
  ui.alert("Mapa de situações", resultado, ui.ButtonSet.OK);
}

function testarPermissoes() {
  var ui = getUI();
  autenticar();
  var r1 = chamarAPI("/listar/situacao/todos", "get");
  var r2 = chamarAPI("/listar/situacaomotivo/todos", "get");
  Logger.log("876 Situações: " + (r1 ? "✅ LIBERADA" : "❌ BLOQUEADA"));
  Logger.log("401 Motivos: "   + (r2 ? "✅ LIBERADA" : "❌ BLOQUEADA"));
  ui.alert(
    "Permissões",
    "876 Situações: " + (r1 ? "✅ LIBERADA" : "❌ BLOQUEADA") + "\n" +
    "401 Motivos: "   + (r2 ? "✅ LIBERADA" : "❌ BLOQUEADA"),
    ui.ButtonSet.OK
  );
}

function testarEndpointsFinanceiros() {
  var ui = getUI();
  autenticar();
  var endpoints = [
    "/listar/inadimplente", "/inadimplente/listar", "/financeiro/listar",
    "/listar/financeiro", "/cobranca/listar", "/listar/cobranca",
    "/listar/pagamento", "/pagamento/listar", "/listar/mensalidade",
    "/mensalidade/listar", "/listar/boleto", "/boleto/listar",
    "/associado/inadimplente/listar", "/listar/associado/inadimplente",
    "/financeiro/inadimplente/listar"
  ];
  var resultados = [];
  endpoints.forEach(function(path) {
    try {
      var r = chamarAPI(path, "get");
      resultados.push(path + " → " + (r ? "✅ EXISTE" : "❌ null"));
    } catch(e) {
      resultados.push(path + " → ERRO");
    }
    Utilities.sleep(300);
  });
  ui.alert("Endpoints Financeiros", resultados.join("\n"), ui.ButtonSet.OK);
}

function testarRotas876e401() {
  var ui = getUI();
  autenticar();
  var r876a = chamarAPI("/listar/situacao/todos", "get");
  var r401a = chamarAPI("/listar/situacaomotivo/todos", "get");
  var msg =
    "=== ROTA 876 — Situações ===\n" +
    "/listar/situacao/todos: " + (r876a ? "✅ " + JSON.stringify(r876a).substring(0, 100) : "❌") + "\n\n" +
    "=== ROTA 401 — Motivos ===\n" +
    "/listar/situacaomotivo/todos: " + (r401a ? "✅ " + JSON.stringify(r401a).substring(0, 100) : "❌");
  ui.alert("Teste Rotas 876/401", msg, ui.ButtonSet.OK);
}

function testarInadimplencia() {
  autenticar();
  var hoje      = new Date();
  Logger.log("Hoje: dia " + hoje.getDate());
  var resultado = chamarAPI("/listar/associado", "post", {
    "codigo_situacao": 1, "inicio_paginacao": 0, "quantidade_por_pagina": 5
  });
  if (resultado && resultado.associados) {
    resultado.associados.forEach(function(a) {
      Logger.log("Nome: " + a.nome + " | dia_vencimento: " + a.dia_vencimento);
    });
  }
}

function testarContagemPlacas() {
  autenticar();
  var v1 = chamarAPI("/listar/veiculo", "post", {
    "codigo_situacao": 1, "inicio_paginacao": 0, "quantidade_por_pagina": 1
  });
  Logger.log("total_veiculos (sem filtro): " + v1.total_veiculos);

  var v2 = chamarAPI("/listar/veiculo", "post", {
    "codigo_situacao": 1, "codigo_situacao_associado": 1,
    "inicio_paginacao": 0, "quantidade_por_pagina": 1
  });
  Logger.log("total_veiculos (assoc ativo): " + v2.total_veiculos);

  var v3 = chamarAPI("/listar-por-permissao/veiculo", "post", {
    "codigo_situacao": 1, "inicio_paginacao": 0, "quantidade_por_pagina": 1
  });
  Logger.log("total_veiculos (por permissao): " + (v3 ? v3.total_veiculos : "null"));
}

// ============================================================
// doGet — API JSON PARA O DASHBOARD
// ============================================================

var SITUACOES_MAP = {
  "1": "ATIVO",
  "2": "INATIVO",
  "3": "PENDENTE",
  "4": "NEGADO"
};

function doGet(e) {
  var acao      = (e && e.parameter && e.parameter.acao) ? e.parameter.acao : "resumo";
  var resultado;

  try {
    switch (acao) {
      case "resumo":                resultado = getResumo();                break;
      case "associados":
        var situacao = e.parameter.situacao || "1";
        resultado = getAssociados(situacao);
        break;
      case "veiculos":              resultado = getVeiculos();              break;
      case "alteracoes":            resultado = getAlteracoes();            break;
      case "snapshots":             resultado = getSnapshots();             break;
      case "zona_churn":            resultado = getZonaChurn();             break;
      case "panorama":              resultado = getPanorama();              break;
      case "analise_cancelamentos": resultado = getAnaliseCancelamentos();  break;
      case "historico_mensal":      resultado = getHistoricoMensal();       break;
      case "analise_churn":         resultado = getAnaliseChurn();          break;
      case "novos_contratos":       resultado = getNovosContratosMes();     break;
      default: resultado = { erro: "Acao nao reconhecida: " + acao };
    }
  } catch(err) {
    resultado = { erro: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================== PANORAMA GERAL =====================
function getPanorama() {
  autenticar();

  var resumoAPI      = chamarAPI("/associado-ativo-inativo/listar", "get");
  var novosContratos = chamarAPI("/associado/novos-contratos/listar", "get");
  var snapshots      = getSnapshots();
  var alteracoes     = getAlteracoes();

  var cancelamentos7d        = 0;
  var reativacoes7d          = 0;
  var cancelamentosVeiculo7d = 0;
  var seteDiasAtras          = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);

  if (Array.isArray(alteracoes.associados)) {
    alteracoes.associados.forEach(function(a) {
      if (a.nome_campo_tabela === "codigo_situacao") {
        var dt = new Date(a.data_alteracao);
        if (dt >= seteDiasAtras) {
          if (String(a.valor_posterior) === "2") cancelamentos7d++;
          if (String(a.valor_anterior) === "2" && String(a.valor_posterior) === "1") reativacoes7d++;
        }
      }
    });
  }

  if (Array.isArray(alteracoes.veiculos)) {
    alteracoes.veiculos.forEach(function(v) {
      if (v.nome_campo_tabela === "codigo_situacao") {
        var dt = new Date(v.data_alteracao);
        if (dt >= seteDiasAtras && String(v.valor_anterior) === "1" && String(v.valor_posterior) === "2") {
          cancelamentosVeiculo7d++;
        }
      }
    });
  }

  var ativos   = resumoAPI ? parseInt(resumoAPI.associados_ativos   || 0) : 0;
  var inativos = resumoAPI ? parseInt(resumoAPI.associados_inativos || 0) : 0;

  var veicResult     = chamarAPI("/listar/veiculo", "post", {
    "codigo_situacao": 1, "inicio_paginacao": 0, "quantidade_por_pagina": 1
  });
  var veiculosAtivos = veicResult ? (parseInt(veicResult.total_veiculos) || 0) : 0;

  return {
    timestamp:                 new Date().toISOString(),
    base_ativa:                ativos,
    base_inativa:              inativos,
    base_total:                ativos + inativos,
    veiculos_ativos:           veiculosAtivos,
    novos_contratos_hoje:      novosContratos ? parseInt(novosContratos.quantidade_contratos || 0) : 0,
    cancelamentos_7d:          cancelamentos7d,
    reativacoes_7d:            reativacoes7d,
    cancelamentos_veiculo_7d:  cancelamentosVeiculo7d,
    saldo_liquido_7d:          reativacoes7d - cancelamentos7d,
    churn_rate_estimado:       ativos > 0 ? ((cancelamentos7d / 7 * 30) / ativos * 100).toFixed(2) + "%" : "N/A",
    snapshots:                 snapshots,
    situacoes_map:             SITUACOES_MAP
  };
}

// ===================== RESUMO =====================
function getResumo() {
  autenticar();
  var resumo = chamarAPI("/associado-ativo-inativo/listar", "get");
  return {
    timestamp:           new Date().toISOString(),
    associados_ativos:   resumo ? resumo.associados_ativos   : 0,
    associados_inativos: resumo ? resumo.associados_inativos : 0,
    situacoes_map:       SITUACOES_MAP
  };
}

// ===================== ZONA DE CHURN — COM CACHE 30min =====================
function getZonaChurn() {
  var cache = CacheService.getScriptCache();

  var nChunks = cache.get('zona_churn_chunks');
  if (nChunks) {
    try {
      var json = '';
      for (var c = 0; c < parseInt(nChunks); c++) { json += cache.get('zona_churn_chunk_' + c) || ''; }
      if (json) return JSON.parse(json);
    } catch(e) {}
  } else {
    var cached = cache.get('zona_churn_completo');
    if (cached) { try { return JSON.parse(cached); } catch(e) {} }
  }

  autenticar();
  var hoje    = new Date();
  var diaHoje = hoje.getDate();

  var inadimplentes            = [];
  var cancelamentosSolicitados = [];
  var pagina                   = 0;
  var totalRegistros           = 1;

  while (pagina < totalRegistros) {
    var resultado = chamarAPI("/listar/associado", "post", {
      "codigo_situacao":      1,
      "inicio_paginacao":     pagina,
      "quantidade_por_pagina": 1000
    });
    if (!resultado || !resultado.associados || resultado.associados.length === 0) break;
    totalRegistros = parseInt(resultado.total_associados) || 0;

    resultado.associados.forEach(function(assoc) {
      var diaVenc         = parseInt(assoc.dia_vencimento) || 10;
      var vencMesAtual    = new Date(hoje.getFullYear(), hoje.getMonth(),     diaVenc);
      var vencMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, diaVenc);
      var dataVenc        = vencMesAtual <= hoje ? vencMesAtual : vencMesAnterior;
      var diasAtraso      = Math.floor((hoje - dataVenc) / (1000 * 60 * 60 * 24));
      var DIAS_CHURN      = 30;
      var diasParaChurn   = Math.max(0, DIAS_CHURN - diasAtraso);

      var dataAdesao = assoc.data_contrato_associado && assoc.data_contrato_associado !== "0000-00-00"
        ? assoc.data_contrato_associado
        : (assoc.data_cadastro_associado || "");
      var diasAssociado = "";
      if (dataAdesao) {
        try {
          var dtAd = new Date(dataAdesao);
          if (!isNaN(dtAd)) diasAssociado = Math.floor((hoje - dtAd) / (1000 * 60 * 60 * 24));
        } catch(e) {}
      }

      if (diasAtraso > 5 && diasAtraso <= 40) {
        inadimplentes.push({
          codigo_associado:   assoc.codigo_associado,
          nome:               assoc.nome,
          cpf:                assoc.cpf,
          telefone_celular:   (assoc.ddd_celular || "") + (assoc.telefone_celular || ""),
          email:              assoc.email || "",
          dia_vencimento:     diaVenc,
          dias_atraso:        diasAtraso,
          dias_para_churn:    diasParaChurn,
          status_churn:       diasParaChurn <= 5 ? "CHURN_IMINENTE" : "EM_RISCO",
          codigo_regional:    assoc.codigo_regional    || "",
          codigo_cooperativa: assoc.codigo_cooperativa || "",
          data_adesao:        dataAdesao,
          dias_associado:     diasAssociado
        });
      }
    });

    pagina += 1000;
    if (pagina < totalRegistros) Utilities.sleep(300);
  }

  var inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  var dataInicial  = Utilities.formatDate(inicioJanela, "America/Sao_Paulo", "dd/MM/yyyy");
  var dataFinal    = Utilities.formatDate(hoje,         "America/Sao_Paulo", "dd/MM/yyyy");

  var alteracoesAssoc = chamarAPI("/listar/alteracao-associados/", "post", {
    "data_inicial": dataInicial,
    "data_final":   dataFinal,
    "campos":       ["codigo_situacao"]
  });

  var reativacoesRecentes = [];
  if (Array.isArray(alteracoesAssoc)) {
    alteracoesAssoc.forEach(function(a) {
      if (String(a.valor_posterior) === "2" && String(a.valor_anterior) === "1") {
        cancelamentosSolicitados.push({
          codigo_associado:  a.codigo_associado,
          nome:              a.nome_associado || "",
          cpf:               a.cpf_associado  || "",
          data_alteracao:    a.data_alteracao,
          usuario_alteracao: a.nome_usuario_alteracao || "",
          status_anterior:   SITUACOES_MAP[String(a.valor_anterior)]  || a.valor_anterior,
          status_novo:       SITUACOES_MAP[String(a.valor_posterior)] || a.valor_posterior
        });
      }
      if (String(a.valor_anterior) === "2" && String(a.valor_posterior) === "1") {
        reativacoesRecentes.push({
          codigo_associado:  a.codigo_associado,
          nome:              a.nome_associado || "",
          cpf:               a.cpf_associado  || "",
          data_reativacao:   a.data_alteracao,
          usuario_alteracao: a.nome_usuario_alteracao || "",
          telefone_celular:  "",
          placas:            []
        });
      }
    });
  }

  // Busca placas e telefone via GET /associado/buscar/:codigo/codigo
  var codsVistos = {};
  reativacoesRecentes.forEach(function(r) {
    var cod = String(r.codigo_associado || "");
    if (!cod || codsVistos[cod]) return;
    codsVistos[cod] = true;
    try {
      var resA = chamarAPI("/associado/buscar/" + cod + "/codigo", "get", null);
      Logger.log("buscar associado " + cod + " → " + JSON.stringify(resA).substring(0, 200));
      if (resA) {
        var placas = [];
        if (Array.isArray(resA.veiculos)) {
          placas = resA.veiculos
            .map(function(v) { return String(v.placa || "").trim(); })
            .filter(function(p) { return p.length > 0; });
        }
        var ddd  = String(resA.ddd_celular || resA.ddd || "").trim();
        var tel  = String(resA.telefone_celular || resA.telefone_fixo || resA.telefone || "").trim();
        var fone = ddd && tel ? "(" + ddd + ") " + tel : tel;
        reativacoesRecentes.forEach(function(x) {
          if (String(x.codigo_associado) === cod) {
            x.placas           = placas;
            x.telefone_celular = fone;
          }
        });
      }
    } catch(e) {
      Logger.log("Erro ao buscar associado " + cod + ": " + e.message);
    }
    Utilities.sleep(200);
  });

  inadimplentes.sort(function(a, b) { return a.dias_para_churn - b.dias_para_churn; });

  var resultado = {
    timestamp:                       new Date().toISOString(),
    dia_referencia:                  diaHoje,
    total_inadimplentes:             inadimplentes.length,
    total_cancelamentos_solicitados: cancelamentosSolicitados.length,
    total_reativacoes_recentes:      reativacoesRecentes.length,
    total_zona_churn:                inadimplentes.length + cancelamentosSolicitados.length,
    inadimplentes:                   inadimplentes,
    cancelamentos_solicitados:       cancelamentosSolicitados,
    reativacoes_recentes:            reativacoesRecentes,
    meta_recuperacao: {
      total_em_risco: inadimplentes.length + cancelamentosSolicitados.length,
      recuperados:    0,
      percentual:     "0%"
    }
  };

  try {
    var payload    = JSON.stringify(resultado);
    var CHUNK_SIZE = 90000;
    if (payload.length <= CHUNK_SIZE) {
      cache.put('zona_churn_completo', payload, 1800);
      cache.remove('zona_churn_chunks');
    } else {
      var totalChunks = Math.ceil(payload.length / CHUNK_SIZE);
      for (var k = 0; k < totalChunks; k++) {
        cache.put('zona_churn_chunk_' + k, payload.substring(k * CHUNK_SIZE, (k + 1) * CHUNK_SIZE), 1800);
      }
      cache.put('zona_churn_chunks', String(totalChunks), 1800);
      cache.remove('zona_churn_completo');
    }
  } catch(e) {
    Logger.log('Cache zona_churn write error: ' + e.message);
  }

  return resultado;
}

function diagnosticarPlacasReativacao() {
  if (!TOKEN_USUARIO) autenticar();

  // 1. Busca as alterações do mês para pegar um codigo_associado real
  var hoje         = new Date();
  var inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  var dataInicial  = Utilities.formatDate(inicioJanela, "America/Sao_Paulo", "dd/MM/yyyy");
  var dataFinal    = Utilities.formatDate(hoje,         "America/Sao_Paulo", "dd/MM/yyyy");

  var alteracoes = chamarAPI("/listar/alteracao-associados/", "post", {
    "data_inicial": dataInicial,
    "data_final":   dataFinal,
    "campos":       ["codigo_situacao"]
  });

  Logger.log("alteracoesAssoc retornou: " + (Array.isArray(alteracoes) ? alteracoes.length + " registros" : JSON.stringify(alteracoes).substring(0,200)));

  var reativacoes = [];
  if (Array.isArray(alteracoes)) {
    alteracoes.forEach(function(a) {
      if (String(a.valor_anterior) === "2" && String(a.valor_posterior) === "1") {
        reativacoes.push(a);
      }
    });
  }
  Logger.log("Reativações encontradas: " + reativacoes.length);

  if (reativacoes.length === 0) {
    Logger.log("Nenhuma reativação encontrada no período.");
    return;
  }

  // 2. Testa o endpoint para os 3 primeiros associados reativados
  var testCods = reativacoes.slice(0, 3);
  testCods.forEach(function(a) {
    var cod = String(a.codigo_associado || "");
    Logger.log("\n--- Testando associado " + cod + " (" + a.nome_associado + ") ---");

    // Testa GET /associado/buscar/:codigo/codigo
    var options = {
      method: "get",
      headers: {
        "Authorization": "Bearer " + TOKEN_USUARIO,
        "Content-Type":  "application/json"
      },
      muteHttpExceptions: true
    };
    var resp = UrlFetchApp.fetch(BASE_URL + "/associado/buscar/" + cod + "/codigo", options);
    Logger.log("GET /associado/buscar/" + cod + "/codigo → HTTP " + resp.getResponseCode());
    Logger.log("Body: " + resp.getContentText().substring(0, 500));
  });
}

function invalidarCacheZonaChurn() {
  var cache = CacheService.getScriptCache();
  cache.remove('zona_churn_completo');
  cache.remove('zona_churn_chunks');
  for (var i = 0; i < 20; i++) cache.remove('zona_churn_chunk_' + i);
  Logger.log('✅ Cache de zona_churn invalidado.');
  try { SpreadsheetApp.getUi().alert("✅ Cache zona_churn invalidado.", "", SpreadsheetApp.getUi().ButtonSet.OK); } catch(e) {}
}

// ===================== ALTERAÇÕES — 365 DIAS COM CACHE =====================
function getAlteracoes() {
  var cache = CacheService.getScriptCache();

  var nChunks = cache.get('alteracoes_chunks');
  if (nChunks) {
    try {
      var json = '';
      for (var c = 0; c < parseInt(nChunks); c++) { json += cache.get('alteracoes_chunk_' + c) || ''; }
      if (json) return JSON.parse(json);
    } catch(e) {}
  } else {
    var cached = cache.get('alteracoes_completo');
    if (cached) { try { return JSON.parse(cached); } catch(e) {} }
  }

  autenticar();

  var hoje         = new Date();
  var JANELA_DIAS  = 365;
  var todoAssoc    = [];
  var todoVeic     = [];
  var totalJanelas = Math.ceil(JANELA_DIAS / 7);

  for (var i = 0; i < totalJanelas; i++) {
    var dataFim = new Date(hoje.getTime() - i       * 7 * 24 * 60 * 60 * 1000);
    var dataIni = new Date(hoje.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    var dFim    = Utilities.formatDate(dataFim, "America/Sao_Paulo", "dd/MM/yyyy");
    var dIni    = Utilities.formatDate(dataIni, "America/Sao_Paulo", "dd/MM/yyyy");

    var resAssoc = chamarAPI("/listar/alteracao-associados/", "post", {
      "data_inicial": dIni, "data_final": dFim, "campos": ["codigo_situacao"]
    });
    if (Array.isArray(resAssoc)) todoAssoc = todoAssoc.concat(resAssoc);

    var resVeic = chamarAPI("/listar/alteracao-veiculos", "post", {
      "data_inicial": dIni, "data_final": dFim, "campos": ["codigo_situacao"]
    });
    if (Array.isArray(resVeic)) todoVeic = todoVeic.concat(resVeic);

    Utilities.sleep(300);
  }

  function deduplicar(arr) {
    var vistos = {};
    return arr.filter(function(item) {
      var chave = String(item.codigo_alteracao || item.data_alteracao + "_" + item.codigo_associado);
      if (vistos[chave]) return false;
      vistos[chave] = true;
      return true;
    });
  }

  todoAssoc = deduplicar(todoAssoc);
  todoVeic  = deduplicar(todoVeic);

  var dataFimStr = Utilities.formatDate(hoje, "America/Sao_Paulo", "dd/MM/yyyy");
  var dataIniStr = Utilities.formatDate(
    new Date(hoje.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000),
    "America/Sao_Paulo", "dd/MM/yyyy"
  );

  var resultado = {
    timestamp:        new Date().toISOString(),
    periodo:          dataIniStr + " a " + dataFimStr,
    associados:       todoAssoc,
    veiculos:         todoVeic,
    total_alteracoes: todoAssoc.length + todoVeic.length
  };

  try {
    var payload    = JSON.stringify(resultado);
    var CHUNK_SIZE = 90000;
    if (payload.length <= CHUNK_SIZE) {
      cache.put('alteracoes_completo', payload, 3600);
      cache.remove('alteracoes_chunks');
    } else {
      var totalChunks = Math.ceil(payload.length / CHUNK_SIZE);
      for (var k = 0; k < totalChunks; k++) {
        cache.put('alteracoes_chunk_' + k, payload.substring(k * CHUNK_SIZE, (k + 1) * CHUNK_SIZE), 3600);
      }
      cache.put('alteracoes_chunks', String(totalChunks), 3600);
      cache.remove('alteracoes_completo');
    }
  } catch(e) {
    Logger.log('Cache write error: ' + e.message);
  }

  return resultado;
}

function invalidarCacheAlteracoes() {
  var cache = CacheService.getScriptCache();
  cache.remove('alteracoes_completo');
  cache.remove('alteracoes_chunks');
  for (var i = 0; i < 20; i++) cache.remove('alteracoes_chunk_' + i);
  Logger.log('✅ Cache de alterações invalidado.');
  try { SpreadsheetApp.getUi().alert("✅ Cache invalidado.", "Próxima chamada buscará dados frescos.", SpreadsheetApp.getUi().ButtonSet.OK); } catch(e) {}
}

// ===================== ANÁLISE CANCELAMENTOS =====================
function getAnaliseCancelamentos() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName("Historico Cancelamentos");
  if (!aba || aba.getLastRow() < 2) return { erro: "Histórico não encontrado. Execute 'Reconstruir Histórico' no menu.", dados: [] };

  var header = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var iDias  = header.indexOf("dias_ate_cancelamento");
  var iMes   = header.indexOf("mes_cancelamento");
  var iData  = header.indexOf("data_cancelamento");
  var dados  = aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getValues();

  var porMes = {};
  dados.forEach(function(row) {
    var dias = row[iDias];
    var mes  = iMes !== -1 ? String(row[iMes]) : "";
    if (!mes && iData !== -1 && row[iData]) {
      try {
        var d = new Date(row[iData]);
        if (!isNaN(d)) mes = Utilities.formatDate(d, "America/Sao_Paulo", "yyyy-MM");
      } catch(e) {}
    }
    if (!mes) return;
    if (!porMes[mes]) porMes[mes] = { mes: mes, total: 0, ate60: 0, ate90: 0 };
    porMes[mes].total++;
    if (dias !== "" && dias !== null) {
      var n = parseInt(dias);
      if (!isNaN(n) && n >= 0) {
        if (n <= 60) porMes[mes].ate60++;
        if (n <= 90) porMes[mes].ate90++;
      }
    }
  });

  return {
    timestamp:       new Date().toISOString(),
    total_registros: dados.length,
    por_mes:         Object.values(porMes).sort(function(a, b) { return a.mes.localeCompare(b.mes); })
  };
}

// ===================== ASSOCIADOS / VEÍCULOS (Sheets) =====================
function getAssociados(codigoSituacao) {
  return lerAba(String(codigoSituacao) === "1" ? "Associados Ativos" : "Associados Inativos");
}

function getVeiculos() {
  return lerAba("Veiculos Ativos");
}

// ===================== SNAPSHOTS =====================
function getSnapshots() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName("Snapshots");
  if (!aba || aba.getLastRow() < 2) return [];

  var header = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var dados  = aba.getRange(2, 1, aba.getLastRow() - 1, aba.getLastColumn()).getValues();

  return dados.map(function(linha) {
    var obj = {};
    header.forEach(function(col, i) { obj[col] = linha[i]; });
    return obj;
  });
}

// ===================== UTILITÁRIO: LER ABA =====================
function lerAba(nomeAba) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(nomeAba);
  if (!aba || aba.getLastRow() < 2) return { erro: "Aba '" + nomeAba + "' vazia ou nao encontrada", dados: [] };

  var header    = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var dados     = aba.getRange(2, 1, Math.min(aba.getLastRow() - 1, 5000), aba.getLastColumn()).getValues();
  var registros = dados.map(function(linha) {
    var obj = {};
    header.forEach(function(col, i) { obj[col] = linha[i]; });
    return obj;
  });

  return { total: registros.length, aba: nomeAba, dados: registros };
}

// ===================== NOVOS CONTRATOS VIA POWER CRM =====================
function getNovosContratosPorMes() {
  var cache  = CacheService.getScriptCache();
  var cached = cache.get('power_crm_novos');
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  var porMes = {};
  var hoje   = new Date();

  for (var i = 11; i >= 0; i--) {
    var d      = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    var ano    = d.getFullYear();
    var mesNum = d.getMonth() + 1;
    var mesStr = ano + '-' + (mesNum < 10 ? '0' + mesNum : mesNum);
    var ultimo = new Date(ano, mesNum, 0).getDate();
    var from   = mesStr + '-01';
    var to     = mesStr + '-' + (ultimo < 10 ? '0' + ultimo : ultimo);

    try {
      var resp = UrlFetchApp.fetch(POWER_CRM_URL + '/api/report/db', {
        method:  'POST',
        headers: {
          'Authorization': 'Bearer ' + POWER_CRM_TOKEN,
          'Content-Type':  'application/json',
          'Accept':        'application/json'
        },
        payload:            JSON.stringify({ from: from, to: to, stringFilterTypeDate: 3 }),
        muteHttpExceptions: true
      });

      if (resp.getResponseCode() !== 200) {
        Logger.log('PowerCRM ' + mesStr + ': HTTP ' + resp.getResponseCode());
        porMes[mesStr] = 0;
        Utilities.sleep(400);
        continue;
      }

      var data  = JSON.parse(resp.getContentText());
      var lista = Array.isArray(data) ? data
        : (data.data || data.content || data.result || data.records || data.items || []);

      var count = 0;
      lista.forEach(function(row) {
        var status    = parseInt(row.cardStatus) || 0;
        var arquivado = row.isShelved === true || row.isShelved === 1
                     || String(row.isShelved).toUpperCase() === 'TRUE';
        if (status === 5 && !arquivado) count++;
      });

      porMes[mesStr] = count;
      Logger.log('PowerCRM ' + mesStr + ': ' + count + ' vendas');
    } catch(e) {
      Logger.log('PowerCRM erro ' + mesStr + ': ' + e.message);
      porMes[mesStr] = 0;
    }
    Utilities.sleep(400);
  }

  try { cache.put('power_crm_novos', JSON.stringify(porMes), 3600); } catch(e) {}
  return porMes;
}

// ===================== NOVOS CONTRATOS DO MÊS — REGISTROS INDIVIDUAIS =====================
function getNovosContratosMes() {
  var hoje   = new Date();
  var mesNum = hoje.getMonth() + 1;
  var mesStr = hoje.getFullYear() + '-' + (mesNum < 10 ? '0' + mesNum : mesNum);
  var from   = mesStr + '-01';
  var to     = Utilities.formatDate(hoje, 'America/Sao_Paulo', 'yyyy-MM-dd');

  var cache    = CacheService.getScriptCache();
  var cacheKey = 'novos_contratos_mes_' + mesStr;
  var cached   = cache.get(cacheKey);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  try {
    var resp = UrlFetchApp.fetch(POWER_CRM_URL + '/api/report/db', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + POWER_CRM_TOKEN,
        'Content-Type':  'application/json',
        'Accept':        'application/json'
      },
      payload:            JSON.stringify({ from: from, to: to, stringFilterTypeDate: 3 }),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      return { erro: 'PowerCRM HTTP ' + resp.getResponseCode(), mes: mesStr, novos: [] };
    }

    var data  = JSON.parse(resp.getContentText());
    var lista = Array.isArray(data) ? data
      : (data.data || data.content || data.result || data.records || data.items || []);

    var novos = lista
      .filter(function(row) {
        var status    = parseInt(row.cardStatus) || 0;
        var arquivado = row.isShelved === true || row.isShelved === 1
                     || String(row.isShelved).toUpperCase() === 'TRUE';
        return status === 5 && !arquivado;
      })
      .map(function(row) {
        return {
          card_id:    String(row.cardId       || row.id          || ''),
          nome:       String(row.clientName   || row.name        || ''),
          placa:      String(row.vehiclePlates || row.plate      || ''),
          vendedor:   String(row.sellerName   || row.seller      || ''),
          data_venda: String(row.dtVenda      || row.closingDate || '')
        };
      });

    var resultado = { mes: mesStr, total: novos.length, novos: novos };
    try { cache.put(cacheKey, JSON.stringify(resultado), 1800); } catch(e) {}
    return resultado;

  } catch(e) {
    return { erro: e.message, mes: mesStr, novos: [] };
  }
}

function invalidarCachePowerCRM() {
  CacheService.getScriptCache().remove('power_crm_novos');
  Logger.log('✅ Cache Power CRM invalidado.');
  try { SpreadsheetApp.getUi().alert('✅ Cache Power CRM invalidado.', "", SpreadsheetApp.getUi().ButtonSet.OK); } catch(e) {}
}

// ===================== HISTÓRICO MENSAL =====================
function getHistoricoMensal() {
  var alteracoes = getAlteracoes();
  var assocList  = alteracoes.associados || [];
  var veicList   = alteracoes.veiculos   || [];

  var porMes = {};
  assocList.forEach(function(a) {
    var dtStr = String(a.data_alteracao || "").substring(0, 7);
    if (!dtStr || dtStr.length < 7) return;
    if (!porMes[dtStr]) porMes[dtStr] = { cancelamentos: 0, reativacoes: 0, novos: 0, cancelamentos_veiculo: 0, reativacoes_veiculo: 0, entradas_veiculo: 0, saidas_veiculo: 0 };
    var de   = String(a.valor_anterior  || "").trim();
    var para = String(a.valor_posterior || "").trim();
    if (de === "1" && para === "2") porMes[dtStr].cancelamentos++;
    if (de === "2" && para === "1") porMes[dtStr].reativacoes++;
    if (!de         && para === "1") porMes[dtStr].novos++;
  });

  veicList.forEach(function(v) {
    var dtStr = String(v.data_alteracao || "").substring(0, 7);
    if (!dtStr || dtStr.length < 7) return;
    if (!porMes[dtStr]) porMes[dtStr] = { cancelamentos: 0, reativacoes: 0, novos: 0, cancelamentos_veiculo: 0, reativacoes_veiculo: 0, entradas_veiculo: 0, saidas_veiculo: 0 };
    var de   = String(v.valor_anterior  || "").trim();
    var para = String(v.valor_posterior || "").trim();
    if (de === "1" && para === "2") porMes[dtStr].cancelamentos_veiculo++;
    if (de === "2" && para === "1") porMes[dtStr].reativacoes_veiculo++;
    if (para === "1")               porMes[dtStr].entradas_veiculo++;
    if (de   === "1")               porMes[dtStr].saidas_veiculo++;
  });

  var novosMap = getNovosContratosPorMes();

  var hoje      = new Date();
  var resultado = [];
  for (var i = 11; i >= 0; i--) {
    var d      = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    var mesNum = d.getMonth() + 1;
    var mesStr = d.getFullYear() + "-" + (mesNum < 10 ? "0" + mesNum : mesNum);
    var dados  = porMes[mesStr] || {};
    resultado.push({
      mes:                   mesStr,
      cancelamentos:         dados.cancelamentos          || 0,
      cancelamentos_veiculo: dados.cancelamentos_veiculo  || 0,
      reativacoes:           dados.reativacoes            || 0,
      reativacoes_veiculo:   dados.reativacoes_veiculo    || 0,
      entradas_veiculo:      dados.entradas_veiculo       || 0,
      saidas_veiculo:        dados.saidas_veiculo         || 0,
      saldo_veiculo:         (dados.entradas_veiculo || 0) - (dados.saidas_veiculo || 0),
      novos:                 novosMap[mesStr]              || 0
    });
  }

  var resAtivos = chamarAPI("/listar/associado", "post", {
    "codigo_situacao": 1, "inicio_paginacao": 0, "quantidade_por_pagina": 1
  });

  return {
    por_mes:          resultado,
    base_ativa_atual: resAtivos ? (parseInt(resAtivos.total_associados) || 0) : 0
  };
}

// ===================== ANÁLISE DE CHURN =====================
function getAnaliseChurn() {
  var alteracoes = getAlteracoes();
  var assocList  = alteracoes.associados || [];

  var cancelamentos = assocList.filter(function(a) {
    return String(a.valor_posterior) === "2" && String(a.valor_anterior) === "1";
  });

  var contratosMap = {};
  try {
    var ss        = SpreadsheetApp.getActiveSpreadsheet();
    var abaInativ = ss.getSheetByName("Associados Inativos");
    if (abaInativ && abaInativ.getLastRow() >= 2) {
      var header   = abaInativ.getRange(1, 1, 1, abaInativ.getLastColumn()).getValues()[0];
      var iCod     = header.indexOf("codigo_associado");
      var iReg     = header.indexOf("codigo_regional");
      var iDtContr = header.indexOf("data_contrato_associado");
      var iDtCad   = header.indexOf("data_cadastro_associado");
      var linhas   = abaInativ.getRange(2, 1, abaInativ.getLastRow() - 1, abaInativ.getLastColumn()).getValues();
      linhas.forEach(function(row) {
        var cod = String(row[iCod] || "").trim();
        if (!cod) return;
        var dtContr = iDtContr !== -1 ? String(row[iDtContr] || "") : "";
        var dtCad   = iDtCad   !== -1 ? String(row[iDtCad]   || "") : "";
        contratosMap[cod] = {
          regional: iReg !== -1 ? String(row[iReg] || "") : "",
          data:     (dtContr && dtContr !== "0000-00-00") ? dtContr : dtCad
        };
      });
    }
  } catch(e) {
    Logger.log("Aviso: não foi possível ler Associados Inativos — " + e.message);
  }

  var REGIONAL_NAMES        = { "1": "Ipatinga", "2": "Betim" };
  var porMes                = {};
  var porRegional           = {};
  var porOperadora          = {};
  var distribuicaoTempoCasa = { "0-30": 0, "31-90": 0, "91-180": 0, "181-365": 0, "366-730": 0, "730+": 0 };
  var detalhes              = [];

  cancelamentos.forEach(function(a) {
    var dtCancelStr  = String(a.data_alteracao || "").substring(0, 10);
    if (!dtCancelStr || dtCancelStr.length < 7) return;
    var mesCancelStr = dtCancelStr.substring(0, 7);

    var cod      = String(a.codigo_associado || "");
    var info     = contratosMap[cod] || {};
    var codReg   = info.regional || "";
    var regNome  = REGIONAL_NAMES[codReg] || (codReg ? "Regional " + codReg : "Sem Regional");
    var operadora = String(a.nome_usuario_alteracao || "").trim() || "Sem Operadora";

    var diasCasa = null;
    if (info.data && info.data !== "0000-00-00") {
      try {
        var dtContr  = new Date(info.data);
        var dtCancel = new Date(a.data_alteracao);
        if (!isNaN(dtContr) && !isNaN(dtCancel)) {
          diasCasa = Math.max(0, Math.floor((dtCancel - dtContr) / (1000 * 60 * 60 * 24)));
        }
      } catch(e) {}
    }

    porMes[mesCancelStr]    = (porMes[mesCancelStr]    || 0) + 1;
    porRegional[regNome]    = (porRegional[regNome]     || 0) + 1;
    porOperadora[operadora] = (porOperadora[operadora]  || 0) + 1;

    if (diasCasa !== null) {
      if      (diasCasa <= 30)  distribuicaoTempoCasa["0-30"]++;
      else if (diasCasa <= 90)  distribuicaoTempoCasa["31-90"]++;
      else if (diasCasa <= 180) distribuicaoTempoCasa["91-180"]++;
      else if (diasCasa <= 365) distribuicaoTempoCasa["181-365"]++;
      else if (diasCasa <= 730) distribuicaoTempoCasa["366-730"]++;
      else                      distribuicaoTempoCasa["730+"]++;
    }

    detalhes.push({
      codigo_associado:  a.codigo_associado,
      nome:              a.nome_associado  || "",
      data_cancelamento: dtCancelStr,
      dias_casa:         diasCasa,
      regional:          regNome,
      operadora:         operadora
    });
  });

  return {
    total_cancelamentos: cancelamentos.length,
    por_mes: Object.keys(porMes).sort().map(function(m) {
      return { mes: m, cancelamentos: porMes[m] };
    }),
    por_regional: Object.keys(porRegional).map(function(r) {
      return { regional: r, cancelamentos: porRegional[r] };
    }).sort(function(a, b) { return b.cancelamentos - a.cancelamentos; }),
    por_operadora: Object.keys(porOperadora).map(function(op) {
      return { operadora: op, cancelamentos: porOperadora[op] };
    }).sort(function(a, b) { return b.cancelamentos - a.cancelamentos; }),
    distribuicao_tempo_casa: Object.keys(distribuicaoTempoCasa).map(function(f) {
      return { faixa: f, quantidade: distribuicaoTempoCasa[f] };
    }),
    detalhes: detalhes
  };
}

// ===================== RECONSTRUIR HISTÓRICO =====================
function reconstruirHistoricoCancelamentos() {
  var ui = getUI();
  autenticar();

  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName("Historico Cancelamentos") || ss.insertSheet("Historico Cancelamentos");
  aba.clear();
  aba.getRange(1, 1, 1, 10).setValues([[
    "codigo_associado", "nome", "cpf",
    "data_cancelamento", "data_contrato", "dias_ate_cancelamento", "mes_cancelamento",
    "codigo_regional", "codigo_cooperativa", "operadora"
  ]]);
  aba.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#fff");
  aba.setFrozenRows(1);

  var contratos      = {};
  var pagina         = 0;
  var totalRegistros = 1;

  while (pagina < totalRegistros) {
    var r = chamarAPI("/listar/associado", "post", {
      "codigo_situacao": 2, "inicio_paginacao": pagina, "quantidade_por_pagina": 1000
    });
    if (!r || !r.associados || r.associados.length === 0) break;
    totalRegistros = parseInt(r.total_associados) || 0;
    r.associados.forEach(function(a) {
      var dc = "";
      if (a.data_contrato_associado && a.data_contrato_associado !== "0000-00-00") {
        dc = a.data_contrato_associado;
      } else if (a.data_cadastro_associado && a.data_cadastro_associado !== "0000-00-00") {
        dc = a.data_cadastro_associado;
      }
      contratos[String(a.codigo_associado)] = {
        data: dc, regional: a.codigo_regional || "", coop: a.codigo_cooperativa || ""
      };
    });
    Logger.log("Inativos offset " + pagina + "/" + totalRegistros);
    pagina += 1000;
    Utilities.sleep(400);
  }

  var totalSemanas = 156;
  var hoje         = new Date();
  var novasLinhas  = [];

  for (var i = 0; i < totalSemanas; i++) {
    var dataFimS = new Date(hoje.getTime() - i       * 7 * 24 * 60 * 60 * 1000);
    var dataIniS = new Date(hoje.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    var dFimS    = Utilities.formatDate(dataFimS, "America/Sao_Paulo", "dd/MM/yyyy");
    var dIniS    = Utilities.formatDate(dataIniS, "America/Sao_Paulo", "dd/MM/yyyy");

    var alteracoes = chamarAPI("/listar/alteracao-associados/", "post", {
      "data_inicial": dIniS, "data_final": dFimS, "campos": ["codigo_situacao"]
    });

    if (Array.isArray(alteracoes)) {
      alteracoes.forEach(function(a) {
        if (String(a.valor_posterior) !== "2" || String(a.valor_anterior) !== "1") return;
        var cod          = String(a.codigo_associado);
        var info         = contratos[cod] || {};
        var dataContrato = info.data || "";
        var diasAte      = "";
        var mesCancel    = "";
        var dtCancel     = new Date(a.data_alteracao);
        if (!isNaN(dtCancel)) mesCancel = Utilities.formatDate(dtCancel, "America/Sao_Paulo", "yyyy-MM");
        if (dataContrato) {
          var dtContrato = new Date(dataContrato);
          if (!isNaN(dtContrato) && !isNaN(dtCancel)) {
            diasAte = Math.floor((dtCancel - dtContrato) / (1000 * 60 * 60 * 24));
          }
        }
        novasLinhas.push([
          a.codigo_associado, a.nome_associado || "", a.cpf_associado || "",
          a.data_alteracao, dataContrato, diasAte, mesCancel,
          info.regional || "", info.coop || "", a.nome_usuario_alteracao || ""
        ]);
      });
    }

    Logger.log("Semana " + (i + 1) + "/" + totalSemanas + " — acumulado=" + novasLinhas.length);
    Utilities.sleep(500);
  }

  if (novasLinhas.length > 0) {
    aba.getRange(2, 1, novasLinhas.length, 10).setValues(novasLinhas);
  }

  ui.alert(
    "✅ Histórico reconstruído!",
    "Cancelamentos encontrados: " + novasLinhas.length,
    ui.ButtonSet.OK
  );
}

// ===================== ANÁLISE 60 E 90 DIAS =====================
function analisarCancelamentos60e90() {
  var ui      = getUI();
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var abaHist = ss.getSheetByName("Historico Cancelamentos");
  if (!abaHist || abaHist.getLastRow() < 2) {
    ui.alert("❌ Execute primeiro 'Reconstruir Histórico de Cancelamentos'.", "", ui.ButtonSet.OK);
    return;
  }

  var header = abaHist.getRange(1, 1, 1, abaHist.getLastColumn()).getValues()[0];
  var iDias  = header.indexOf("dias_ate_cancelamento");
  var iMes   = header.indexOf("mes_cancelamento");
  var iData  = header.indexOf("data_cancelamento");

  if (iDias === -1) {
    ui.alert("❌ Coluna 'dias_ate_cancelamento' não encontrada.", "", ui.ButtonSet.OK);
    return;
  }

  var dados     = abaHist.getRange(2, 1, abaHist.getLastRow() - 1, abaHist.getLastColumn()).getValues();
  var porMes60  = {};
  var porMes90  = {};
  var porMesTot = {};

  dados.forEach(function(row) {
    var dias = row[iDias];
    var mes  = iMes !== -1 ? String(row[iMes]) : "";
    if (!mes && iData !== -1 && row[iData]) {
      try {
        var d = new Date(row[iData]);
        if (!isNaN(d)) mes = Utilities.formatDate(d, "America/Sao_Paulo", "yyyy-MM");
      } catch(e) {}
    }
    if (!mes || mes === "") return;
    porMesTot[mes] = (porMesTot[mes] || 0) + 1;
    if (dias === "" || dias === null) return;
    var n = parseInt(dias);
    if (isNaN(n) || n < 0) return;
    if (n <= 60) porMes60[mes] = (porMes60[mes] || 0) + 1;
    if (n <= 90) porMes90[mes] = (porMes90[mes] || 0) + 1;
  });

  var abaRes    = ss.getSheetByName("Análise 60-90 dias") || ss.insertSheet("Análise 60-90 dias");
  abaRes.clear();
  var meses     = Object.keys(porMesTot).sort();
  var cabecalho = [
    ["📈 CANCELAMENTOS POR MÊS — Análise de Precocidade", "", "", "", ""],
    ["Gerado em: " + new Date().toLocaleString("pt-BR"), "", "", "", ""],
    ["", "", "", "", ""],
    ["Mês", "Total Cancelamentos", "Até 60 dias de adesão", "Até 90 dias de adesão", "% em até 90 dias"]
  ];
  var linhas = meses.map(function(mes) {
    var tot = porMesTot[mes] || 0;
    var c60 = porMes60[mes]  || 0;
    var c90 = porMes90[mes]  || 0;
    return [mes, tot, c60, c90, tot > 0 ? ((c90 / tot) * 100).toFixed(1) + "%" : "-"];
  });
  var tTot = meses.reduce(function(s, m) { return s + (porMesTot[m] || 0); }, 0);
  var t60  = meses.reduce(function(s, m) { return s + (porMes60[m]  || 0); }, 0);
  var t90  = meses.reduce(function(s, m) { return s + (porMes90[m]  || 0); }, 0);
  linhas.push(["TOTAL", tTot, t60, t90, tTot > 0 ? ((t90 / tTot) * 100).toFixed(1) + "%" : "-"]);

  var tudo = cabecalho.concat(linhas);
  abaRes.getRange(1, 1, tudo.length, 5).setValues(tudo);
  abaRes.getRange(1, 1, 1, 5).setFontWeight("bold").setFontSize(13).setBackground("#1a1a2e").setFontColor("#fff");
  abaRes.getRange(4, 1, 1, 5).setFontWeight("bold").setBackground("#2d3561").setFontColor("#fff");
  abaRes.getRange(4 + linhas.length, 1, 1, 5).setFontWeight("bold").setBackground("#374785").setFontColor("#fff");
  abaRes.setFrozenRows(4);
  for (var c = 1; c <= 5; c++) abaRes.autoResizeColumn(c);

  ui.alert(
    "✅ Análise concluída!",
    "Total: " + tTot + "\nAté 60 dias: " + t60 + "\nAté 90 dias: " + t90,
    ui.ButtonSet.OK
  );
}

// ===================== TESTE doGet =====================
function testarDoGet() {
  var ui         = getUI();
  var resultados = {};
  ["resumo", "panorama", "zona_churn", "snapshots"].forEach(function(acao) {
    try {
      var e        = { parameter: { acao: acao } };
      var response = doGet(e);
      var json     = JSON.parse(response.getContent());
      resultados[acao] = json.erro ? "ERRO: " + json.erro : "OK";
      Logger.log(acao + ": " + JSON.stringify(json).substring(0, 500));
    } catch(err) {
      resultados[acao] = "ERRO: " + err.message;
    }
  });
  var msg = Object.keys(resultados).map(function(k) { return k + ": " + resultados[k]; }).join("\n");
  ui.alert("Teste doGet", msg, ui.ButtonSet.OK);
}
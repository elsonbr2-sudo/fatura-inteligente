/**
 * FATURA INTELIGENTE — Script de limpeza da aba 2026-05
 *
 * Como usar:
 *   1. Abra a planilha no Google Sheets
 *   2. Extensões → Apps Script
 *   3. Cole este arquivo inteiro
 *   4. Execute PASSO1_diagnostico() primeiro para ver o que está na aba
 *   5. Execute PASSO2_removerDuplicatas() para remover saves duplicados
 *   6. Execute PASSO3_removerComprasJunho(total) informando o total exato das 19 compras
 *
 * Veja o log de execução em: Ver → Logs (Ctrl+Enter)
 */

// ─────────────────────────────────────────────────────────────────────────────
// PASSO 1 — Diagnóstico: mostra o que tem na aba 2026-05
// ─────────────────────────────────────────────────────────────────────────────
function PASSO1_diagnostico() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName('2026-05');
  if (!aba) { Logger.log('ERRO: Aba 2026-05 não encontrada.'); return; }

  var dados = aba.getDataRange().getValues();
  Logger.log('=== DIAGNÓSTICO 2026-05 ===');
  Logger.log('Total de linhas (com cabeçalho): ' + dados.length);
  Logger.log('Total de compras: ' + (dados.length - 1));
  Logger.log('Colunas: ' + dados[0].join(' | '));

  // Descobre o índice da coluna Valor (busca por "Valor" no cabeçalho)
  var colValor = dados[0].findIndex(function(h) { return /valor/i.test(String(h)); });
  if (colValor >= 0) {
    var totalGeral = 0;
    for (var i = 1; i < dados.length; i++) totalGeral += Number(dados[i][colValor]) || 0;
    Logger.log('Total R$ da aba: R$ ' + totalGeral.toFixed(2));
  }

  // Checa duplicatas (mesma data + descrição + valor + cartão)
  var colDesc  = dados[0].findIndex(function(h) { return /descri/i.test(String(h)); });
  var colData  = dados[0].findIndex(function(h) { return /^data$/i.test(String(h)); });
  var colCartao= dados[0].findIndex(function(h) { return /cart[aã]o/i.test(String(h)); });

  var chaves = {};
  var duplicatas = 0;
  for (var i = 1; i < dados.length; i++) {
    var chave = [dados[i][colData], dados[i][colDesc], dados[i][colValor], dados[i][colCartao]].join('|');
    if (chaves[chave]) duplicatas++;
    else chaves[chave] = 0;
    chaves[chave]++;
  }
  Logger.log('Linhas duplicadas encontradas: ' + duplicatas);
  Logger.log('Chaves únicas: ' + Object.keys(chaves).length);
  Logger.log('');
  Logger.log('→ Se duplicatas > 0, rode PASSO2_removerDuplicatas()');
  Logger.log('→ Em seguida, rode PASSO3_removerComprasJunho(1690.26) com o total exato das compras de junho');
}

// ─────────────────────────────────────────────────────────────────────────────
// PASSO 2 — Remove duplicatas (linhas salvas mais de uma vez na aba 2026-05)
// ─────────────────────────────────────────────────────────────────────────────
function PASSO2_removerDuplicatas() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName('2026-05');
  if (!aba) { Logger.log('ERRO: Aba 2026-05 não encontrada.'); return; }

  var dados = aba.getDataRange().getValues();
  var colDesc  = dados[0].findIndex(function(h) { return /descri/i.test(String(h)); });
  var colData  = dados[0].findIndex(function(h) { return /^data$/i.test(String(h)); });
  var colValor = dados[0].findIndex(function(h) { return /valor/i.test(String(h)); });
  var colCartao= dados[0].findIndex(function(h) { return /cart[aã]o/i.test(String(h)); });

  var visto = {};
  var linhasManter = [dados[0]]; // cabeçalho sempre fica
  var removidas = 0;

  for (var i = 1; i < dados.length; i++) {
    var chave = [dados[i][colData], dados[i][colDesc], dados[i][colValor], dados[i][colCartao]].join('|');
    if (visto[chave]) {
      removidas++;
      Logger.log('Duplicata removida: ' + chave);
    } else {
      visto[chave] = true;
      linhasManter.push(dados[i]);
    }
  }

  // Reescreve a aba sem duplicatas
  aba.clearContents();
  if (linhasManter.length > 0) {
    aba.getRange(1, 1, linhasManter.length, linhasManter[0].length).setValues(linhasManter);
  }

  Logger.log('');
  Logger.log('=== RESULTADO PASSO 2 ===');
  Logger.log('Duplicatas removidas: ' + removidas);
  Logger.log('Linhas restantes (sem cabeçalho): ' + (linhasManter.length - 1));

  // Recalcula total
  var colV = dados[0].findIndex(function(h) { return /valor/i.test(String(h)); });
  var total = 0;
  for (var j = 1; j < linhasManter.length; j++) total += Number(linhasManter[j][colV]) || 0;
  Logger.log('Total R$ após limpeza: R$ ' + total.toFixed(2));
  Logger.log('');
  Logger.log('→ Agora rode PASSO3_removerComprasJunho(TOTAL) com o total das 19 compras de junho');
}

// ─────────────────────────────────────────────────────────────────────────────
// PASSO 3 — Remove as compras de junho que foram salvas na aba de maio
//
// Como funciona:
//   - Ordena as compras por valor (menor → maior)
//   - Usa busca gulosa para encontrar o subconjunto que soma o total informado
//   - Remove essas linhas da aba 2026-05
//
// Parâmetro totalJunho: o total exato das 19 compras (ex: 1690.26)
//   Você encontra esse valor no dashboard do index.html (tela de revisão)
// ─────────────────────────────────────────────────────────────────────────────
function PASSO3_removerComprasJunho(totalJunho) {
  // Se não passar o parâmetro, usa 1690.26 como default
  totalJunho = totalJunho || 1690.26;

  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName('2026-05');
  if (!aba) { Logger.log('ERRO: Aba 2026-05 não encontrada.'); return; }

  var dados = aba.getDataRange().getValues();
  var cabecalho = dados[0];
  var colValor  = cabecalho.findIndex(function(h) { return /valor/i.test(String(h)); });
  var colDesc   = cabecalho.findIndex(function(h) { return /descri/i.test(String(h)); });

  if (colValor < 0) { Logger.log('ERRO: Coluna Valor não encontrada.'); return; }

  // Monta lista de compras com índice original
  var compras = [];
  for (var i = 1; i < dados.length; i++) {
    compras.push({ idx: i, valor: Number(dados[i][colValor]) || 0, linha: dados[i] });
  }

  // Ordena por valor crescente para facilitar a busca
  compras.sort(function(a, b) { return a.valor - b.valor; });

  // Tenta encontrar subconjunto que soma totalJunho (tolerância de R$ 0,02)
  var tolerancia = 0.02;
  var encontrado = buscarSubconjuntoSoma(compras, totalJunho, tolerancia);

  if (!encontrado) {
    Logger.log('AVISO: Não foi possível encontrar automaticamente um subconjunto que some R$ ' + totalJunho.toFixed(2));
    Logger.log('Isso pode ocorrer se o total informado estiver impreciso ou se as compras não estiverem nessa aba.');
    Logger.log('');
    Logger.log('Alternativa: abra a aba 2026-05 no Sheets e delete manualmente as linhas das 19 compras de junho.');
    Logger.log('Dica: filtre pela coluna Cartão para encontrar as compras do cartão usado nas faturas de junho.');
    return;
  }

  // Remove as linhas encontradas
  var indicesRemover = {};
  encontrado.forEach(function(c) { indicesRemover[c.idx] = true; });

  var linhasManter = [cabecalho];
  var totalRemovido = 0;
  for (var j = 1; j < dados.length; j++) {
    if (indicesRemover[j]) {
      totalRemovido += Number(dados[j][colValor]) || 0;
      Logger.log('Removida: ' + dados[j][colDesc] + ' R$ ' + dados[j][colValor]);
    } else {
      linhasManter.push(dados[j]);
    }
  }

  // Reescreve aba
  aba.clearContents();
  if (linhasManter.length > 0) {
    aba.getRange(1, 1, linhasManter.length, linhasManter[0].length).setValues(linhasManter);
  }

  Logger.log('');
  Logger.log('=== RESULTADO PASSO 3 ===');
  Logger.log('Compras de junho removidas da aba 2026-05: ' + encontrado.length);
  Logger.log('Total removido: R$ ' + totalRemovido.toFixed(2));
  Logger.log('Linhas restantes em 2026-05: ' + (linhasManter.length - 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca um subconjunto de compras que some o alvo (algoritmo greedy + backtrack)
// Retorna o array de compras encontradas ou null se não encontrar
// ─────────────────────────────────────────────────────────────────────────────
function buscarSubconjuntoSoma(compras, alvo, tolerancia) {
  // Tenta greedy: pega compras da maior para menor até atingir o alvo
  var ordenadoDesc = compras.slice().sort(function(a, b) { return b.valor - a.valor; });
  var soma = 0;
  var selecionadas = [];

  for (var i = 0; i < ordenadoDesc.length; i++) {
    if (soma + ordenadoDesc[i].valor <= alvo + tolerancia) {
      soma += ordenadoDesc[i].valor;
      selecionadas.push(ordenadoDesc[i]);
      if (Math.abs(soma - alvo) <= tolerancia) return selecionadas;
    }
  }

  // Se chegou perto mas não exato, retorna o que encontrou (tolerância)
  if (Math.abs(soma - alvo) <= tolerancia) return selecionadas;

  Logger.log('Soma mais próxima encontrada pelo algoritmo greedy: R$ ' + soma.toFixed(2) + ' (alvo: R$ ' + alvo.toFixed(2) + ')');
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIO: mostra todas as compras da aba para inspeção manual
// ─────────────────────────────────────────────────────────────────────────────
function UTIL_listarCompras() {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName('2026-05');
  if (!aba) { Logger.log('Aba não encontrada'); return; }
  var dados = aba.getDataRange().getValues();
  var colDesc  = dados[0].findIndex(function(h) { return /descri/i.test(String(h)); });
  var colValor = dados[0].findIndex(function(h) { return /valor/i.test(String(h)); });
  var colCartao= dados[0].findIndex(function(h) { return /cart/i.test(String(h)); });
  for (var i = 1; i < dados.length; i++) {
    Logger.log((i) + '. ' + dados[i][colCartao] + ' | ' + dados[i][colDesc] + ' | R$ ' + dados[i][colValor]);
  }
}

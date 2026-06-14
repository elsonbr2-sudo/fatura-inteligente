var http          = require('http');
var https         = require('https');
var fs            = require('fs');
var path          = require('path');
var child_process = require('child_process');
var os            = require('os');
var pdfParse      = require('pdf-parse');

var PORT = 3001;

// --- Leitura do config.json (token de longa duracao) ----------------------
function lerConfig() {
  try {
    var cfgPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(cfgPath)) return {};
    var cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    return cfg || {};
  } catch (e) {
    console.error('Aviso: erro ao ler config.json:', e.message);
    return {};
  }
}

var CONFIG = lerConfig();
var OAUTH_TOKEN = (CONFIG.claude_oauth_token || '').trim();
// Token valido comeca com sk-ant-oat01-
var USA_TOKEN_LONGA_DURACAO = OAUTH_TOKEN.startsWith('sk-ant-oat01-');

// --- Verificacao do token OAuth -------------------------------------------
function statusTokenOAuth() {
  // Se config.json tem token de longa duracao, nao precisa checar o credentials.json
  if (USA_TOKEN_LONGA_DURACAO) {
    return { ok: true, fonte: 'config.json', horas: 8760 }; // ~1 ano
  }
  try {
    var credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credPath)) return { ok: false, motivo: 'arquivo .credentials.json nao existe' };
    var cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    var oauth = cred && cred.claudeAiOauth;
    if (!oauth || !oauth.expiresAt) return { ok: false, motivo: 'campo claudeAiOauth ausente' };
    var msLeft = oauth.expiresAt - Date.now();
    var horas  = Math.round(msLeft / 3600000);
    if (msLeft < 0) return { ok: false, motivo: 'token expirado em ' + new Date(oauth.expiresAt).toISOString() };
    return { ok: true, fonte: 'credentials.json', expiresAt: oauth.expiresAt, horas: horas };
  } catch (e) {
    return { ok: false, motivo: 'erro lendo credenciais: ' + e.message };
  }
}

function mensagemReautenticar() {
  return '\n[AUTENTICACAO NECESSARIA]\n' +
         'O token do Claude CLI expirou ou nao esta valido.\n' +
         '\nOpcao 1 — Token de longa duracao (recomendado, valido 1 ano):\n' +
         '    1. Abra um terminal e rode: claude setup-token\n' +
         '    2. Copie o token gerado (comeca com sk-ant-oat01-)\n' +
         '    3. Cole em config.json no campo "claude_oauth_token"\n' +
         '    4. Reinicie o servidor\n' +
         '\nOpcao 2 — Renovacao manual (valido ~8h):\n' +
         '    claude /logout\n' +
         '    claude\n' +
         '    (faca login no browser e reinicie este servidor)\n';
}

// --- Chamada via Claude CLI local -----------------------------------------

function chamarClaude(prompt, pdfPath) {
  return new Promise(function(resolve, reject) {
    var id    = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var tmpIn = path.join(os.tmpdir(), 'fi_' + id + '.txt');
    fs.writeFileSync(tmpIn, prompt, 'utf8');

    var safePrompt = tmpIn.replace(/\\/g, '\\\\');
    var ps;
    if (pdfPath) {
      var safePdf = pdfPath.replace(/\\/g, '\\\\');
      // Passa o prompt via stdin e o PDF via --file para Claude processar diretamente
      ps = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;' +
           'Get-Content -Raw -Encoding UTF8 "' + safePrompt + '" | claude --file "' + safePdf + '"';
    } else {
      ps = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;' +
           'Get-Content -Raw -Encoding UTF8 "' + safePrompt + '" | claude';
    }

    // Injeta o token de longa duracao (config.json) se disponivel
    var envClaude = Object.assign({}, process.env);
    if (USA_TOKEN_LONGA_DURACAO) {
      envClaude.CLAUDE_CODE_OAUTH_TOKEN = OAUTH_TOKEN;
    }

    var proc = child_process.spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', ps
    ], {
      windowsHide: true,
      env: envClaude,
      stdio: ['ignore', 'pipe', 'pipe']  // garante que stdin nao bloqueia o subprocess
    });

    var stdout = [];
    var stderr = [];
    proc.stdout.on('data', function(d) { stdout.push(d); });
    proc.stderr.on('data', function(d) { stderr.push(d); });

    proc.on('error', function(e) {
      try { fs.unlinkSync(tmpIn); } catch(x) {}
      reject(new Error('Erro ao iniciar PowerShell: ' + e.message));
    });

    proc.on('close', function(code) {
      try { fs.unlinkSync(tmpIn); } catch(x) {}
      var out = Buffer.concat(stdout).toString('utf8').trim();
      var err = Buffer.concat(stderr).toString('utf8').trim();

      // Deteccao especifica de falha de autenticacao - 401 pode vir em stdout ou stderr
      var combinado = (out + '\n' + err);
      if (/401|Failed to authenticate|Invalid authentication credentials/i.test(combinado)) {
        return reject(new Error('Token OAuth do Claude CLI expirado ou invalido.' + mensagemReautenticar()));
      }

      if (code !== 0) {
        return reject(new Error(
          'Falha no Claude CLI (code ' + code + ')' +
          (err ? '\nDetalhes: ' + err.slice(0, 400) : '') +
          (out ? '\nSaida: ' + out.slice(0, 400) : '')
        ));
      }
      resolve(out);
    });
  });
}

function extrairTextoPDF(buffer) {
  var texto = '';
  try {
    var str = buffer.toString('binary');
    var pos = 0;
    while (pos < str.length) {
      var sIdx = str.indexOf('stream', pos);
      if (sIdx === -1) break;
      var headerStart = str.lastIndexOf('<<', sIdx);
      var header = headerStart >= 0 ? str.slice(headerStart, sIdx) : '';
      var dStart = sIdx + 6;
      if (str[dStart] === '\r') dStart++;
      if (str[dStart] === '\n') dStart++;
      var eIdx = str.indexOf('endstream', dStart);
      if (eIdx === -1) break;
      var dEnd = eIdx;
      if (str[dEnd - 1] === '\n') dEnd--;
      if (str[dEnd - 1] === '\r') dEnd--;
      var streamBuf = buffer.slice(dStart, dEnd);
      var conteudo = '';
      if (header.includes('FlateDecode')) {
        try { conteudo = zlib.inflateSync(streamBuf).toString('binary'); }
        catch (e) {
          try { conteudo = zlib.inflateRawSync(streamBuf).toString('binary'); } catch (e2) {}
        }
      } else if (!header.includes('DCTDecode') && !header.includes('CCITTFax') && !header.includes('JBIG2')) {
        conteudo = streamBuf.toString('binary');
      }
      if (conteudo && conteudo.includes('BT')) texto += parseStreamTexto(conteudo) + '\n';
      pos = eIdx + 9;
    }
  } catch (e) { console.error('Extracao PDF:', e.message); }
  return texto.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function parseStreamTexto(stream) {
  var r = '';
  var blocos = stream.match(/BT[\s\S]*?ET/g) || [];
  for (var i = 0; i < blocos.length; i++) {
    var b = blocos[i];
    var m;
    var reTj = /\(([^)]*(?:\\.[^)]*)*)\)\s*Tj/g;
    while ((m = reTj.exec(b)) !== null) r += decodePDFStr(m[1]) + ' ';
    var reTJ = /\[([^\]]*)\]\s*TJ/g;
    while ((m = reTJ.exec(b)) !== null) {
      var sub;
      var reSub = /\(([^)]*(?:\\.[^)]*)*)\)/g;
      while ((sub = reSub.exec(m[1])) !== null) r += decodePDFStr(sub[1]);
      r += ' ';
    }
    if (/T[dD*]/.test(b)) r += '\n';
  }
  return r;
}

function decodePDFStr(s) {
  return s
    .replace(/\\(\d{3})/g, function(_, o) { return String.fromCharCode(parseInt(o, 8)); })
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
}

// --- Servidor HTTP ---------------------------------------------------------
var server = http.createServer(function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    var htmlPath = path.join(__dirname, 'index.html');
    if (!fs.existsSync(htmlPath)) { res.writeHead(404); res.end('index.html nao encontrado'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(htmlPath).pipe(res);
    return;
  }

  if (req.method === 'POST' && req.url === '/processar') {
    var chunks = [];
    req.on('data', function(c) { chunks.push(c); });
    req.on('end', function() { processarPDF(Buffer.concat(chunks), req.headers, res); });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

// --- Processa PDF ----------------------------------------------------------
function processarPDF(buffer, headers, res) {
  var boundary = (headers['content-type'] || '').split('boundary=')[1];
  if (!boundary) { responderErro(res, 'Content-Type invalido'); return; }

  var partes      = parseMultipart(buffer, boundary);
  var pdfParte    = partes.find(function(p) { return p.filename; });
  var cartaoParte = partes.find(function(p) { return p.name === 'cartao'; });
  var cartao      = cartaoParte ? cartaoParte.data.toString() : 'ELO CAIXA';

  if (!pdfParte) { responderErro(res, 'PDF nao encontrado no upload'); return; }

  console.log('\nProcessando: ' + pdfParte.filename + ' [' + cartao + ']');

  pdfParse(pdfParte.data).then(function(data) {
    var texto = data.text;
    console.log('Texto extraido: ' + texto.length + ' chars (' + data.numpages + ' paginas)');
    console.log('Amostra p2:\n' + texto.slice(Math.floor(texto.length / 3), Math.floor(texto.length / 3) + 400));

    if (!texto || texto.length < 30) {
      responderErro(res, 'Nao foi possivel extrair texto do PDF.');
      return;
    }

    var prompt =
      'Voce e um extrator especializado em faturas de cartao de credito brasileiras.\n' +
      'O texto abaixo foi extraido de uma fatura do cartao ' + cartao + ' com ' + data.numpages + ' paginas.\n\n' +
      'TAREFA 1 — MES DE REFERENCIA:\n' +
      'Encontre a data de VENCIMENTO da fatura (campos como "Vencimento", "Vcto", "Data de Vencimento", "Pagamento até").\n' +
      'O mes de referencia (mes_ref) e o ano-mes do vencimento no formato "YYYY-MM".\n' +
      'Exemplos: vencimento 10/06/2026 → "2026-06"; vencimento 05/2026 → "2026-05".\n' +
      'Se nao encontrar, use null.\n\n' +
      'TAREFA 2 — LANCAMENTOS:\n' +
      'Localize a secao de lancamentos/compras e extraia TODOS os itens.\n\n' +
      'COMO IDENTIFICAR A SECAO DE COMPRAS:\n' +
      '- Cabecalho tipico: "Nacionais em Reais", "Lancamentos", "Compras e Saques", "Extrato"\n' +
      '- Cada linha de compra tem o padrao: DD/MM  DESCRICAO  VALOR\n' +
      '- Exemplo: "19/11 AMAZON BR SAO PAULO(06/06) 46,17"\n' +
      '- Exemplo: "02/04 Amazon Prime Canais SAO PAULO BRA 29,90"\n\n' +
      'INCLUIR: toda linha DD/MM + descricao + valor positivo\n' +
      'IGNORAR: "PAGAMENTO RECEBIDO", estornos, creditos, valores negativos (terminam com " -"), totais, cabecalhos\n\n' +
      'FORMATO DE CADA COMPRA:\n' +
      '- data: "DD/MM"\n' +
      '- descricao: nome do estabelecimento SEM cidade (remova a cidade que aparece no final, ex: "WORLD TENNIS MACEIO" → "WORLD TENNIS") e sem o trecho de parcela entre parenteses\n' +
      '- valor: numero positivo com ponto decimal (46,17 → 46.17)\n' +
      '- parcela_info: "XX/YY" dos parenteses no fim da descricao, ou null\n\n' +
      'RETORNE APENAS objeto JSON valido, sem markdown, no formato:\n' +
      '{"mes_ref":"YYYY-MM","compras":[{"data":"DD/MM","descricao":"NOME","valor":0.00,"parcela_info":null}]}\n\n' +
      '=== TEXTO DA FATURA ===\n' + texto;

    console.log('Chamando Claude via stdin...');
    chamarClaude(prompt).then(function(resposta) {
      try {
        var txt = resposta.replace(/```json|```/g, '').trim();
        var compras, mesRef = null;

        // Tenta parse como objeto {"mes_ref":"...","compras":[...]}
        var objInicio = txt.indexOf('{');
        var objFim    = txt.lastIndexOf('}');
        if (objInicio !== -1 && objFim !== -1) {
          try {
            var obj = JSON.parse(txt.slice(objInicio, objFim + 1));
            if (obj && Array.isArray(obj.compras)) {
              compras = obj.compras;
              mesRef  = obj.mes_ref || null;
            }
          } catch (e2) { /* continua para fallback */ }
        }

        // Fallback: tenta parse como array direto
        if (!compras) {
          var inicio = txt.indexOf('[');
          var fim    = txt.lastIndexOf(']');
          if (inicio === -1 || fim === -1) throw new Error('JSON nao encontrado na resposta');
          compras = JSON.parse(txt.slice(inicio, fim + 1));
        }

        console.log('OK: ' + compras.length + ' compras extraidas, mes_ref: ' + (mesRef || 'nao detectado'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, compras: compras, cartao: cartao, mes_ref: mesRef }));
      } catch (e) {
        console.error('Erro parse JSON:', e.message);
        responderErro(res, e.message);
      }
    }).catch(function(err) {
      console.error('Erro Claude:', err.message);
      responderErro(res, err.message);
    });

  }).catch(function(e) {
    console.error('Erro pdf-parse:', e.message);
    responderErro(res, 'Falha ao ler PDF: ' + e.message);
  });
}

// --- Parser multipart ------------------------------------------------------
function parseMultipart(buffer, boundary) {
  var sep = Buffer.from('--' + boundary);
  var partes = [];
  var pos = 0;
  while (pos < buffer.length) {
    var inicio = indexOf(buffer, sep, pos);
    if (inicio === -1) break;
    pos = inicio + sep.length;
    if (buffer[pos] === 45 && buffer[pos + 1] === 45) break;
    if (buffer[pos] === 13) pos += 2;
    var fimH = indexOf(buffer, Buffer.from('\r\n\r\n'), pos);
    if (fimH === -1) break;
    var headersRaw = buffer.slice(pos, fimH).toString();
    pos = fimH + 4;
    var fimP = indexOf(buffer, sep, pos) - 2;
    if (fimP < 0) break;
    var data = buffer.slice(pos, fimP);
    pos = fimP + 2;
    var nameM = headersRaw.match(/name="([^"]+)"/);
    var fileM = headersRaw.match(/filename="([^"]+)"/);
    partes.push({ name: nameM ? nameM[1] : null, filename: fileM ? fileM[1] : null, data: data });
  }
  return partes;
}

function indexOf(buf, search, start) {
  start = start || 0;
  for (var i = start; i <= buf.length - search.length; i++) {
    var ok = true;
    for (var j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

function responderErro(res, msg) {
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, erro: msg }));
}

// --- Inicia servidor -------------------------------------------------------
console.log('');
console.log('=== FATURA INTELIGENTE ===');
console.log('Acesse: http://localhost:' + PORT);

var st = statusTokenOAuth();
if (st.ok) {
  if (st.fonte === 'config.json') {
    console.log('Auth: token de longa duracao (config.json) — valido por ~1 ano ✓');
  } else {
    console.log('Auth: Claude CLI via credenciais temporarias');
    console.log('Token OAuth: valido (' + st.horas + 'h restantes, expira ' + new Date(st.expiresAt).toISOString() + ')');
    console.log('Dica: use "claude setup-token" e configure config.json para nao precisar renovar.');
  }
} else {
  console.log('');
  console.log('AVISO: ' + st.motivo);
  console.log(mensagemReautenticar());
}
console.log('');

server.on('error', function(e) {
  if (e.code === 'EADDRINUSE') {
    console.error('ERRO: Porta ' + PORT + ' ja esta em uso. Execute: taskkill /F /IM node.exe');
  } else {
    console.error('Erro no servidor:', e.message);
  }
  process.exit(1);
});

server.listen(PORT);

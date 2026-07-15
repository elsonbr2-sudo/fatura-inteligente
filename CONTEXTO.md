# FATURA INTELIGENTE — CONTEXTO DO PROJETO (v2 — CONGELADA)

> ⚠️ **Esta versão (v2) está congelada.** A v3 está em produção desde jul/2026:
> `fatura-inteligente-v3/` (Next.js 16 + Vercel + Supabase Postgres).
> A v2 permanece como fallback/backup histórico. Os PDFs de fatura e dados
> financeiros continuam em `Downloads/` e `Downloads/01_Financeiro/Faturas/`.
>
> **Não use `iniciar.bat` para o fluxo mensal** — acesse a v3 pelo domínio
> na Vercel (ver `../fatura-inteligente-v3/README.md`).
>
> Leia este arquivo antes de qualquer tarefa. Ele contém todo o histórico de decisões, arquitetura e estado atual do sistema.

---

## 1. O QUE É O SISTEMA

Sistema de gestão de faturas de cartão de crédito com múltiplos responsáveis.
Processa PDFs de faturas mensalmente, atribui automaticamente cada compra ao responsável correto, exibe dashboard e gera resumos para envio via WhatsApp.

---

## 2. RESPONSÁVEIS

| Sigla | Nome           |
|-------|----------------|
| DA    | DONA ANA       |
| E     | ELSON          |
| H     | HOUSYVEL       |
| L     | LUIZ ACIDENTE  |
| MA    | MARCIA         |
| M     | MÃE            |
| P     | PAI            |
| A     | THATIANNE      |

---

## 3. REGRAS DE DIVISÃO

| Sigla | Nome                  | Divisão                              |
|-------|-----------------------|--------------------------------------|
| C     | COMBUSTÍVEL           | E → 34% / A → 66%                   |
| EMH   | ELSON+MARCIA+HOUSYVEL | E → 34% / MA → 33% / H → 33%       |
| EA    | ELSON+THATIANNE       | E → 50% / A → 50%                   |

---

## 4. CARTÕES

A lista de cartões é **dinâmica**, gerenciada via `localStorage` no navegador.
Seed inicial: `['ELO CAIXA', 'VISA CAIXA', 'MASTERCARD', 'AMEX', 'AMAZON', 'MERCADO PAGO', 'BTG']`
- O cartão é auto-detectado pelo nome do arquivo PDF no upload
- O usuário pode adicionar/remover cartões no painel ⚙ Config da interface

---

## 5. ARQUITETURA DO SISTEMA

### Fluxo completo
```
iniciar.bat (duplo clique)
    → mata processo anterior na porta 3000 (se houver)
    → inicia server.js (Node.js, porta 3000)
    → abre navegador em http://localhost:3000
    → server.js serve o index.html
    → usuário faz upload dos PDFs (drag & drop, cartão auto-detectado pelo nome)
    → server.js extrai texto do PDF localmente (zlib/FlateDecode, sem libs externas)
    → server.js chama Claude CLI via PowerShell: claude -p "prompt com texto extraído"
    → Claude CLI usa OAuth já configurado (sem API key, sem custo extra)
    → Claude retorna JSON com as compras
    → index.html aplica atribuição automática por histórico
    → usuário revisa pendentes e confirma
    → index.html envia dados para o Google Apps Script
    → Apps Script salva na planilha Google Sheets
```

### Arquivos do projeto
```
C:\Users\elson\OneDrive\Documentos\Projetos\FaturaInteligente\
    index.html      → interface gráfica completa (HTML + CSS + JS, arquivo único)
    server.js       → servidor Node.js local (sem dependências externas, ~260 linhas)
    iniciar.bat     → atalho para iniciar no Windows (CRLF obrigatório)
    CONTEXTO.md     → este arquivo
    diagnostico.bat → bat de diagnóstico que gera debug.log (útil para troubleshooting)
```

---

## 6. BANCO DE DADOS — GOOGLE SHEETS

**Planilha:** "Fatura Inteligente — Banco de Dados"
**ID:** `1uWLvOAjkqpi7QVblBYIiIiJiE8z8yrD0Qn43xcfOHuM`
**URL:** `https://docs.google.com/spreadsheets/d/1uWLvOAjkqpi7QVblBYIiIiJiE8z8yrD0Qn43xcfOHuM`

### Estrutura das abas

**`compras`** — banco principal, uma linha por compra:
```
Data | Descrição | Valor | Cartão | Responsável | Parcela Atual | Total Parcelas | Origem | Mês Ref
```

**`responsaveis`** — cadastro fixo dos 8 responsáveis (Sigla | Nome)

**`regras_divisao`** — as 3 regras de divisão com percentuais

**`historico_estabelecimentos`** — memória do sistema:
```
Estabelecimento | Responsável | Última Ocorrência | Total Ocorrências
```
Já populada com 120 estabelecimentos do mês de abril/2026.

**`totais_mes`** — totais calculados por mês e responsável:
```
Mês Ref | Responsável | Total Bruto | Total Líquido
```

---

## 7. GOOGLE APPS SCRIPT

Script instalado na planilha para receber dados do sistema via HTTP POST.
**Endpoint:** configurado no campo ⚙ dentro do index.html (salvo em localStorage).

O script:
- Cria uma aba nova para cada mês processado (ex: "2026-05")
- Insere cada compra como uma linha
- Atualiza o `historico_estabelecimentos` com novos estabelecimentos
- Recalcula os totais na aba `totais_mes`

---

## 8. LÓGICA DE ATRIBUIÇÃO AUTOMÁTICA

Cascata de prioridade aplicada a cada compra extraída:

```
1º — REGRA FIXA
     Descrição contém palavra-chave de uma regra?
     Ex: "SHELL", "POSTO", "PETROX" → C (combustível)

2º — PARCELA IDENTIFICADA
     Compra tem "XX/YY"? Busca a mesma no mês anterior
     e replica o responsável já atribuído

3º — HISTÓRICO
     Estabelecimento já apareceu em meses anteriores?
     Atribui o mesmo responsável da última ocorrência

4º — PENDENTE
     Nenhuma regra bateu → marcado como ⚠ pendente
     para atribuição manual na tela de revisão
```

A coluna `origem` registra como foi feita a atribuição:
- `regra` → regra fixa
- `historico` → encontrado no histórico
- `parcela` → parcela de compra anterior
- `manual` → atribuído manualmente pelo usuário

---

## 9. INTERFACE (index.html)

### Estética
- Tema dark financeiro: fundo `#07090f`
- Tipografia: DM Serif Display (títulos) + IBM Plex Mono (números) + DM Sans (UI)
- Cor de destaque: âmbar `#f59e0b`
- Cada responsável tem cor própria consistente em toda a interface

### 4 etapas da interface
1. **Upload PDFs** — drag & drop, cartão auto-detectado pelo nome do arquivo
2. **Processando** — barra de progresso por arquivo, chama server.js
3. **Revisão** — tabela completa com filtros, cards de resumo por responsável, botão salvar no Sheets
4. **Concluído** — confirmação e opção de iniciar novo mês

### Funcionalidades da tela de revisão
- Cards de total por responsável (com % do total)
- Tabela com colunas: Data | Descrição | Parcela | Cartão | Responsável | Origem | Valor
- Filtros por responsável, cartão, categoria e origem
- Busca por descrição
- Ordenação clicável em todas as colunas
- Dropdown de atribuição editável em cada linha
- Resumos individuais por pessoa com botão "Copiar para WhatsApp"

---

## 10. ESTADO ATUAL (maio/2026)

### ✅ Concluído
- [x] Interface gráfica completa (index.html)
- [x] Servidor local Node.js sem dependências (server.js)
- [x] Extração de texto PDF localmente via zlib (sem libs externas) — confirmado: extrai 21.950 chars da Amazon.pdf
- [x] Lista de cartões dinâmica com localStorage (seed + add/remove na UI)
- [x] Auto-detecção de cartão pelo nome do arquivo PDF
- [x] Gerenciador de cartões no painel Config
- [x] Atribuição automática por histórico
- [x] Planilha Google Sheets estruturada com 5 abas
- [x] Histórico de 120 estabelecimentos de abril/2026 importado
- [x] Google Apps Script configurado para receber dados
- [x] iniciar.bat com CRLF correto (problema de LF causava fechamento imediato)
- [x] Publicado no GitHub Pages: https://elsonbr2-sudo.github.io/fatura-inteligente/

### ✅ RESOLVIDO — autenticação (17/05/2026)

**Causa real:** o token OAuth do Claude CLI havia expirado (11/05/2026). Toda chamada — fosse direto no CMD, via subprocess, via PowerShell — retornava 401. O CLI **não renova automaticamente** o token em modo `-p`; precisa de re-login interativo.

**Diagnóstico feito (`diag-auth.bat`):**
- `claude -p "ok"` direto no CMD → falhou com `401 Invalid authentication credentials`
- Mesma falha em Node spawn (shell:true), PowerShell, e `cmd /c` — todos propagando o mesmo 401
- Token em `.credentials.json` confirmado expirado: `expiresAt: 2026-05-11T08:18:47Z`

**Solução aplicada:**
1. Re-autenticação manual no terminal: `claude /logout` → `claude` → login no browser
2. `server.js` atualizado com:
   - `statusTokenOAuth()` no startup: avisa em vermelho se o token está expirado/ausente, com instruções de re-auth
   - `chamarClaude()` detecta 401/`Failed to authenticate` em stdout ou stderr e retorna mensagem clara em vez de "Falha no Claude CLI (code 1)"
   - `$null | claude -p $p` no PowerShell + `stdio: ['ignore', 'pipe', 'pipe']` no spawn → elimina o warning "no stdin data received in 3s" e ganha ~3s por chamada

**O que aprendemos:**
- `claude.cmd` é um sub-batch: chamar de outro `.bat` sem `call` mata o script pai silenciosamente (descoberto ao corrigir o próprio `diag-auth.bat`)
- A CLI v2.x do Claude Code não tem refresh automático em modo `-p` mesmo com refreshToken presente — token expira em ~12h e exige login interativo periódico
- O subprocess do Node funciona perfeitamente para chamar `claude`; toda a perseguição anterior (PATH, encoding, TTY) era falso positivo

### 🔄 Manutenção contínua
- Token expira em ~12h. Quando aparecer o aviso de auth no startup do servidor, basta rodar `claude` no terminal e o login novo será automático
- Para verificar token a qualquer momento: rodar `verificar-auth.bat`
- Se vier a quebrar de novo, rodar `diag-auth.bat` para diagnóstico completo

### 💡 Plano B (não necessário agora)
- Migrar para `ANTHROPIC_API_KEY` em `config.json` (pago, ~R$0,01/fatura com Haiku) — eliminaria a necessidade de re-login periódico
- Implementar fallback automático: tenta CLI primeiro, se 401 cai pra API key

---

## 11. DECISÕES DE ARQUITETURA (e por quê)

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Node.js puro (sem libs) | Python + Flask | Node já instalado pelo Claude Code |
| Google Sheets como banco | SQLite local / Supabase | Gratuito, acessível de qualquer device, fácil de compartilhar |
| Claude CLI local (OAuth) | Anthropic API com chave | Zero custo adicional, usa assinatura Pro existente |
| Apps Script como ponte | Google Drive MCP / API Sheets | Gratuito, sem servidor, zero configuração de auth |
| HTML único sem framework | React / Vue | Sem build, abre direto no navegador, sem dependências |
| Extração PDF local (zlib) | Passar PDF para o Claude | `--file` requer session token não disponível em subprocess |
| CRLF no .bat via Python | Write tool direto | Write tool grava LF, CMD do Windows rejeita bat com LF |

---

## 12. COMANDOS ÚTEIS

```bash
# Iniciar o sistema
iniciar.bat   (duplo clique no Windows)

# Verificar token OAuth atual
node -e "var c=JSON.parse(require('fs').readFileSync(process.env.USERPROFILE+'/.claude/.credentials.json'));var o=c.claudeAiOauth;console.log('expires:',new Date(o.expiresAt).toISOString(),'expired:',o.expiresAt<Date.now())"

# Testar Claude CLI manualmente
claude -p "Olá, funcionando?"

# Verificar porta em uso
netstat -ano | findstr :3000

# Diagnóstico completo (gera debug.log na pasta)
diagnostico.bat  (duplo clique)
```

---

## 13. REFERÊNCIAS

- Planilha: https://docs.google.com/spreadsheets/d/1uWLvOAjkqpi7QVblBYIiIiJiE8z8yrD0Qn43xcfOHuM
- GitHub Pages: https://elsonbr2-sudo.github.io/fatura-inteligente/
- Sistema Base44 original: https://fatura-inteligente-copy-25279596.base44.app

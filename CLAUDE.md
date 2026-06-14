# Fatura Inteligente — handoff para Claude Code

## Antes de qualquer coisa
Leia `CONTEXTO.md` na raiz. Ele tem a arquitetura completa, decisões, banco de dados, regras de atribuição, e o histórico de problemas resolvidos.

## Estado atual (17/05/2026)

**Resolvido hoje:** autenticação do Claude CLI. Detalhes na seção 10 do `CONTEXTO.md`.

Resumo do que está funcionando:
- Extração local de PDF via `zlib/FlateDecode` (21.950 chars confirmados na Amazon.pdf)
- `server.js` chama o `claude` CLI via PowerShell (`$null | claude -p $p` para evitar warning de stdin)
- Startup do servidor já valida o token e mostra horas restantes
- Erro 401 detectado e devolve mensagem acionável de re-auth
- Planilha Google Sheets estruturada com 5 abas, Apps Script configurado

## Próximo passo imediato

Testar o fluxo end-to-end:
1. Duplo clique em `iniciar.bat`
2. Console deve mostrar `Token OAuth: valido (Xh restantes...)`
3. Subir um PDF de fatura na UI (http://localhost:3000)
4. Verificar se o Claude extrai as compras e a tela de revisão aparece com a tabela populada
5. Confirmar atribuição automática por histórico e enviar pro Google Sheets

## Manutenção contínua

- Token OAuth expira a cada ~12h. Quando o startup avisar, rode `claude` no terminal e faça login novo
- Se travar de novo, rode `diag-auth.bat` (gera `diag-auth.log` com 8 testes diferentes)
- Para check rápido: `verificar-auth.bat`

## Decisões já tomadas (não revisitar sem motivo)

| Tema | Decisão | Por quê |
|---|---|---|
| Backend | Node.js puro, sem dependências | Já instalado pelo Claude Code, deploy zero |
| Auth Claude | CLI local via OAuth (não API key) | Custo zero, usa assinatura Pro existente |
| Banco | Google Sheets via Apps Script | Gratuito, acessível de qualquer device |
| Frontend | HTML único, sem framework | Sem build, abre direto no browser |
| Extração PDF | zlib local | `--file` da CLI requer session token não disponível em subprocess |

## Arquivos relevantes

- `index.html` — UI completa (4 etapas: upload → processar → revisar → concluído)
- `server.js` — backend Node (~280 linhas), chamada ao Claude + extração PDF
- `iniciar.bat` — atalho de inicialização (CRLF obrigatório!)
- `CONTEXTO.md` — histórico completo e contexto de negócio
- `diag-auth.bat` / `verificar-auth.bat` — diagnóstico de autenticação

## Pegadinhas do Windows

- Todo `.bat` precisa ter CRLF (não LF). Use `sed -i 's/$/\r/' arquivo.bat` se editar via Linux/WSL
- `claude.cmd` é um sub-batch: se você chamar de outro `.bat`, use `call claude` ou o script pai morre silenciosamente
- O Write tool grava LF; depois de criar/editar um `.bat`, force CRLF

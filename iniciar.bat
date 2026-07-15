@echo off
title Fatura Inteligente v2 (CONGELADA)
cd /d "%~dp0"
echo.
echo  ============================================
echo   FATURA INTELIGENTE v2 -- CONGELADA
echo  ============================================
echo.
echo   Esta versao (v2) esta congelada desde jul/2026.
echo   Use a v3 (Next.js + Vercel) para o fluxo mensal.
echo.
echo   A v2 permanece como fallback/backup historico.
echo   Consulte ..\fatura-inteligente-v3\README.md
echo.
echo  ============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERRO: Node.js nao encontrado.
    echo  Instale em: https://nodejs.org
    pause
    exit /b
)

if not exist server.js (
    echo  ERRO: server.js nao encontrado.
    pause
    exit /b
)

echo  Acesse: http://localhost:3001
echo  Pressione Ctrl+C para encerrar.
echo.

start "" "http://localhost:3001"
node server.js

pause

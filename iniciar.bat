@echo off
title Fatura Inteligente v2
cd /d "%~dp0"
echo.
echo  === FATURA INTELIGENTE ===
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

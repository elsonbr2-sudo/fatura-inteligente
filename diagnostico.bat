@echo off
cd /d "%~dp0"
echo Diagnostico Fatura Inteligente > debug.log
echo Data/Hora: %date% %time% >> debug.log
echo. >> debug.log

echo [1] Verificando Node.js... >> debug.log
where node >> debug.log 2>&1
echo Node errorlevel: %errorlevel% >> debug.log

echo [2] Verificando server.js... >> debug.log
if exist server.js (echo server.js encontrado >> debug.log) else (echo server.js NAO encontrado >> debug.log)

echo [3] Verificando porta 3000... >> debug.log
netstat -ano | findstr ":3000" >> debug.log 2>&1

echo [4] Tentando iniciar o servidor... >> debug.log
echo (Aparecera uma janela do servidor) >> debug.log

echo Diagnostico salvo em debug.log
echo Abrindo log...
node server.js

echo. >> debug.log
echo Servidor encerrado - exit code: %errorlevel% >> debug.log
pause

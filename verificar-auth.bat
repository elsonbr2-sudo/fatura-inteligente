@echo off
chcp 65001 > nul
cd /d "%~dp0"
set LOG=verificar-auth.log

echo === VERIFICACAO POS RE-AUTH === > %LOG%
echo Data/Hora: %date% %time% >> %LOG%
echo. >> %LOG%

echo [1] Estado do token >> %LOG%
call node -e "try{var c=JSON.parse(require('fs').readFileSync(process.env.USERPROFILE+'/.claude/.credentials.json'));var o=c.claudeAiOauth;var msLeft=o.expiresAt-Date.now();var diasLeft=Math.round(msLeft/86400000);console.log('expiresAt:',new Date(o.expiresAt).toISOString());console.log('expired_now:',msLeft<0);console.log('dias_restantes:',diasLeft);}catch(e){console.log('ERRO:',e.message)}" >> %LOG% 2>&1
echo. >> %LOG%

echo [2] Teste claude -p (com stdin redirecionado para evitar warning de 3s) >> %LOG%
call claude -p "responda apenas a palavra: OK" < NUL >> %LOG% 2>&1
echo --- exit code: %errorlevel% --- >> %LOG%
echo. >> %LOG%

echo === FIM === >> %LOG%
type %LOG%
pause

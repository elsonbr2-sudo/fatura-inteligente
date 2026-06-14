@echo off
chcp 65001 > nul
cd /d "%~dp0"
set LOG=diag-auth.log
echo === DIAGNOSTICO AUTENTICACAO CLAUDE === > %LOG%
echo Data/Hora: %date% %time% >> %LOG%
echo. >> %LOG%

echo [1] Localizacao do claude CLI >> %LOG%
where claude >> %LOG% 2>&1
echo errorlevel: %errorlevel% >> %LOG%
echo. >> %LOG%

echo [2] Versao do claude CLI >> %LOG%
call claude --version >> %LOG% 2>&1
echo errorlevel: %errorlevel% >> %LOG%
echo. >> %LOG%

echo [3] Token OAuth status >> %LOG%
call node -e "try{var c=JSON.parse(require('fs').readFileSync(process.env.USERPROFILE+'/.claude/.credentials.json'));var o=c.claudeAiOauth;console.log('subscriptionType:',o.subscriptionType);console.log('expiresAt:',new Date(o.expiresAt).toISOString());console.log('expired_now:',o.expiresAt<Date.now());console.log('accessToken_prefix:',(o.accessToken||'').slice(0,15));console.log('refreshToken_present:',!!o.refreshToken);}catch(e){console.log('ERRO:',e.message)}" >> %LOG% 2>&1
echo. >> %LOG%

echo [4] Teste direto: call claude -p "responda apenas OK" >> %LOG%
echo --- stdout/stderr abaixo --- >> %LOG%
call claude -p "responda apenas OK" >> %LOG% 2>&1
echo --- exit code: %errorlevel% --- >> %LOG%
echo. >> %LOG%

echo [5] Teste via Node spawn (shell:true) >> %LOG%
call node -e "var cp=require('child_process');var p=cp.spawn('claude',['-p','responda apenas OK'],{shell:true,env:process.env});var o=[],e=[];p.stdout.on('data',d=>o.push(d));p.stderr.on('data',d=>e.push(d));p.on('close',c=>{console.log('exit:',c);console.log('stdout:',Buffer.concat(o).toString());console.log('stderr:',Buffer.concat(e).toString());});" >> %LOG% 2>&1
echo. >> %LOG%

echo [6] Teste via Node + PowerShell (replica do server.js) >> %LOG%
call node -e "var cp=require('child_process');var p=cp.spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','claude -p \"responda apenas OK\"'],{windowsHide:true,env:process.env});var o=[],e=[];p.stdout.on('data',d=>o.push(d));p.stderr.on('data',d=>e.push(d));p.on('close',c=>{console.log('exit:',c);console.log('stdout:',Buffer.concat(o).toString());console.log('stderr:',Buffer.concat(e).toString());});" >> %LOG% 2>&1
echo. >> %LOG%

echo [7] Teste via Node + cmd /c (alternativa com call) >> %LOG%
call node -e "var cp=require('child_process');cp.exec('call claude -p \"responda apenas OK\"',{env:process.env,maxBuffer:1024*1024,shell:'cmd.exe'},function(err,stdout,stderr){console.log('err:',err&&err.message);console.log('stdout:',stdout);console.log('stderr:',stderr);});" >> %LOG% 2>&1
echo. >> %LOG%

echo [8] PATH atual visto pelo Node >> %LOG%
call node -e "console.log(process.env.PATH)" >> %LOG% 2>&1
echo. >> %LOG%

echo. >> %LOG%
echo === FIM DO DIAGNOSTICO === >> %LOG%
echo.
echo Diagnostico salvo em diag-auth.log
echo.
type %LOG%
pause

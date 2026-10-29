@echo off
REM Starts CryptPilot: crypto-service (:8132), FinPilot backend (:8000), and frontend (:3000)
set ROOT=%~dp0

set VENV_PY=%ROOT%backend\.venv\Scripts\python.exe

start "CryptPilot Crypto Service (:8132)" cmd /k "cd /d %ROOT%crypto-service && "%VENV_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8132"
start "CryptPilot Backend (:8000)" cmd /k "cd /d %ROOT%backend && "%VENV_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
start "CryptPilot Frontend (:3000)" cmd /k "cd /d %ROOT%frontend && npx next dev -p 3000"

echo ===================================================
echo CryptPilot is starting!
echo Frontend:       http://localhost:3000
echo Backend API:    http://127.0.0.1:8000/docs
echo Crypto Service: http://127.0.0.1:8132/docs
echo ===================================================
exit /b 0

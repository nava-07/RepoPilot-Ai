@echo off
echo ======================================================================
echo                     RepoPilot AI - Launcher
echo ======================================================================
echo.

set PYTHON_CMD=C:\Users\navan\AppData\Local\Programs\Python\Python314\python.exe
if not exist "%PYTHON_CMD%" (
    set PYTHON_CMD=python
)

echo [1/3] Ensuring Ollama service is running...
tasklist /fi "imagename eq ollama.exe" 2>NUL | find /i "ollama.exe" >NUL
if "%ERRORLEVEL%"=="1" (
    echo Starting Ollama serve...
    start "Ollama Serve" /min "C:\Users\navan\AppData\Local\Programs\Ollama\ollama.exe" serve
    timeout /t 2 >NUL
) else (
    echo Ollama is already running.
)

echo [2/3] Starting Backend on http://127.0.0.1:8000 ...
start "RepoPilot Backend" cmd /k "cd backend && \"%PYTHON_CMD%\" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [3/3] Starting Frontend on http://127.0.0.1:5173 ...
start "RepoPilot Frontend" cmd /k "cd frontend && npm run dev"

timeout /t 3 >NUL

echo.
echo ======================================================================
echo RepoPilot AI is now active!
echo Configured Model: qwen3.5:4b
echo Frontend:         http://localhost:5173
echo Backend API Docs: http://localhost:8000/docs
echo ======================================================================
echo.

start http://localhost:5173
pause

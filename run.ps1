# RepoPilot AI - PowerShell Launcher

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "                     RepoPilot AI - Launcher" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Ensure Ollama service is running
$ollamaProc = Get-Process | Where-Object { $_.ProcessName -like "*ollama*" }
if (-not $ollamaProc) {
    Write-Host "[1/3] Starting Ollama server in background..." -ForegroundColor Yellow
    $ollamaBin = "C:\Users\navan\AppData\Local\Programs\Ollama\ollama.exe"
    if (Test-Path $ollamaBin) {
        Start-Process $ollamaBin -ArgumentList "serve" -WindowStyle Minimized
    } else {
        Start-Process "ollama" -ArgumentList "serve" -WindowStyle Minimized -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "[1/3] Ollama server is already running." -ForegroundColor Green
}

# 2. Start Backend
$pythonCmd = "C:\Users\navan\AppData\Local\Programs\Python\Python314\python.exe"
if (-not (Test-Path $pythonCmd)) {
    $pythonCmd = "python"
}
$repoRoot = $PSScriptRoot

Write-Host "[2/3] Starting Backend on http://127.0.0.1:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$repoRoot\backend'; & '$pythonCmd' -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

# 3. Start Frontend
Write-Host "[3/3] Starting Frontend on http://127.0.0.1:5173 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$repoRoot\frontend'; npm run dev"

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "RepoPilot AI is now active!" -ForegroundColor Cyan
Write-Host "Configured Model: qwen3.5:4b" -ForegroundColor Yellow
Write-Host "Frontend:         http://localhost:5173" -ForegroundColor Yellow
Write-Host "Backend Docs:     http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# Launch default browser to RepoPilot
Start-Process "http://localhost:5173"

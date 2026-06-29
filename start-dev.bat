@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   FlowCAD 3D - Dev Server Launcher
echo ============================================
echo.

REM --- Backend venv check ---
if not exist "apps\api\.venv\Scripts\python.exe" (
    echo [!] Python venv not found. Creating and installing dependencies...
    pushd apps\api
    python -m venv .venv
    .venv\Scripts\python -m pip install -r requirements.txt
    popd
)

REM --- Frontend deps check ---
if not exist "node_modules" (
    echo [!] node_modules not found. Running npm install...
    call npm install
)

echo [1/2] Starting Backend  -> http://localhost:8000/docs
start "FlowCAD API" cmd /k "cd /d "%~dp0apps\api" && .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000"

echo [2/2] Starting Frontend -> http://localhost:3000
start "FlowCAD Web" cmd /k "cd /d "%~dp0" && npm run dev:web"

echo.
echo Both servers are launching in separate windows.
echo   - API : http://localhost:8000/docs
echo   - Web : http://localhost:3000
echo.
echo Close those windows to stop the servers.
endlocal

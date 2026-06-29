@echo off
setlocal
title FlowCAD-3D Launcher

rem ============================================================
rem  FlowCAD-3D launcher
rem   - Backend : FastAPI (uvicorn) -> http://127.0.0.1:8000
rem   - Frontend: Next.js (dev)     -> http://localhost:3000
rem ============================================================

rem project root (strip trailing backslash)
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "PYTHON=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"

if not exist "%PYTHON%" (
    echo [ERROR] Python interpreter not found:
    echo         %PYTHON%
    echo         Please install Python 3.12.
    pause
    exit /b 1
)

rem --- install frontend deps if missing ---
if exist "%ROOT%\node_modules" goto deps_ok
echo [setup] node_modules missing, running npm install...
pushd "%ROOT%"
call npm install
if errorlevel 1 (
    popd
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
popd
:deps_ok

echo.
echo [start] Backend API on port 8000...
start "FlowCAD API" /d "%ROOT%\apps\api" cmd /k "%PYTHON%" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

echo [start] Frontend dev server on port 3000...
start "FlowCAD Web" /d "%ROOT%" cmd /k npm run dev:web

echo.
echo ============================================================
echo  Started!
echo    - API : http://127.0.0.1:8000
echo    - Web : http://localhost:3000
echo  Each server runs in its own window. Close it to stop.
echo ============================================================
echo.

timeout /t 6 >nul
start "" http://localhost:3000

endlocal

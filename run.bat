@echo off
title MarkLinker AI Startup
echo ===================================================
echo             MarkLinker AI Revision App
echo ===================================================
echo.
echo Installing/Verifying Python dependencies...
python -m pip install flask pymupdf flask-cors
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Failed to install Python dependencies. Please verify Python is in PATH.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Starting Flask backend...
start "MarkLinker AI Backend" python backend/app.py

echo.
echo Waiting for backend server to start...
ping -n 3 127.0.0.1 > nul

echo.
echo Opening browser to http://127.0.0.1:5000/
start http://127.0.0.1:5000/

echo.
echo ===================================================
echo  MarkLinker AI is running at http://127.0.0.1:5000/
echo  Close this terminal window to stop the application.
echo ===================================================
echo.
pause

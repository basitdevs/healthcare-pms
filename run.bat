@echo off
REM One-step start (Windows): install, create the database, build, start and open the app.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20+ is required: https://nodejs.org & pause & exit /b 1)
if not exist node_modules call npm install || exit /b 1
if not exist healthcare.db call npm run db:init || exit /b 1
if not exist .next\BUILD_ID call npm run build || exit /b 1
echo Starting on http://localhost:3000 (Ctrl+C to stop)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start

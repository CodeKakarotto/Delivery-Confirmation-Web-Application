@echo off
REM Michael's Flowers Delivery Confirmation - one-click start (Windows).
REM Double-click this file. It sets things up the first time, starts the two servers in their own windows,
REM and opens the app in your browser. To stop the app, close the two server windows.
setlocal
cd /d "%~dp0"
title Michael's Flowers - starting

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing packages, this takes a minute...
  call npm install --no-audit --no-fund || goto :failed
)

if not exist .dev.vars (
  echo Creating local settings file .dev.vars ...
  node -e "require('fs').writeFileSync('.dev.vars','APP_ENV=development\nAPP_SECRET='+require('crypto').randomBytes(32).toString('hex')+'\n')" || goto :failed
)

if not exist .wrangler\state\v3\d1 (
  echo First run: creating the local database with synthetic demo orders...
  call npm run db:setup:local || goto :failed
)

echo Backing up the database (keeps the last 30 copies in the backups folder)...
set backup_ok=1
call npm run db:backup:local
if errorlevel 1 (
  set backup_ok=0
  echo.
  echo WARNING: the backup did not work. The app will still start. Tell whoever looks after this computer.
  echo.
)

echo Updating the local database...
call npm run db:migrate:local
if "%backup_ok%"=="1" (
  echo Removing deliveries older than 30 days...
  call npm run db:retention:local
) else (
  echo Skipping the 30-day cleanup because the backup did not work.
)
echo Checking sign-in accounts...
call npm run users:demo

echo Adding today's demo orders (only ones that are not there yet)...
call npm run db:demo-today:local >nul 2>nul

echo Starting the API and the website in two new windows...
start "Michael's Flowers API (close to stop)" cmd /k npm run dev:api
start "Michael's Flowers Website (close to stop)" cmd /k npm run dev:web

echo Waiting for the app to be ready...
set /a tries=0
:wait
curl -s -o nul -f http://localhost:5173/api/health
if not errorlevel 1 goto :ready
set /a tries+=1
if %tries% geq 90 (
  echo The app did not start within 90 seconds. Check the two server windows for errors.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :wait

:ready
start "" http://localhost:5173
echo The app is open at http://localhost:5173
echo Close the two server windows to stop it.
echo Sign-in details are in demo-accounts.local.txt
pause
exit /b 0

:failed
echo Setup failed. See the messages above.
pause
exit /b 1

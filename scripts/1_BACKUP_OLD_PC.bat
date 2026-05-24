@echo off
setlocal enabledelayedexpansion
title Catherine - Backup Old PC Data

echo.
echo =====================================================
echo   CATHERINE PHOTO BOOTH - OLD PC BACKUP TOOL
echo =====================================================
echo.
echo This will back up your MongoDB PhotoBooth database.
echo Run this on your OLD PC before moving to the new one.
echo.

:: ── Find mongodump.exe ──────────────────────────────────────
set "MONGODUMP="

:: Check MongoDB Tools (common paths)
if exist "C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe" (
    set "MONGODUMP=C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe"
    goto :found_mongodump
)
if exist "C:\Program Files\MongoDB\Server\8.3\bin\mongodump.exe" (
    set "MONGODUMP=C:\Program Files\MongoDB\Server\8.3\bin\mongodump.exe"
    goto :found_mongodump
)
if exist "C:\Program Files\MongoDB\Server\7.0\bin\mongodump.exe" (
    set "MONGODUMP=C:\Program Files\MongoDB\Server\7.0\bin\mongodump.exe"
    goto :found_mongodump
)

:: Try PATH
where mongodump >nul 2>&1
if not errorlevel 1 (
    set "MONGODUMP=mongodump"
    goto :found_mongodump
)

:: Not found – need to download MongoDB Database Tools
echo [!] mongodump.exe not found.
echo     MongoDB Database Tools is not installed.
echo     Downloading it now (this is a small ~50MB tool package)...
echo.

set "TOOLS_URL=https://fastdl.mongodb.org/tools/db/mongodb-database-tools-windows-x86_64-100.10.0.zip"
set "TOOLS_ZIP=%TEMP%\mongodb-tools.zip"
set "TOOLS_DIR=%TEMP%\mongodb-tools"

powershell -NoProfile -Command "Invoke-WebRequest -Uri '%TOOLS_URL%' -OutFile '%TOOLS_ZIP%' -UseBasicParsing"
if errorlevel 1 (
    echo [ERROR] Failed to download MongoDB Tools. Check your internet connection.
    pause & exit /b 1
)

powershell -NoProfile -Command "Expand-Archive -Path '%TOOLS_ZIP%' -DestinationPath '%TOOLS_DIR%' -Force"
for /r "%TOOLS_DIR%" %%f in (mongodump.exe) do set "MONGODUMP=%%f"

if not defined MONGODUMP (
    echo [ERROR] Could not find mongodump.exe after extraction.
    pause & exit /b 1
)

:found_mongodump
echo [OK] Found mongodump at: %MONGODUMP%
echo.

:: ── Where to save the backup ────────────────────────────────
set "BACKUP_DIR=%USERPROFILE%\Desktop\Catherine-MongoDB-Backup"
echo Backup will be saved to:
echo   %BACKUP_DIR%
echo.
echo Press ENTER to use this location, or type a different path:
set /p "CUSTOM_DIR=Path (leave blank for default): "
if not "!CUSTOM_DIR!"=="" set "BACKUP_DIR=!CUSTOM_DIR!"

if not exist "!BACKUP_DIR!" mkdir "!BACKUP_DIR!"

:: ── Run the backup ──────────────────────────────────────────
echo.
echo [>>] Backing up MongoDB database: PhotoBooth
echo      From: mongodb://localhost:27017
echo      To:   !BACKUP_DIR!
echo.

"%MONGODUMP%" --uri="mongodb://localhost:27017" --db=PhotoBooth --out="!BACKUP_DIR!" --gzip

if errorlevel 1 (
    echo.
    echo [ERROR] Backup FAILED. Make sure MongoDB is running:
    echo         net start MongoDB
    pause & exit /b 1
)

echo.
echo =====================================================
echo   BACKUP COMPLETE!
echo =====================================================
echo.
echo Your database has been exported to:
echo   !BACKUP_DIR!\PhotoBooth\
echo.
echo NEXT STEPS:
echo   1. Copy the folder "!BACKUP_DIR!" to a USB drive
echo      or upload it to Google Drive / cloud storage
echo   2. On your NEW PC, run:   2_SETUP_NEW_PC.ps1
echo   3. When prompted, point to this backup folder
echo.
echo Files saved:
dir "!BACKUP_DIR!\PhotoBooth\" 2>nul
echo.
pause

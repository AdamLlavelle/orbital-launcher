@echo off
cd /d "%~dp0"
start "" /min cmd /c "npx electron . > %USERPROFILE%\feather-launcher.log 2>&1"

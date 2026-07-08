@echo off
set SRC=%APPDATA%\.orbitallauncher
set DST=%~dp0debug-logs
if not exist "%DST%" mkdir "%DST%"
copy /Y "%SRC%\logs\latest.log" "%DST%\latest.log" >nul 2>&1
for /f "delims=" %%F in ('dir /b /o-d "%SRC%\crash-reports" 2^>nul') do (
  copy /Y "%SRC%\crash-reports\%%F" "%DST%\newest-crash.txt" >nul 2>&1
  goto done
)
:done
copy /Y "%SRC%\logs\debug.log" "%DST%\debug.log" >nul 2>&1
echo done > "%DST%\marker.txt"

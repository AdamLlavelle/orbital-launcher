@echo off
rem Imports worlds, servers, settings, packs and map data from the old
rem .minecraft folder (used by the original Feather launcher) into the
rem Feather Launcher game folder. Safe to re-run; never overwrites newer files.
set SRC=%APPDATA%\.minecraft
set DST=%APPDATA%\.orbitallauncher
set LOG=%~dp0import-log.txt

echo Import started %date% %time% > "%LOG%"

for %%D in (saves resourcepacks shaderpacks screenshots config xaero schematics .bobby) do (
  if exist "%SRC%\%%D" robocopy "%SRC%\%%D" "%DST%\%%D" /E /XO /NFL /NDL /NJH >> "%LOG%" 2>&1
)

robocopy "%SRC%" "%DST%" servers.dat servers.dat_old options.txt optionsof.txt optionsshaders.txt sodium-options.json sodium-extra-options.json sodium-extra.properties iris.properties modmenu.json nvidium-config.json moreculling.toml indium-renderer.properties fabricskyboxes-config.json usercache.json /XO /NFL /NDL /NJH >> "%LOG%" 2>&1

echo Import finished %date% %time% >> "%LOG%"
echo done > "%~dp0import-done.txt"

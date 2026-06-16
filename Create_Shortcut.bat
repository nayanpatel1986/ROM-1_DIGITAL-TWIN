@echo off
title Create Desktop Shortcut
color 0A
cd /d "%~dp0"

echo Creating Desktop Shortcut for ROM-I EDR Dashboard...
echo.

powershell -NoProfile -Command "$WshShell = New-Object -ComObject WScript.Shell; $ShortcutPath = [System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'ROM-I EDR Dashboard.lnk'); $Shortcut = $WshShell.CreateShortcut($ShortcutPath); $Shortcut.TargetPath = '%cd%\Launch_EDR.bat'; $Shortcut.WorkingDirectory = '%cd%'; $Shortcut.IconLocation = '%cd%\rig_icon.ico'; $Shortcut.Save()"

if %ERRORLEVEL% equ 0 (
    echo ==========================================================
    echo SUCCESS: Desktop Shortcut 'ROM-I EDR Dashboard' created!
    echo ==========================================================
) else (
    echo ERROR: Failed to create shortcut.
)
echo.
pause

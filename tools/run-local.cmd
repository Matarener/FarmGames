@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo Ферма: http://localhost:8080  (закройте окно, чтобы остановить)
start "" http://localhost:8080/?debug
where py >nul 2>nul && (py -m http.server 8080 & exit /b)
where python >nul 2>nul && (python -m http.server 8080 & exit /b)
where npx >nul 2>nul && (npx --yes serve -l 8080 . & exit /b)
echo Не найден ни Python, ни Node.js. Установите один из них.
pause

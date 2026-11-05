@echo off
chcp 65001 >nul
cd /d "%~dp0.."
where node >nul 2>nul || (echo Нужен Node.js: https://nodejs.org & pause & exit /b 1)
if not exist node_modules\esbuild call npm install
call node tools\build.mjs || (pause & exit /b 1)
echo Готово. Открываю dist\index.html (работает и без сервера).
start "" "%cd%\dist\index.html"

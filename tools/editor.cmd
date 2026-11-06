@echo off
chcp 65001 >nul
cd /d "%~dp0.."
rem Редактор карты: только на этом компьютере. Нужен Node.js (сохранение пишет assets\map.json).
where node >nul 2>nul || (echo Для редактора нужен Node.js: https://nodejs.org & pause & exit /b)
echo Редактор карты: http://localhost:8080/editor  (закройте окно, чтобы остановить)
start "" http://localhost:8080/editor
node tools\serve.mjs . 8080

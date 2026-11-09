@echo off
chcp 65001 >nul
cd /d "%~dp0.."
rem Картинки через Codex по подписке ChatGPT. Пример: tools\gen-art.cmd tools\gen-art\jobs.example.json ui_hints
rem Нужны: Node.js, Codex CLI (npm i -g @openai/codex, затем codex login), Python с numpy, pillow, scipy.
where node >nul 2>nul || (echo Нужен Node.js: https://nodejs.org & pause & exit /b)
if "%~1"=="" (node tools\gen-art\gen_art.mjs tools\gen-art\jobs.json) else (node tools\gen-art\gen_art.mjs %*)
pause

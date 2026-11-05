@echo off
rem Подтягивает в локальный git коммиты, которые Claude кладёт в .history\farm.bundle.
rem Файлы проекта уже лежат в папке, поэтому меняется только история (HEAD и индекс).
chcp 65001 >nul
cd /d "%~dp0.."
where git >nul 2>nul || (echo Git не найден. Установите Git for Windows: https://git-scm.com/download/win & pause & exit /b 1)
if not exist .git (
  git init -q -b main
  echo Создан локальный репозиторий.
)
git fetch -q .history\farm.bundle main || (echo Не удалось прочитать .history\farm.bundle & pause & exit /b 1)
git reset -q FETCH_HEAD
echo.
git log --oneline -10
echo.
git status --short
pause

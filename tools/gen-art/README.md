# Картинки через Codex (подписка ChatGPT)

Скрипт запускает официальный Codex CLI без участия человека (`codex exec`) и рисует картинки
встроенным инструментом Codex (gpt-image). Это тратит лимиты подписки ChatGPT, а не деньги API.

## Один раз

1. Node.js и Python с `pip install numpy pillow scipy` (уже нужны для нарезки).
2. `npm i -g @openai/codex`
3. `codex login` → **Sign in with ChatGPT** (не ключом API). Проверка: `codex login status`
   должен написать «Logged in using ChatGPT».
4. Переменная `OPENAI_API_KEY` скрипту не мешает: он её убирает, чтобы Codex не ушёл в платный API.

## Задания

Файл JSON со списком (пример — `jobs.example.json`):

| Поле | Что |
|---|---|
| `name` | имя листа по правилам `assets/README.md` (`tree_walnut`, `ui_hints`) |
| `prompt` | что нарисовать (по-английски, как в `art-prompts-*.md`) |
| `refs` | картинки-образцы стиля из репозитория, например `assets/source/ui_menu1.png` |
| `size` | `1024x1024`, `1536x1024`, `1024x1536` (по умолчанию `1536x1024`) |
| `count` | сколько вариантов (каждый — отдельный запуск Codex) |
| `key` | цвет фона для вырезания: `magenta` (по умолчанию) или `green`, или `#RRGGBB` |
| `replace` | `true` — первый вариант заменит `assets/source/<name>.png`; иначе пишется `<name>_2.png` … |

Фон: gpt-image в Codex не умеет прозрачный фон, поэтому скрипт просит залить фон чистым
пурпурным и потом вырезает его (`key_bg.py`, с очисткой каймы). Для розовых/фиолетовых объектов
ставьте `"key": "green"`.

## Запуск

```
tools\gen-art.cmd tools\gen-art\jobs.example.json ui_hints          # одно задание
node tools/gen-art/gen_art.mjs jobs.json --count 3                   # все, по 3 варианта
node tools/gen-art/gen_art.mjs jobs.json tree_cherry --slice         # и сразу нарезать
node tools/gen-art/gen_art.mjs jobs.json --dry                       # только показать промпты
```

Результат: `assets/source/<name>.png` (прозрачный PNG). Сырые картинки, промпт и лог Codex —
в `.gen-art/<name>/` (не в git). `--slice` запускает `python tools/slice_art.py <name>`: лист
должен быть описан в `slice_art.py`, как обычно.

Одна картинка — 30–90 секунд. Картинки съедают лимит подписки в 3–5 раз быстрее текста; если лимит
кончился, Codex напишет «usage limit», задания можно продолжить позже (готовые не повторяются,
если запускать по именам).

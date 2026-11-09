# Картинки игры

```
assets/source/   листы художника (PNG). В игру не попадают, из них нарезаются картинки
assets/art/      картинки игры (WebP) + manifest.json (размер и точка опоры) + icons.json
assets/map.json  стартовая карта (редактор карты)
```

Игра загружает **все** картинки из `manifest.json` и `icons.json` и открывается только после этого.
Поэтому лишняя картинка в `assets/art` — это лишнее время загрузки: неиспользуемые надо удалять
вместе с записью в манифесте.

## Имена

| Что | Имя картинки | Пример |
|---|---|---|
| дерево | `tree_<вид>` | `tree_oak`, `tree_cherry` |
| куст | `bush_<вид>` | `bush_lavender` |
| без плодов (после сбора) | `<имя>_bare` | `tree_cherry_bare` (цветёт), `bush_raspberry_bare` |
| молодое растение | `<имя>_young` | `tree_maple_young` |
| пень срубленного дерева | `stump_<вид>` | `stump_cherry`, `stump_oak_moss` (мшистый дубовый) |
| росток посаженного растения | `sprout_tree`, `sprout_bush` | |
| камень / валун | `rock`, `rock_small` / `boulder`, `boulder_moss` | |
| дикая высокая трава | `grass_tall_<n>` | `grass_tall_0` |
| урожай на грядке | `crop_<культура>_<стадия 0–3>` | `crop_carrot_3` |
| плитки земли | `tile_grass`, `tile_grass_2`, `tile_grass_flowers`, `tile_grass_flowers_2` | |
| дорожки | `tile_path_<вид>`, `tile_path_<вид>_2` (у «Тропинки» — `tile_path`, `tile_path_2`) | `tile_path_cobble` |
| камни для «камней в траве» | лист `path_stones.png` (6 камней) → `tile_path_stones`, `tile_path_stones_2` | |
| травяной край дорожек | `path_edge_<сторона>`, `path_corner_<вершина>_<вид>` (делает `tools/path_tiles.py`) | `path_corner_n_out` |
| переход между видами дорожек | `blend_<вид дорожки>_edge_<сторона>`, `blend_<вид дорожки>_corner_<вершина>_<вид>` (тоже `path_tiles.py`) | `blend_path_cobble_edge_nw` |
| грядка | `bed_dry`, `bed_wet` | |
| пруд целиком (одна картинка на пруд) | `pond_<вид>` (делает `tools/pond_art.py`) | `pond_round`, `pond_big` |
| камыши и кувшинки у прудов | `pond_<что>` | `pond_lily`, `pond_cattail` |
| дом, колодец | `house_<уровень>`, `well_broken`, `well_fixed` | |
| туман | `fog_clouds_<n>`, `fog_strips_<n>`, `fog_wisps_<n>` | |
| иконка интерфейса | `ic_<имя>` | `ic_coin`, `ic_sap_oak` |

`<вид>` — ключ из `FLORA` в `src/game/data.js` (oak, birch, sakura, cherry, maple, apple, pine, linden,
blueberry, raspberry, rosehip, hydrangea, lavender, rose), `<культура>` — ключ из `CROPS`.
Картинки деревьев и кустов игра находит по этим именам сама: новый вид — это строка в `FLORA` и
картинки `tree_<вид>` (или `bush_<вид>`), `_young`, при сборе плодов — `_bare`, у дерева — `stump_<вид>`.

Листы в `assets/source`: лист с одной картинкой называется так же, как картинка
(`tree_apple_bare.png`, `house_3.png`); листы с несколькими — по содержимому (`stumps.png`,
`well.png`, `ui_menu1.png`). Что на каком листе и в каком порядке, записано
в `tools/slice_art.py` (SHEETS, SINGLE, CROPS, ICON_SHEETS, …).

Деревья, камни, кусты, каждая стадия урожая (`crop_<культура>_<стадия>.png`) и плитки земли — по одному
объекту на картинку: на общих листах «пиксели» стиля выходили крупными и в игре было видно ступеньки.

Трава бесшовная: `tools/grass_tiles.py` собирает из `tile_grass.png` и `tile_grass_flowers.png` четыре
плитки с одинаковой каймой у краёв (любые две рядом стыкуются), цветы с второй картинки накладываются
поверх. Поэтому плитки травы в игре не отзеркаливаются: у зеркальной другой край, будет шов.

Дорожки (виды — `PATHS` в `src/game/data.js`) тоже бесшовные: `tools/path_tiles.py` делает из картинки-ромба
`tile_path_<вид>.png` две плитки с общей каймой (без отражений: у досок направление и у камней свет должны
совпадать). «Камни в траве» — трава плюс камни с `path_stones.png` посередине клетки (`PATH_STONES` в
`slice_art.py`). Травяной край у дорожек — 20 кусков `path_edge_*`/`path_corner_*`, игра склеивает их по
соседям клетки (`Farm.pathEdgeOf`). На стыке двух видов вид выше по слою (`layer` в `PATHS`) заходит на
нижний: камни тропинки и булыжника ложатся на соседа целыми камнями с тенью, настил — ровным краем с тенью.
Это тоже по 20 кусков на вид, `blend_<вид>_*` (`BLEND` в `path_tiles.py`), у песка их нет: он самый нижний.
Новый вид дорожки: строка в `PATHS` (со своим `layer`), картинка `tile_path_<вид>.png`, строка в `PATH_TILES`
(`slice_art.py`), если вид заходит на нижние — строка в `BLEND`, и `python tools/slice_art.py tiles`.

Пруды (виды — `PONDS` в `src/game/data.js`: форма клетками, камыши и камни у берега) — по одной картинке на
пруд, её собирает `tools/pond_art.py`: вода — текстура художника `assets/source/tex_water.png`, трава вокруг —
та же бесшовная трава, что у плиток земли, кувшинки и листья — `pond_lily`, `pond_leaves` (`FLOATS` в
`pond_art.py`). Вода чуть ниже земли: у дальнего берега земляная стенка с тенью, у ближнего — пена.
Опора картинки — середина прямоугольника клеток пруда. Новый вид пруда: строка в `PONDS`, строка в `FLOATS`
и `python tools/pond_art.py <вид>` (`--preview` — ещё и картинки для проверки в `.pond-art/`: пруд на траве
с сеткой клеток и точками камышей). Нарисованную художником картинку пруда можно положить вместо собранной:
`assets/source/pond_<вид>.png` той же формы и с той же опорой.

Опора кустов — центр ромба, нижний угол которого — низ земляного блока под кустом (иначе куст стоит
ниже своей клетки).

## Как нарезать

Нужен Python с numpy, Pillow и scipy (`pip install numpy pillow scipy`).

```
python tools/slice_art.py                   # всё: картинки, manifest.json, иконки, icons.json
python tools/slice_fog.py                   # облака тумана (дописывает manifest.json)
python tools/pond_art.py                    # пруды (дописывает manifest.json)

python tools/slice_art.py tree_apple_bare   # только эти листы (остальное в манифесте не трогается)
python tools/slice_art.py tiles             # только плитки земли
python tools/cut_grass_base.py assets/source/grass_tall_raw.png assets/source/grass_tall.png
```

Полная нарезка `slice_art.py` пишет `manifest.json` заново, поэтому после неё всегда запускайте
`slice_fog.py` и `pond_art.py`. `tools/cut_bush_base.py` (срезать земляной блок у кустов) сейчас **не запускать**:
у новых кустов (2026-11-07) основание оставлено как есть, его, возможно, перерисуют позже. Высокую траву сначала чистит `cut_grass_base.py`
(`grass_tall_raw.png` → `grass_tall.png`), потом её режет `slice_art.py`.

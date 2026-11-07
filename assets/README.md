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
| плитки земли | `tile_grass`, `tile_grass_flowers`, `tile_path` | |
| грядка | `bed_dry`, `bed_wet` | |
| вода и пруд | `tex_water` (текстура), `pond_<что>` | `pond_lily` |
| дом, колодец | `house_<уровень>`, `well_broken`, `well_fixed` | |
| туман | `fog_clouds_<n>`, `fog_strips_<n>`, `fog_wisps_<n>` | |
| иконка интерфейса | `ic_<имя>` | `ic_coin`, `ic_sap_oak` |

`<вид>` — ключ из `FLORA` в `src/game/data.js` (oak, birch, sakura, cherry, maple, apple, pine,
blueberry, raspberry, rosehip, hydrangea, lavender, rose), `<культура>` — ключ из `CROPS`.
Картинки деревьев и кустов игра находит по этим именам сама: новый вид — это строка в `FLORA` и
картинки `tree_<вид>` (или `bush_<вид>`), `_young`, при сборе плодов — `_bare`, у дерева — `stump_<вид>`.

Листы в `assets/source`: лист с одной картинкой называется так же, как картинка
(`tree_apple_bare.png`, `house_3.png`); листы с несколькими — по содержимому (`trees.png`,
`bushes.png`, `crop_corn.png`, `ui_menu1.png`). Что на каком листе и в каком порядке, записано
в `tools/slice_art.py` (SHEETS, SINGLE, CROPS, ICON_SHEETS, …).

## Как нарезать

Нужен Python с numpy, Pillow и scipy (`pip install numpy pillow scipy`).

```
python tools/slice_art.py                   # всё: картинки, manifest.json, иконки, icons.json
python tools/slice_fog.py                   # облака тумана (дописывает manifest.json)
python tools/cut_bush_base.py               # срезать земляной блок у кустов (bush_*.webp, на месте)

python tools/slice_art.py tree_apple_bare   # только эти листы (остальное в манифесте не трогается)
python tools/cut_grass_base.py assets/source/grass_tall_raw.png assets/source/grass_tall.png
```

Полная нарезка `slice_art.py` пишет `manifest.json` заново, поэтому после неё всегда запускайте
`slice_fog.py` и `cut_bush_base.py`. Высокую траву сначала чистит `cut_grass_base.py`
(`grass_tall_raw.png` → `grass_tall.png`), потом её режет `slice_art.py`.

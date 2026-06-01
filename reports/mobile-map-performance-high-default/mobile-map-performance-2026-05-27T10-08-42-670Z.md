# Mobile Map Performance Audit

- Base URL: http://127.0.0.1:4173/xingyin-pokemon-game
- Map quality: high (default)
- Maps tested: 9 (GodotMap, GodotMapV2, GodotMapV2_MistLake, GodotMapV2_FarmTown, GodotMapV2_PirateShore, GodotMapV2_Graveyard, GodotMapV2_HexRuins, GodotMapV2_SurvivalRidge, GodotMapV2_BossHighland)
- Devices: iphone_se, iphone_14, android_mid, ipad_mini
- Sample: warmup 1800ms, measure 5000ms, CPU throttle on
- Raw JSON: reports/mobile-map-performance-high-default/mobile-map-performance-2026-05-27T10-08-42-670Z.json

| Status | Device | Map | Quality | Ready ms | Avg FPS | P10 FPS | >50ms Frames | Long Tasks | Draw Calls | Triangles | 3D Assets | Asset Failures | Transfer |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| FAIL | iphone_se | 新手山谷 | - | - | - | - | - | - | - | - | - | 0 | - |
| FAIL | iphone_se | 星音草径 | - | - | - | - | - | - | - | - | - | 0 | - |
| FAIL | iphone_se | 雾湖苇岸 | - | - | - | - | - | - | - | - | - | 0 | - |
| FAIL | iphone_se | 风车农庄 | high | 3498 | 10.6 | 8.1 | 52 | 0 | 87 | 29696 | 74 | 0 | 0 KB |
| FAIL | iphone_se | 贝壳海岸 | high | 3279 | 7.6 | 5.5 | 37 | 0 | 96 | 189986 | 67 | 0 | 0 KB |
| FAIL | iphone_se | 月影墓园 | high | 3191 | 9.2 | 6.0 | 44 | 0 | 80 | 43621 | 71 | 0 | 0 KB |
| FAIL | iphone_se | 六角遗迹 | high | 3216 | 9.0 | 7.0 | 41 | 1 | 93 | 167020 | 73 | 0 | 0 KB |
| FAIL | iphone_se | 铁木营地 | high | 3240 | 10.0 | 8.0 | 46 | 1 | 110 | 140916 | 73 | 0 | 0 KB |
| FAIL | iphone_se | 星雾高地 | high | 3206 | 7.8 | 6.0 | 35 | 1 | 109 | 162320 | 64 | 0 | 0 KB |
| FAIL | iphone_14 | 新手山谷 | high | 3599 | 15.0 | 11.9 | 61 | 0 | 105 | 88106 | 48 | 0 | 0 KB |
| FAIL | iphone_14 | 星音草径 | high | 3302 | 6.2 | 4.8 | 30 | 0 | 106 | 114450 | 60 | 0 | 0 KB |
| FAIL | iphone_14 | 雾湖苇岸 | high | 3235 | 5.8 | 5.0 | 25 | 1 | 102 | 105370 | 62 | 0 | 0 KB |
| FAIL | iphone_14 | 风车农庄 | high | 3326 | 3.8 | 3.1 | 17 | 0 | 76 | 27358 | 74 | 0 | 0 KB |
| FAIL | iphone_14 | 贝壳海岸 | high | 3227 | 3.7 | 3.1 | 18 | 0 | 97 | 189998 | 67 | 0 | 0 KB |
| FAIL | iphone_14 | 月影墓园 | high | 3228 | 5.1 | 3.8 | 23 | 0 | 71 | 41367 | 71 | 0 | 0 KB |
| FAIL | iphone_14 | 六角遗迹 | high | 3321 | 5.0 | 4.6 | 21 | 1 | 95 | 167068 | 73 | 0 | 0 KB |
| FAIL | iphone_14 | 铁木营地 | high | 4540 | 5.7 | 5.2 | 25 | 1 | 109 | 140904 | 73 | 0 | 0 KB |
| FAIL | iphone_14 | 星雾高地 | high | 3858 | 4.6 | 3.9 | 19 | 1 | 110 | 162344 | 64 | 0 | 0 KB |
| FAIL | android_mid | 新手山谷 | high | 5465 | 17.8 | 11.0 | 39 | 0 | 106 | 88018 | 48 | 0 | 0 KB |
| FAIL | android_mid | 星音草径 | high | 4979 | 7.3 | 5.2 | 35 | 0 | 106 | 114450 | 60 | 0 | 0 KB |
| FAIL | android_mid | 雾湖苇岸 | high | 4830 | 6.2 | 4.4 | 27 | 1 | 98 | 104606 | 62 | 0 | 0 KB |
| FAIL | android_mid | 风车农庄 | high | 4860 | 5.7 | 3.5 | 27 | 0 | 74 | 27274 | 74 | 0 | 0 KB |
| FAIL | android_mid | 贝壳海岸 | high | 4888 | 4.9 | 3.0 | 23 | 0 | 96 | 189986 | 67 | 0 | 0 KB |
| FAIL | android_mid | 月影墓园 | high | 4830 | 6.9 | 4.3 | 34 | 0 | 75 | 41449 | 71 | 0 | 0 KB |
| FAIL | android_mid | 六角遗迹 | high | 4872 | 6.8 | 4.8 | 30 | 1 | 94 | 167044 | 73 | 0 | 0 KB |
| FAIL | android_mid | 铁木营地 | high | 5813 | 7.7 | 5.5 | 35 | 1 | 108 | 140880 | 73 | 0 | 0 KB |
| FAIL | android_mid | 星雾高地 | high | 5854 | 5.3 | 4.1 | 23 | 1 | 109 | 162320 | 64 | 0 | 0 KB |
| FAIL | ipad_mini | 新手山谷 | high | 2814 | 14.7 | 11.7 | 68 | 0 | 104 | 87862 | 48 | 0 | 0 KB |
| FAIL | ipad_mini | 星音草径 | high | 2656 | 5.1 | 3.3 | 24 | 0 | 106 | 114450 | 60 | 0 | 0 KB |
| FAIL | ipad_mini | 雾湖苇岸 | high | 2648 | 3.6 | 3.4 | 15 | 1 | 103 | 105152 | 62 | 0 | 0 KB |
| FAIL | ipad_mini | 风车农庄 | high | 2640 | 3.4 | 2.9 | 16 | 0 | 80 | 27496 | 74 | 0 | 0 KB |
| FAIL | ipad_mini | 贝壳海岸 | high | 2626 | 3.2 | 2.5 | 15 | 0 | 97 | 189998 | 67 | 0 | 0 KB |
| FAIL | ipad_mini | 月影墓园 | high | 2612 | 3.7 | 2.6 | 18 | 0 | 71 | 41367 | 71 | 0 | 0 KB |
| FAIL | ipad_mini | 六角遗迹 | high | 2696 | 3.8 | 3.2 | 16 | 1 | 93 | 167020 | 73 | 0 | 0 KB |
| FAIL | ipad_mini | 铁木营地 | high | 3668 | 3.8 | 3.6 | 16 | 1 | 111 | 140952 | 73 | 0 | 0 KB |
| FAIL | ipad_mini | 星雾高地 | high | 3626 | 2.8 | 2.6 | 11 | 1 | 110 | 162344 | 64 | 0 | 0 KB |

## Worst Per Map

| Map | Worst Status | Lowest Avg FPS | Lowest P10 FPS | Max Long Tasks | Max Draw Calls | Max Triangles |
|---|---|---:|---:|---:|---:|---:|
| 新手山谷 | FAIL | 14.7 | 11.0 | 0 | 106 | 88106 |
| 星音草径 | FAIL | 5.1 | 3.3 | 0 | 106 | 114450 |
| 雾湖苇岸 | FAIL | 3.6 | 3.4 | 1 | 103 | 105370 |
| 风车农庄 | FAIL | 3.4 | 2.9 | 0 | 87 | 29696 |
| 贝壳海岸 | FAIL | 3.2 | 2.5 | 0 | 97 | 189998 |
| 月影墓园 | FAIL | 3.7 | 2.6 | 0 | 80 | 43621 |
| 六角遗迹 | FAIL | 3.8 | 3.2 | 1 | 95 | 167068 |
| 铁木营地 | FAIL | 3.8 | 3.6 | 1 | 111 | 140952 |
| 星雾高地 | FAIL | 2.8 | 2.6 | 1 | 110 | 162344 |

## Notes

- PASS means the throttled mobile profile stayed near a smooth 60 FPS with no meaningful long-task pressure.
- WARN means the map is playable but has a mobile risk signal: lower FPS, long tasks, slow readiness, or visible frame spikes.
- FAIL means the map failed to render or fell below the target comfort floor in this synthetic mobile browser test.
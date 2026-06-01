# Mobile Map Performance Audit

- Base URL: http://127.0.0.1:4173/xingyin-pokemon-game
- Map quality: high (default)
- Maps tested: 9 (GodotMap, GodotMapV2, GodotMapV2_MistLake, GodotMapV2_FarmTown, GodotMapV2_PirateShore, GodotMapV2_Graveyard, GodotMapV2_HexRuins, GodotMapV2_SurvivalRidge, GodotMapV2_BossHighland)
- Devices: iphone_se, iphone_14, android_mid, ipad_mini
- Sample: warmup 1800ms, measure 5000ms, CPU throttle on
- Raw JSON: reports/mobile-map-performance-high-default/mobile-map-performance-2026-05-27T10-10-15-327Z.json

| Status | Device | Map | Quality | Ready ms | Avg FPS | P10 FPS | >50ms Frames | Long Tasks | Draw Calls | Triangles | 3D Assets | Asset Failures | Transfer |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| FAIL | iphone_se | 新手山谷 | high | 3788 | 19.0 | 13.3 | 54 | 0 | 106 | 87890 | 48 | 0 | 874 KB |
| FAIL | iphone_se | 星音草径 | high | 3301 | 7.0 | 6.0 | 35 | 0 | 107 | 114462 | 60 | 0 | 0 KB |
| FAIL | iphone_se | 雾湖苇岸 | high | 3295 | 7.1 | 6.3 | 32 | 1 | 98 | 104606 | 62 | 0 | 0 KB |
| FAIL | iphone_se | 风车农庄 | high | 3256 | 5.2 | 4.0 | 25 | 0 | 82 | 28216 | 74 | 0 | 0 KB |
| FAIL | iphone_se | 贝壳海岸 | high | 3211 | 5.0 | 4.0 | 24 | 0 | 96 | 189986 | 67 | 0 | 0 KB |
| FAIL | iphone_se | 月影墓园 | high | 3205 | 7.3 | 5.2 | 36 | 0 | 80 | 43621 | 71 | 0 | 0 KB |
| FAIL | iphone_se | 六角遗迹 | high | 3225 | 7.3 | 6.0 | 33 | 1 | 95 | 167056 | 73 | 0 | 0 KB |
| FAIL | iphone_se | 铁木营地 | high | 4047 | 7.5 | 7.0 | 34 | 1 | 106 | 140820 | 73 | 0 | 0 KB |
| FAIL | iphone_se | 星雾高地 | high | 3915 | 5.6 | 5.0 | 24 | 1 | 109 | 162320 | 64 | 0 | 0 KB |
| FAIL | iphone_14 | 新手山谷 | high | 3540 | 10.1 | 8.0 | 49 | 0 | 106 | 87918 | 48 | 0 | 0 KB |
| FAIL | iphone_14 | 星音草径 | high | 3305 | 4.6 | 4.0 | 22 | 0 | 107 | 114462 | 60 | 0 | 0 KB |
| FAIL | iphone_14 | 雾湖苇岸 | high | 3307 | 4.3 | 4.0 | 18 | 1 | 101 | 105358 | 62 | 0 | 0 KB |
| FAIL | iphone_14 | 风车农庄 | high | 3211 | 3.5 | 2.6 | 17 | 0 | 76 | 27340 | 74 | 0 | 0 KB |
| FAIL | iphone_14 | 贝壳海岸 | high | 3186 | 3.4 | 2.6 | 16 | 0 | 97 | 189998 | 67 | 0 | 0 KB |
| FAIL | iphone_14 | 月影墓园 | high | 3227 | 6.6 | 5.5 | 32 | 0 | 79 | 43609 | 71 | 0 | 0 KB |
| FAIL | iphone_14 | 六角遗迹 | high | 3212 | 7.9 | 7.1 | 34 | 1 | 93 | 167020 | 73 | 0 | 0 KB |
| FAIL | iphone_14 | 铁木营地 | high | 3997 | 7.3 | 5.7 | 33 | 1 | 110 | 140928 | 73 | 0 | 0 KB |
| FAIL | iphone_14 | 星雾高地 | high | 3768 | 5.0 | 3.3 | 21 | 1 | 111 | 162356 | 64 | 0 | 0 KB |
| FAIL | android_mid | 新手山谷 | high | 5539 | 16.5 | 10.0 | 34 | 0 | 106 | 88018 | 48 | 0 | 0 KB |
| FAIL | android_mid | 星音草径 | high | 5069 | 6.8 | 4.1 | 33 | 0 | 106 | 114450 | 60 | 0 | 0 KB |
| FAIL | android_mid | 雾湖苇岸 | high | 4851 | 7.2 | 4.5 | 32 | 1 | 102 | 105370 | 62 | 0 | 0 KB |
| FAIL | android_mid | 风车农庄 | high | 4879 | 5.7 | 2.8 | 26 | 0 | 86 | 29684 | 74 | 0 | 0 KB |
| FAIL | android_mid | 贝壳海岸 | high | 5268 | 5.2 | 3.9 | 24 | 0 | 96 | 189986 | 67 | 0 | 0 KB |
| FAIL | android_mid | 月影墓园 | high | 5216 | 6.1 | 3.5 | 29 | 0 | 79 | 43609 | 71 | 0 | 0 KB |
| FAIL | android_mid | 六角遗迹 | high | 5188 | 6.1 | 4.0 | 27 | 1 | 93 | 167020 | 73 | 0 | 0 KB |
| FAIL | android_mid | 铁木营地 | high | 6269 | 4.9 | 4.6 | 22 | 1 | 108 | 140880 | 73 | 0 | 0 KB |
| FAIL | android_mid | 星雾高地 | high | 5903 | 4.4 | 3.4 | 19 | 1 | 109 | 162320 | 64 | 0 | 0 KB |
| FAIL | ipad_mini | 新手山谷 | high | 2840 | 9.4 | 6.3 | 45 | 0 | 105 | 87878 | 48 | 0 | 0 KB |
| FAIL | ipad_mini | 星音草径 | high | 2639 | 4.4 | 2.8 | 20 | 0 | 106 | 114450 | 60 | 0 | 0 KB |
| FAIL | ipad_mini | 雾湖苇岸 | high | 2637 | 4.0 | 2.9 | 17 | 1 | 98 | 104606 | 62 | 0 | 0 KB |
| FAIL | ipad_mini | 风车农庄 | high | 2657 | 2.3 | 1.8 | 11 | 0 | 76 | 27358 | 74 | 0 | 0 KB |
| FAIL | ipad_mini | 贝壳海岸 | high | 2658 | 2.3 | 2.0 | 11 | 0 | 96 | 189986 | 67 | 0 | 0 KB |
| FAIL | ipad_mini | 月影墓园 | high | 2809 | 6.1 | 4.6 | 29 | 0 | 78 | 43589 | 71 | 0 | 0 KB |
| FAIL | ipad_mini | 六角遗迹 | high | 2734 | 6.4 | 5.5 | 29 | 1 | 94 | 167044 | 73 | 0 | 0 KB |
| FAIL | ipad_mini | 铁木营地 | high | 3236 | 7.8 | 7.0 | 35 | 1 | 109 | 140904 | 73 | 0 | 0 KB |
| FAIL | ipad_mini | 星雾高地 | high | 3258 | 5.3 | 5.0 | 23 | 1 | 109 | 162320 | 64 | 0 | 0 KB |

## Worst Per Map

| Map | Worst Status | Lowest Avg FPS | Lowest P10 FPS | Max Long Tasks | Max Draw Calls | Max Triangles |
|---|---|---:|---:|---:|---:|---:|
| 新手山谷 | FAIL | 9.4 | 6.3 | 0 | 106 | 88018 |
| 星音草径 | FAIL | 4.4 | 2.8 | 0 | 107 | 114462 |
| 雾湖苇岸 | FAIL | 4.0 | 2.9 | 1 | 102 | 105370 |
| 风车农庄 | FAIL | 2.3 | 1.8 | 0 | 86 | 29684 |
| 贝壳海岸 | FAIL | 2.3 | 2.0 | 0 | 97 | 189998 |
| 月影墓园 | FAIL | 6.1 | 3.5 | 0 | 80 | 43621 |
| 六角遗迹 | FAIL | 6.1 | 4.0 | 1 | 95 | 167056 |
| 铁木营地 | FAIL | 4.9 | 4.6 | 1 | 110 | 140928 |
| 星雾高地 | FAIL | 4.4 | 3.3 | 1 | 111 | 162356 |

## Notes

- PASS means the throttled mobile profile stayed near a smooth 60 FPS with no meaningful long-task pressure.
- WARN means the map is playable but has a mobile risk signal: lower FPS, long tasks, slow readiness, or visible frame spikes.
- FAIL means the map failed to render or fell below the target comfort floor in this synthetic mobile browser test.
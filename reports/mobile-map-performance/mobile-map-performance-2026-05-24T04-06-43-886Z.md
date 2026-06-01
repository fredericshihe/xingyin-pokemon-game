# Mobile Map Performance Audit

- Base URL: http://127.0.0.1:4173
- Maps tested: 9 (GodotMap, GodotMapV2, GodotMapV2_MistLake, GodotMapV2_FarmTown, GodotMapV2_PirateShore, GodotMapV2_Graveyard, GodotMapV2_HexRuins, GodotMapV2_SurvivalRidge, GodotMapV2_BossHighland)
- Devices: iphone_se, iphone_14, android_mid, ipad_mini
- Sample: warmup 1800ms, measure 5000ms, CPU throttle on
- Raw JSON: reports/mobile-map-performance/mobile-map-performance-2026-05-24T04-06-43-886Z.json

| Status | Device | Map | Ready ms | Avg FPS | P10 FPS | >50ms Frames | Long Tasks | Draw Calls | Triangles | 3D Assets | Asset Failures | Transfer |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| PASS | iphone_se | 新手山谷 | 3210 | 120.0 | 109.9 | 0 | 0 | 134 | 132828 | 48 | 0 | 874 KB |
| PASS | iphone_se | 星音草径 | 2172 | 120.0 | 109.9 | 0 | 0 | 151 | 190058 | 59 | 0 | 405 KB |
| PASS | iphone_se | 雾湖苇岸 | 2291 | 120.0 | 109.9 | 0 | 0 | 128 | 177312 | 61 | 0 | 88 KB |
| PASS | iphone_se | 风车农庄 | 2146 | 120.0 | 109.9 | 0 | 0 | 157 | 116670 | 66 | 0 | 175 KB |
| PASS | iphone_se | 贝壳海岸 | 2184 | 120.0 | 109.9 | 0 | 0 | 144 | 185886 | 67 | 0 | 360 KB |
| PASS | iphone_se | 月影墓园 | 2109 | 120.0 | 109.9 | 0 | 0 | 144 | 133435 | 71 | 0 | 415 KB |
| PASS | iphone_se | 六角遗迹 | 2098 | 120.0 | 109.9 | 0 | 0 | 134 | 177068 | 71 | 0 | 201 KB |
| PASS | iphone_se | 铁木营地 | 2119 | 120.0 | 109.9 | 0 | 0 | 164 | 178894 | 69 | 0 | 148 KB |
| PASS | iphone_se | 星雾高地 | 2139 | 120.0 | 109.9 | 0 | 0 | 163 | 181808 | 62 | 0 | 79 KB |
| PASS | iphone_14 | 新手山谷 | 2210 | 120.0 | 109.9 | 0 | 0 | 126 | 132582 | 48 | 0 | 14 KB |
| PASS | iphone_14 | 星音草径 | 2127 | 120.0 | 109.9 | 0 | 0 | 142 | 188260 | 59 | 0 | 17 KB |
| PASS | iphone_14 | 雾湖苇岸 | 2177 | 120.0 | 109.9 | 0 | 0 | 120 | 176564 | 61 | 0 | 18 KB |
| PASS | iphone_14 | 风车农庄 | 2112 | 120.0 | 108.7 | 0 | 0 | 154 | 115922 | 66 | 0 | 19 KB |
| PASS | iphone_14 | 贝壳海岸 | 2132 | 120.0 | 111.1 | 0 | 0 | 133 | 183482 | 67 | 0 | 20 KB |
| PASS | iphone_14 | 月影墓园 | 2126 | 120.0 | 109.9 | 0 | 0 | 144 | 133435 | 71 | 0 | 21 KB |
| PASS | iphone_14 | 六角遗迹 | 2130 | 120.0 | 109.9 | 0 | 0 | 127 | 175876 | 71 | 0 | 21 KB |
| PASS | iphone_14 | 铁木营地 | 2131 | 120.0 | 109.9 | 0 | 0 | 153 | 177570 | 69 | 0 | 20 KB |
| PASS | iphone_14 | 星雾高地 | 2148 | 120.0 | 109.9 | 0 | 0 | 153 | 180544 | 62 | 0 | 18 KB |
| PASS | android_mid | 新手山谷 | 3336 | 120.0 | 109.9 | 0 | 0 | 126 | 132582 | 48 | 0 | 14 KB |
| PASS | android_mid | 星音草径 | 3162 | 120.0 | 109.9 | 0 | 0 | 138 | 187820 | 59 | 0 | 17 KB |
| PASS | android_mid | 雾湖苇岸 | 3196 | 120.0 | 109.9 | 0 | 0 | 117 | 175680 | 61 | 0 | 18 KB |
| PASS | android_mid | 风车农庄 | 3165 | 120.0 | 109.9 | 0 | 0 | 154 | 115922 | 66 | 0 | 19 KB |
| PASS | android_mid | 贝壳海岸 | 3166 | 120.0 | 109.9 | 0 | 0 | 129 | 183042 | 67 | 0 | 20 KB |
| PASS | android_mid | 月影墓园 | 3176 | 120.0 | 108.7 | 0 | 0 | 144 | 133435 | 71 | 0 | 21 KB |
| PASS | android_mid | 六角遗迹 | 3198 | 120.0 | 109.9 | 0 | 0 | 123 | 175436 | 71 | 0 | 21 KB |
| PASS | android_mid | 铁木营地 | 3146 | 120.0 | 109.9 | 0 | 0 | 147 | 177098 | 69 | 0 | 20 KB |
| PASS | android_mid | 星雾高地 | 3151 | 119.8 | 109.9 | 0 | 0 | 148 | 180080 | 62 | 0 | 18 KB |
| PASS | ipad_mini | 新手山谷 | 1673 | 120.0 | 102.0 | 0 | 0 | 176 | 177530 | 48 | 0 | 14 KB |
| PASS | ipad_mini | 星音草径 | 1742 | 120.0 | 103.1 | 0 | 0 | 156 | 190974 | 59 | 0 | 17 KB |
| PASS | ipad_mini | 雾湖苇岸 | 1723 | 120.0 | 101.0 | 0 | 0 | 130 | 177396 | 61 | 0 | 18 KB |
| PASS | ipad_mini | 风车农庄 | 1807 | 120.0 | 101.0 | 0 | 0 | 157 | 116670 | 66 | 0 | 19 KB |
| PASS | ipad_mini | 贝壳海岸 | 1736 | 120.0 | 103.1 | 0 | 0 | 147 | 186634 | 67 | 0 | 20 KB |
| PASS | ipad_mini | 月影墓园 | 1738 | 120.0 | 102.0 | 0 | 0 | 144 | 133435 | 71 | 0 | 21 KB |
| PASS | ipad_mini | 六角遗迹 | 1750 | 120.0 | 103.1 | 0 | 0 | 140 | 178450 | 71 | 0 | 21 KB |
| PASS | ipad_mini | 铁木营地 | 1770 | 120.0 | 103.1 | 0 | 0 | 168 | 178990 | 69 | 0 | 20 KB |
| PASS | ipad_mini | 星雾高地 | 1736 | 120.0 | 102.0 | 0 | 0 | 172 | 183262 | 62 | 0 | 18 KB |

## Worst Per Map

| Map | Worst Status | Lowest Avg FPS | Lowest P10 FPS | Max Long Tasks | Max Draw Calls | Max Triangles |
|---|---|---:|---:|---:|---:|---:|
| 新手山谷 | PASS | 120.0 | 102.0 | 0 | 176 | 177530 |
| 星音草径 | PASS | 120.0 | 103.1 | 0 | 156 | 190974 |
| 雾湖苇岸 | PASS | 120.0 | 101.0 | 0 | 130 | 177396 |
| 风车农庄 | PASS | 120.0 | 101.0 | 0 | 157 | 116670 |
| 贝壳海岸 | PASS | 120.0 | 103.1 | 0 | 147 | 186634 |
| 月影墓园 | PASS | 120.0 | 102.0 | 0 | 144 | 133435 |
| 六角遗迹 | PASS | 120.0 | 103.1 | 0 | 140 | 178450 |
| 铁木营地 | PASS | 120.0 | 103.1 | 0 | 168 | 178990 |
| 星雾高地 | PASS | 119.8 | 102.0 | 0 | 172 | 183262 |

## Notes

- PASS means the throttled mobile profile stayed near a smooth 60 FPS with no meaningful long-task pressure.
- WARN means the map is playable but has a mobile risk signal: lower FPS, long tasks, slow readiness, or visible frame spikes.
- FAIL means the map failed to render or fell below the target comfort floor in this synthetic mobile browser test.
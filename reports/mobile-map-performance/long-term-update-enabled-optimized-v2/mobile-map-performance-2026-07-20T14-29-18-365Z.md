# Mobile Map Performance Audit

- Base URL: http://127.0.0.1:3005
- Map quality: high
- Maps tested: 4 (GodotMapV2_TideDojo, GodotMapV2_IronDojo, GodotMapV2_DragonDojo, GodotMapV2_ChampionTower)
- Devices: iphone_se, android_mid
- Sample: warmup 1000ms, measure 2500ms, ready timeout 60000ms, CPU throttle on
- Raw JSON: reports/mobile-map-performance/long-term-update-enabled-optimized-v2/mobile-map-performance-2026-07-20T14-29-18-365Z.json

| Status | Device | Map | Quality | Ready ms | Avg FPS | P10 FPS | >50ms Frames | Long Tasks | Draw Calls | Triangles | 3D Assets | Asset Failures | Transfer |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| WARN | iphone_se | 深潮道馆 | high | 10363 | 119.6 | 112.4 | 0 | 1 | 205 | 22156 | 11 | 0 | 152 KB |
| WARN | iphone_se | 铁壁道馆 | high | 10209 | 110.0 | 109.9 | 3 | 2 | 14 | 4336 | 17 | 0 | 53 KB |
| WARN | iphone_se | 龙穹道馆 | high | 10078 | 100.1 | 109.9 | 3 | 4 | 296 | 30590 | 16 | 0 | 21 KB |
| WARN | iphone_se | 冠军挑战塔 | high | 10050 | 109.6 | 109.9 | 3 | 2 | 14 | 4336 | 19 | 0 | 94 KB |
| WARN | android_mid | 深潮道馆 | high | 15261 | 115.6 | 109.9 | 0 | 0 | 186 | 19454 | 11 | 0 | 3 KB |
| WARN | android_mid | 铁壁道馆 | high | 15444 | 98.8 | 108.7 | 3 | 2 | 14 | 4336 | 17 | 0 | 5 KB |
| WARN | android_mid | 龙穹道馆 | high | 15512 | 86.2 | 60.2 | 3 | 4 | 271 | 26850 | 16 | 0 | 5 KB |
| WARN | android_mid | 冠军挑战塔 | high | 15237 | 99.9 | 109.9 | 3 | 2 | 14 | 4336 | 19 | 0 | 6 KB |

## Worst Per Map

| Map | Worst Status | Lowest Avg FPS | Lowest P10 FPS | Max Long Tasks | Max Draw Calls | Max Triangles |
|---|---|---:|---:|---:|---:|---:|
| 深潮道馆 | WARN | 115.6 | 109.9 | 1 | 205 | 22156 |
| 铁壁道馆 | WARN | 98.8 | 108.7 | 2 | 14 | 4336 |
| 龙穹道馆 | WARN | 86.2 | 60.2 | 4 | 296 | 30590 |
| 冠军挑战塔 | WARN | 99.9 | 109.9 | 2 | 14 | 4336 |

## Notes

- PASS means the throttled mobile profile stayed near a smooth 60 FPS with no meaningful long-task pressure.
- WARN means the map is playable but has a mobile risk signal: lower FPS, long tasks, slow readiness, or visible frame spikes.
- FAIL means the map failed to render or fell below the target comfort floor in this synthetic mobile browser test.
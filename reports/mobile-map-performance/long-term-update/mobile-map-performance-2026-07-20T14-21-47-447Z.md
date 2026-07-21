# Mobile Map Performance Audit

- Base URL: http://127.0.0.1:3003
- Map quality: high
- Maps tested: 4 (GodotMapV2_TideDojo, GodotMapV2_IronDojo, GodotMapV2_DragonDojo, GodotMapV2_ChampionTower)
- Devices: iphone_se, android_mid
- Sample: warmup 1000ms, measure 2500ms, ready timeout 60000ms, CPU throttle on
- Raw JSON: reports/mobile-map-performance/long-term-update/mobile-map-performance-2026-07-20T14-21-47-447Z.json

| Status | Device | Map | Quality | Ready ms | Avg FPS | P10 FPS | >50ms Frames | Long Tasks | Draw Calls | Triangles | 3D Assets | Asset Failures | Transfer |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| FAIL | iphone_se | 深潮道馆 | high | 10767 | 22.0 | 16.8 | 24 | 1 | 14 | 4336 | 11 | 0 | 152 KB |
| WARN | iphone_se | 铁壁道馆 | high | 10161 | 25.1 | 20.0 | 8 | 2 | 14 | 4336 | 17 | 0 | 53 KB |
| FAIL | iphone_se | 龙穹道馆 | high | 10055 | 25.1 | 13.9 | 26 | 2 | 14 | 4336 | 16 | 0 | 21 KB |
| WARN | iphone_se | 冠军挑战塔 | high | 10015 | 101.4 | 109.9 | 4 | 2 | 14 | 4336 | 19 | 0 | 94 KB |
| FAIL | android_mid | 深潮道馆 | high | 15383 | 18.3 | 14.9 | 30 | 0 | 14 | 4336 | 11 | 0 | 3 KB |
| FAIL | android_mid | 铁壁道馆 | high | 15133 | 20.9 | 17.2 | 21 | 2 | 14 | 4336 | 17 | 0 | 5 KB |
| FAIL | android_mid | 龙穹道馆 | high | 15252 | 11.0 | 9.0 | 20 | 1 | 14 | 4336 | 16 | 0 | 5 KB |
| WARN | android_mid | 冠军挑战塔 | high | 15343 | 88.2 | 61.3 | 4 | 2 | 14 | 4336 | 19 | 0 | 6 KB |

## Worst Per Map

| Map | Worst Status | Lowest Avg FPS | Lowest P10 FPS | Max Long Tasks | Max Draw Calls | Max Triangles |
|---|---|---:|---:|---:|---:|---:|
| 深潮道馆 | FAIL | 18.3 | 14.9 | 1 | 14 | 4336 |
| 铁壁道馆 | FAIL | 20.9 | 17.2 | 2 | 14 | 4336 |
| 龙穹道馆 | FAIL | 11.0 | 9.0 | 2 | 14 | 4336 |
| 冠军挑战塔 | WARN | 88.2 | 61.3 | 2 | 14 | 4336 |

## Notes

- PASS means the throttled mobile profile stayed near a smooth 60 FPS with no meaningful long-task pressure.
- WARN means the map is playable but has a mobile risk signal: lower FPS, long tasks, slow readiness, or visible frame spikes.
- FAIL means the map failed to render or fell below the target comfort floor in this synthetic mobile browser test.
# Mobile Map Performance Audit

- Base URL: http://127.0.0.1:3005
- Map quality: high
- Maps tested: 4 (GodotMapV2_TideDojo, GodotMapV2_IronDojo, GodotMapV2_DragonDojo, GodotMapV2_ChampionTower)
- Devices: iphone_se, android_mid
- Sample: warmup 1000ms, measure 2500ms, ready timeout 60000ms, CPU throttle on
- Raw JSON: reports/mobile-map-performance/long-term-update-enabled-fresh/mobile-map-performance-2026-07-20T14-27-04-852Z.json

| Status | Device | Map | Quality | Ready ms | Avg FPS | P10 FPS | >50ms Frames | Long Tasks | Draw Calls | Triangles | 3D Assets | Asset Failures | Transfer |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| WARN | iphone_se | 深潮道馆 | high | 10757 | 28.1 | 20.4 | 7 | 1 | 220 | 27114 | 11 | 0 | 152 KB |
| WARN | iphone_se | 铁壁道馆 | high | 10080 | 29.9 | 22.9 | 3 | 2 | 14 | 4336 | 17 | 0 | 53 KB |
| FAIL | iphone_se | 龙穹道馆 | high | 10019 | 25.1 | 13.6 | 27 | 2 | 14 | 4336 | 16 | 0 | 21 KB |
| WARN | iphone_se | 冠军挑战塔 | high | 10145 | 80.6 | 109.9 | 3 | 2 | 14 | 4336 | 19 | 0 | 94 KB |
| WARN | android_mid | 深潮道馆 | high | 15912 | 32.5 | 23.8 | 3 | 0 | 200 | 22324 | 11 | 0 | 3 KB |
| FAIL | android_mid | 铁壁道馆 | high | 15737 | 21.4 | 17.0 | 18 | 2 | 14 | 4336 | 17 | 0 | 5 KB |
| FAIL | android_mid | 龙穹道馆 | high | 15748 | 27.2 | 17.3 | 17 | 4 | 312 | 37050 | 16 | 0 | 5 KB |
| WARN | android_mid | 冠军挑战塔 | high | 16095 | 82.1 | 109.9 | 3 | 2 | 14 | 4336 | 19 | 0 | 6 KB |

## Worst Per Map

| Map | Worst Status | Lowest Avg FPS | Lowest P10 FPS | Max Long Tasks | Max Draw Calls | Max Triangles |
|---|---|---:|---:|---:|---:|---:|
| 深潮道馆 | WARN | 28.1 | 20.4 | 1 | 220 | 27114 |
| 铁壁道馆 | FAIL | 21.4 | 17.0 | 2 | 14 | 4336 |
| 龙穹道馆 | FAIL | 25.1 | 13.6 | 4 | 312 | 37050 |
| 冠军挑战塔 | WARN | 80.6 | 109.9 | 2 | 14 | 4336 |

## Notes

- PASS means the throttled mobile profile stayed near a smooth 60 FPS with no meaningful long-task pressure.
- WARN means the map is playable but has a mobile risk signal: lower FPS, long tasks, slow readiness, or visible frame spikes.
- FAIL means the map failed to render or fell below the target comfort floor in this synthetic mobile browser test.
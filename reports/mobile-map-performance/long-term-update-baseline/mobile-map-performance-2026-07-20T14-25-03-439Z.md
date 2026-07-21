# Mobile Map Performance Audit

- Base URL: http://127.0.0.1:3004
- Map quality: high
- Maps tested: 3 (GodotMapV2_TideDojo, GodotMapV2_IronDojo, GodotMapV2_DragonDojo)
- Devices: iphone_se, android_mid
- Sample: warmup 1000ms, measure 2500ms, ready timeout 60000ms, CPU throttle on
- Raw JSON: reports/mobile-map-performance/long-term-update-baseline/mobile-map-performance-2026-07-20T14-25-03-439Z.json

| Status | Device | Map | Quality | Ready ms | Avg FPS | P10 FPS | >50ms Frames | Long Tasks | Draw Calls | Triangles | 3D Assets | Asset Failures | Transfer |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| WARN | iphone_se | 深潮道馆 | high | 10590 | 101.2 | 60.2 | 0 | 1 | 190 | 20236 | 11 | 0 | 152 KB |
| WARN | iphone_se | 铁壁道馆 | high | 10004 | 100.7 | 90.9 | 2 | 2 | 14 | 4336 | 17 | 0 | 53 KB |
| WARN | iphone_se | 龙穹道馆 | high | 9937 | 97.0 | 61.3 | 2 | 2 | 14 | 4336 | 16 | 0 | 21 KB |
| WARN | android_mid | 深潮道馆 | high | 15050 | 84.2 | 58.5 | 0 | 0 | 187 | 19472 | 11 | 0 | 3 KB |
| WARN | android_mid | 铁壁道馆 | high | 15146 | 80.2 | 58.8 | 3 | 2 | 14 | 4336 | 17 | 0 | 5 KB |
| WARN | android_mid | 龙穹道馆 | high | 15182 | 78.0 | 58.1 | 3 | 2 | 14 | 4336 | 16 | 0 | 5 KB |

## Worst Per Map

| Map | Worst Status | Lowest Avg FPS | Lowest P10 FPS | Max Long Tasks | Max Draw Calls | Max Triangles |
|---|---|---:|---:|---:|---:|---:|
| 深潮道馆 | WARN | 84.2 | 58.5 | 1 | 190 | 20236 |
| 铁壁道馆 | WARN | 80.2 | 58.8 | 2 | 14 | 4336 |
| 龙穹道馆 | WARN | 78.0 | 58.1 | 2 | 14 | 4336 |

## Notes

- PASS means the throttled mobile profile stayed near a smooth 60 FPS with no meaningful long-task pressure.
- WARN means the map is playable but has a mobile risk signal: lower FPS, long tasks, slow readiness, or visible frame spikes.
- FAIL means the map failed to render or fell below the target comfort floor in this synthetic mobile browser test.
# Mobile Map Performance Audit

- Base URL: http://127.0.0.1:3003
- Map quality: high
- Maps tested: 1 (GodotMapV2)
- Devices: iphone_se
- Sample: warmup 800ms, measure 2000ms, ready timeout 60000ms, CPU throttle off
- Raw JSON: reports/mobile-map-performance/mobile-map-performance-2026-06-01T23-38-12-485Z.json

| Status | Device | Map | Quality | Ready ms | Avg FPS | P10 FPS | >50ms Frames | Long Tasks | Draw Calls | Triangles | 3D Assets | Asset Failures | Transfer |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| FAIL | iphone_se | 星音草径 | - | - | - | - | - | - | - | - | - | 0 | - |

## Worst Per Map

| Map | Worst Status | Lowest Avg FPS | Lowest P10 FPS | Max Long Tasks | Max Draw Calls | Max Triangles |
|---|---|---:|---:|---:|---:|---:|
| 星音草径 | FAIL | - | - | 0 | - | - |

## Notes

- PASS means the throttled mobile profile stayed near a smooth 60 FPS with no meaningful long-task pressure.
- WARN means the map is playable but has a mobile risk signal: lower FPS, long tasks, slow readiness, or visible frame spikes.
- FAIL means the map failed to render or fell below the target comfort floor in this synthetic mobile browser test.
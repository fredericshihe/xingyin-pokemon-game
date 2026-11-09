# 发布记录：2026-09-18

- 网站：https://pokemongame.site/
- 发布分支：`gh-pages`
- 发布提交：`4d22af6b3cf254829dc4ad1ab2894190b56a4e18`
- GitHub Pages 运行：`35294915465`，结论 `success`。
- 构建版本：`8323a87`，入口：`Cgb21Zoo`，构建时间：`2026-09-18T00:30:10.040Z`。
- 使用上一轮已通过完整 `VITE_BASE_PATH=/ npm run build` 与本地试玩的生产产物。本轮再次构建时发现项目被 iCloud 移为云端占位文件，因此中止重复构建，恢复已验证的 dist；1212 个文件复制到本地临时发布目录并逐文件对比 SHA-256 后，通过 gh-pages 发布。
- `npm run verify:deploy -- https://pokemongame.site/`：11 OK、0 WARN、0 ERR；首页、version.json、Service Worker 与本地 dist 一致。
- 额外核对线上极巨糖果图标、自行车图标、自行车 GLB、道具数据、商店、战斗与地图代码共 7 份文件，SHA-256 均与发布产物一致。
- GitHub Pages 配置 CNAME 为 `pokemongame.site`，来源为 `gh-pages` 根目录。

本次发布包含经验药水价格与直升一级效果、极巨糖果、旅行自行车。没有使用真实账号执行购买或消耗道具。

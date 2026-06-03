# GitHub Pages + 自定义域名 pokemongame.site

## 正式地址

**https://pokemongame.site/**（根路径，末尾建议带 `/`）

## 一次性配置（GitHub 网页）

1. 打开仓库 **Settings → Pages**
2. **Build and deployment → Source**：`Deploy from a branch`
3. **Branch**：`gh-pages` / `/(root)`
4. **Custom domain** 填入：`pokemongame.site` → 点 **Save**
5. 等待 DNS 检测通过，勾选 **Enforce HTTPS**

仓库已包含 `public/CNAME`（内容为 `pokemongame.site`），部署后会写入 `gh-pages`，GitHub 会自动配置。

## DNS（域名服务商）

为 `pokemongame.site` 添加记录（二选一，按 GitHub Pages 提示为准）：

| 类型 | 名称 | 值 |
|------|------|-----|
| `A` | `@` | `185.199.108.153`（及 GitHub 给出的另外 3 个 A 记录） |
| 或 `CNAME` | `@` 或 `www` | `fredericshihe.github.io` |

保存后等待生效（几分钟到 48 小时）。

## 构建说明

CI 使用 `VITE_BASE_PATH=/`，资源路径为 `/assets/...`，**不要**再访问 `/xingyin-pokemon-game/`。

旧链接 `https://pokemongame.site/xingyin-pokemon-game/` 会自动跳转到根路径。

## 部署

推送到 `main` 后 Actions 自动发布；或本地：

```bash
VITE_BASE_PATH=/ npm run build
npx gh-pages -d dist
```

## 发布后校验

发布完成后建议立刻执行：

```bash
npm run verify:deploy
```

它会自动检查：

- 线上 `version.json` 是否存在且可解析
- `version.json.entryHash` 是否和首页实际入口 `assets/index-*.js` 一致
- 当前入口 JS 是否真的能访问
- `sw.js` 是否带有 `skipWaiting()` / `clientsClaim()`
- `sw.js` 里的 `game-pages-*` / `game-static-*` buildId 是否与 `version.json.buildId` 一致
- 本地 `dist/version.json` 与线上版本是否一致

如果你要检查别的域名，也可以直接执行：

```bash
node scripts/verify-deployed-version.mjs https://your-site.example/
```

## 常见问题

**Q: 为什么 GitHub 显示 `github.io/xingyin-pokemon-game/`？**  
绑定自定义域名后，对外以 **pokemongame.site** 为准；`github.io` 链接可能仍会显示，但玩家应使用自定义域名。

**Q: 资源 404？**  
确认 Custom domain 已保存且构建为 `VITE_BASE_PATH=/`，清除浏览器与 PWA 缓存后重开 **https://pokemongame.site/**。

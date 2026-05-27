# Git + Cloudflare Pages + Supabase 部署指南

把「宝可梦养成」部署成可公开访问的网页游戏：**GitHub 存代码 → Cloudflare Pages 托管前端 → Supabase 提供数据库与 RPC**。

---

## 架构一览

```text
玩家浏览器
    ↓ HTTPS
Cloudflare Pages（静态站点：dist/）
    ↓ supabase-js（VITE_SUPABASE_*）
Supabase（Postgres + RPC：存档 / 登录 / 金币 / 能量）
```

---

## 一、准备 Supabase（后端）

项目已绑定 Supabase 项目：`waesizzoqodntrlvrwhw`。

### 1. 推送数据库迁移（推荐）

本地已安装 [Supabase CLI](https://supabase.com/docs/guides/cli) 时：

```bash
supabase login
supabase link --project-ref waesizzoqodntrlvrwhw
supabase db push
```

`supabase/migrations/` 下的迁移会同步到线上，比单独跑 `supabase-setup.sql` 更可靠。

### 2. 获取前端环境变量

在 Supabase Dashboard → **Project Settings → API** 复制：

| 变量名 | 说明 |
|--------|------|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon / public key |

> 本游戏使用自定义用户名密码 + RPC，不依赖 Supabase Auth 的 Site URL；只要 anon key 与 RPC 权限正确即可。

### 3. 可选：验证训练家完成状态 RPC

```bash
supabase db query --linked -f scripts/verify-trainer-completion-rpc-guard.sql
```

---

## 二、推代码到 GitHub

仓库：`https://github.com/fredericshihe/xingyin-pokemon-game`

```bash
git add .
git commit -m "Add Cloudflare Pages deployment config"
git push origin main
```

首次部署前确认 `public/assets/` 已提交（3D 模型与立绘约几十 MB，需随仓库一起发布）。

---

## 三、Cloudflare Pages 创建项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选择 GitHub 账号，授权后选中仓库 `xingyin-pokemon-game`
3. 构建设置：

| 项 | 值 |
|----|-----|
| Production branch | `main` |
| Framework preset | `Vite`（或 None 手动填） |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/`（留空） |

4. **Environment variables**（Production + Preview 都建议配置）：

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://waesizzoqodntrlvrwhw.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | 你的 anon key |
| `NODE_VERSION` | `20` |

5. 点击 **Save and Deploy**，等待首次构建完成。

部署成功后地址类似：`https://xingyin-pokemon-game.pages.dev`

---

## 四、自定义域名（可选）

Cloudflare Pages → 你的项目 → **Custom domains** → 添加域名并按提示配置 DNS。

---

## 五、本地验证生产构建

```bash
cp .env.example .env.local   # 填入真实 Supabase 值
npm install
npm run build
npm run preview              # 默认 http://localhost:4173
```

检查：登录、读档、战斗、手动保存云端是否正常。

---

## 六、常见问题

### 构建失败：Missing Supabase environment variables

Cloudflare 未配置 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`，或变量名拼写错误（必须以 `VITE_` 开头才会注入 Vite 构建）。

### 刷新子路由 404

已用 `public/_redirects` 做 SPA 回退；若仍 404，确认该文件被复制进 `dist/`（`npm run build` 后检查 `dist/_redirects`）。

### 游戏资源加载慢

首次访问会下载 Three.js 与地图资源；`public/_headers` 已为 `/assets/*` 设置长期缓存。

### 存档/训练家状态异常

优先确认线上 Supabase 已执行最新 migration（见「一、推送数据库迁移」），不要只跑旧版 `supabase-setup.sql`。

---

## 七、后续更新流程

```text
本地改代码 → git push main → Cloudflare 自动重新构建 → 玩家刷新页面
数据库结构变更 → supabase db push → 无需重部署前端（RPC 在 Supabase 侧）
```

---

## 相关文件

| 文件 | 作用 |
|------|------|
| `public/_redirects` | SPA 路由回退 |
| `public/_headers` | 静态资源缓存与安全头 |
| `.env.example` | 环境变量模板 |
| `.nvmrc` | Node 20（与 Cloudflare 构建一致） |
| `supabase/migrations/` | 线上数据库迁移 |

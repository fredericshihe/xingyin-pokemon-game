# 宝可梦养成游戏 - 快速启动指南

## 项目状态

✅ React项目结构已搭建  
✅ Supabase客户端已配置  
✅ 认证系统已完成（用户名密码登录）  
✅ 金币发放与经验药水系统已集成  
✅ 老师管理后台已完成  
✅ 云端存档、资源原子提交与能量系统已集成  
✅ 数据库迁移通过 Supabase CLI 管理并已推送当前最新版本

---

## 立即开始

### 1. 创建数据库表（必须先完成）

1. 访问 Supabase Dashboard: https://supabase.com/dashboard/project/waesizzoqodntrlvrwhw
2. 点击左侧 **SQL Editor**
3. 点击 **New query**
4. 复制 `supabase-setup.sql` 文件的全部内容并粘贴
5. 点击 **Run** 执行

### 2. 启动开发服务器

```bash
npm run cache:assets   # 下载宝可梦立绘 + 道具插画立绘（dream-world，非像素）
npm run dev
```

默认访问：http://localhost:3000  
如果 3000 端口被占用，可以使用 `npm run dev -- --host 127.0.0.1 --port 3002`，然后访问：http://localhost:3002

### 3. 创建测试账号

**创建老师账号：**
- 用户名：teacher001
- 昵称：张老师
- 密码：123456
- 身份：老师

**创建学生账号：**
- 用户名：student001
- 昵称：小明
- 密码：123456
- 身份：学生
- 老师用户名：teacher001

---

## 功能说明

### 学生端功能
- ✅ 用户名密码登录/注册
- ✅ 老师发放金币后可在商城购买经验药水
- ✅ 商城保留精灵球和回复药（伤药 / 好伤药 / 厉害伤药）
- ✅ 小/中/大经验药水用于提升宝可梦经验
- ✅ 必须联网游戏，登录后直接从后端读取云端进度
- ✅ 关键操作后自动同步云端，并支持随时手动保存
- ✅ 完整游戏逻辑已集成
- ✅ 进入游戏前会显示**加载进度条**，需完整图鉴、商店素材与全部地图 3D 模型加载成功后才会进入
- 📝 地图玩法升级见 `docs/MAP_GAMEPLAY_UPGRADE_PLAN.md`（**须先将主地图扩至 100×100**，见该文档 §0、§6 阶段零）
- 📝 队伍上限 6、仓库上限 100、「宝可梦」双 Tab 管理、捕捉安置与道具边界见 `docs/POKEMON_ROSTER_STORAGE_UPGRADE_PLAN.md`
- 📝 战斗失败系统方案 B 见 `docs/DEFEAT_SYSTEM_UPGRADE_PLAN.md` — **须在 100×100 扩图 + 地图玩法升级均验收后再开发**

### 老师端功能
- ✅ 查看所有学生列表
- ✅ 查看学生当前金币
- ✅ 给学生发放任意数量金币
- ✅ 添加发放备注
- ✅ 查看金币历史记录
- ✅ 快捷发放按钮（+100/+300/+1000）

---

## 金币与经验规则

- 学生初始金币：0
- 金币主要可由老师端发放，战斗胜利也会获得金币奖励
- 宝可梦经验可通过商城购买的小/中/大经验药水以及战斗胜利增加
- 精灵球、回复药（伤药 +20、好伤药 +50、厉害伤药 +120）仍可在商城使用金币购买
- 捕获与地图探索本身不直接获得经验或金币

### 战斗失败与逃跑

- 战斗失败后扣除少量金币（野生约 10～28，训练家约 18～45，随地图等级略增）；金币不足时可能无法足额扣除
- 战斗成功完成（胜利离场）仍会消耗开战时扣除的能量；**只有野外遭遇后未攻击、未用道具、未换人、未扔球且直接逃跑成功时**，才会退回本场已扣的能量
---

## 项目结构

```
宝可梦养成/
├── src/
│   ├── App.jsx                    # 主应用（路由和认证）
│   ├── main.jsx                   # 入口文件
│   ├── index.css                  # 全局样式
│   ├── supabaseClient.js          # Supabase配置
│   ├── components/
│   │   ├── Auth/
│   │   │   ├── Login.jsx          # 登录页面
│   │   │   └── Register.jsx       # 注册页面
│   │   ├── Game/
│   │   │   ├── GameWrapper.jsx    # 游戏包装器
│   │   │   └── OriginalGame.jsx   # 主游戏组件
│   │   └── Teacher/
│   │       └── Dashboard.jsx      # 老师管理后台
│   ├── hooks/
│   │   ├── useAuth.js             # 认证Hook
│   │   └── useGameSave.js         # 游戏保存Hook
│   └── utils/
│       ├── authService.js         # 认证服务
│       └── constants.js           # 常量定义
├── index.html                     # 原始单文件游戏（保留）
├── index-new.html                 # 新版HTML入口
├── supabase-setup.sql             # 数据库初始化脚本
├── .env.local                     # 环境变量（已配置）
└── PROJECT_PLAN.md                # 项目计划文档
```

---

## 下一步工作

### 阶段1：测试基础功能（现在）
1. ✅ 执行SQL脚本创建数据库表
2. ✅ 启动开发服务器
3. ✅ 测试注册/登录
4. ✅ 测试金币发放和经验药水系统
5. ✅ 测试老师后台

### 阶段2：验证游戏逻辑
1. 验证老师发放金币
2. 验证学生购买三种经验药水
3. 验证宝可梦可通过经验药水和战斗胜利获得经验
4. 验证战斗、捕获、地图切换不再受旧账号资源限制

### 阶段3：部署上线（GitHub Pages + Supabase）
1. 推送 `supabase/migrations` 到线上：`supabase db push`
2. 将代码推送到 GitHub：`fredericshihe/xingyin-pokemon-game`
3. GitHub Actions 会自动构建并发布到 **gh-pages** 分支（工作流：`.github/workflows/deploy-pages.yml`）
4. 在 GitHub 仓库 **Settings → Secrets** 配置：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
5. 公开地址：**https://pokemongame.site/**（详见 **[docs/DEPLOY_GITHUB_PAGES.md](docs/DEPLOY_GITHUB_PAGES.md)**）
6. 在 GitHub **Settings → Pages → Custom domain** 填写 `pokemongame.site` 并保存（仓库已带 `CNAME` 文件）
7. 若改用 Cloudflare Pages，见 **[docs/DEPLOY_CLOUDFLARE.md](docs/DEPLOY_CLOUDFLARE.md)**（同样 `VITE_BASE_PATH=/`）

---

## 常见问题

### Q: 注册时提示"找不到该老师"
A: 确保老师账号已经注册，并且输入的老师用户名完全正确

### Q: 没有金币怎么办？
A: 联系你的老师，老师会根据你的练习表现发放金币

### Q: 游戏进度会丢失吗？
A: 不会，登录后会直接从后端读取云端进度；关键操作会自动同步，也可以随时手动保存。不支持本地离线游戏。

### Q: 老师如何查看学生？
A: 学生注册时填写老师用户名后，会自动出现在老师的学生列表中

### Q: 手机打开 GitHub Pages 一直显示「登录/游戏加载中」？
A: 常见原因有三点：
1. **链接错误**：请打开 **https://pokemongame.site/**，不要用 `/xingyin-pokemon-game/` 旧路径。
2. **首次下载较慢**：游戏 JS 约 2MB+，弱网下会多等一会儿；超过 1 分钟可刷新重试。
3. **旧缓存**：游戏更新后，请在手机浏览器里清除该站点数据，或用无痕模式重新打开。

若 GitHub Actions 构建失败，检查仓库 Secrets 是否已配置 Supabase 环境变量。

### Q: 游戏更新后手机/电脑还显示旧版？
A: 发布新版本后，客户端会**自动检测**并处理缓存：
1. **Service Worker** 定期检查更新，发现新版本会清缓存并刷新页面。
2. 每次构建带有唯一 **buildId**（git 提交号），与线上 `version.json` 对比，版本不一致会清缓存重载。
3. 若仍异常，可用浏览器**无痕模式**打开，或在登录页使用「清除缓存并重试」（资源加载失败时）。

### Q: 进入游戏时进度条要加载很久？
A: **每个新版本首次进入**会阻塞加载：战斗/商店/UI 素材、**完整图鉴**、**全部 9 张地图** 3D 模型（弱网下约 1–3 分钟）。**同一版本内刷新**若本地已标记完成，则不再重复进度条。若加载失败，请换网络后点「重新加载」。

### Q: 地图里的树/石头看起来很多切面、很粗糙？
A: 常见原因：
1. **模型被 Draco 强压缩过**（法线量化后会明显“三角化”）。仓库已恢复未压缩的 Kenney 原版 GLB；请勿随意运行 `npm run compress:models` 的 Draco 模式。
2. **画质档位**：默认已是 `high`（全开抗锯齿 + 装饰投影）。若手机卡顿，可在链接后加 `?mapQuality=lite`，或执行 `localStorage.setItem('mapVisualQuality','lite')` 后刷新。
3. 资源本身是 **低多边形风格**，棱角会比写实模型明显，这是正常风格，不是贴图坏了。

---

## 技术支持

- Supabase Dashboard: https://supabase.com/dashboard
- 项目计划: 查看 `PROJECT_PLAN.md`
- 大地图重做方案: 查看 `MAP_SYSTEM_REBUILD_PLAN.md`
- 当前冒险地图已统一使用 Three.js 低多边形渲染（`src/game/ThreeLowPolyMap.jsx`）
- 数据库脚本: 查看 `supabase-setup.sql`

---

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

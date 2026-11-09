# 自行车与战斗操作修正（2026-09-18）

- 骑行动画：前侧踏板向下踩，保持车轮向前转；左右踏板相差半圈，停止移动时停止踩踏。
- 地图控制：自行车按钮独立置于右下角四个按钮上方；桌面 R 切换骑行／步行，显示 R 键标记；触屏隐藏键标记。R 长按重复、Ctrl／Command／Alt 组合键、输入框、菜单、草丛和未购买状态均不会误触发。
- 极巨化：保留 1.35 倍放大、发光、变身动画和战斗状态标记，删除头顶三朵云与脚下光圈。
- MP 不足：保留灰显和不可使用语义，点击或键盘激活显示 1.8 秒短提示“MP 不足：需要 N，当前 M”与按钮闪烁；不派发攻击、不扣资源、不消耗回合。正常技能和所有技能均不可用时的原有保护保持有效。

## 验证

- Chrome + Playwright：390×844 触屏与 1365×900 桌面战斗，MP 不足时点击及 Enter 激活均提示、攻击计数保持 0；有足够 MP 的技能照常执行。极巨化尺寸 1.35，存在 drop-shadow，头顶装饰和光圈均为 0。
- 地图：有／无自行车时四个原按钮的矩形完全相同；骑行按钮下边缘高于四按钮上边缘。验证 R、Shift+R、重复按键、组合键、输入框、菜单和草丛限制。
- 实际 Three.js 模型：左脚在前端时 y 从 0.35 降至 0.33559；前轮 x 旋转从 0 增至 0.18850；左右脚 y 之和为 0.7，停止状态不改变踏板位置。
- `node scripts/audit-growth-battle-guards.mjs`、`node scripts/audit-adventure-items.mjs`、`git diff --check` 通过。
- 完整生产构建通过：在独立本地目录安装锁定依赖后执行 `VITE_BASE_PATH=/ VITE_APP_BUILD_ID=adventure-controls-v2 npm run build`。与工作区 145 个源码文件逐一比对 SHA-256 一致；规避工作区 iCloud 占位依赖读取超时。最终产物已同步回工作区 dist。

机器结果见 `verification.json`；截图见同目录的 `bicycle-controls-phone.png`、`bicycle-controls-desktop.png`、`mp-feedback-phone.png` 和 `dynamax-glow-phone.png`。

## 发布

- 已发布至 https://pokemongame.site/ ，gh-pages 提交 `04724edffb8c13ece39dcbe74ffffdf48f78ba90`，GitHub Pages 运行 `35297897771` 成功。
- 线上版本 `adventure-controls-v2`，入口 `D2vuNT2Y`。
- `npm run verify:deploy -- https://pokemongame.site/`：11 OK、0 WARN、0 ERR。
- 线上地图、战斗及相关 CSS 共 4 个文件与本地发布产物 SHA-256 一致。

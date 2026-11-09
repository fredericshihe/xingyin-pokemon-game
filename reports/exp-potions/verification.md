# 经验药水本地验证（2026-09-18）

实现价格：120 / 300 / 700 / 1500 金币（已按后续要求提高前三档）。前三档经验为 90 / 300 / 840，最后一档按官方成长曲线补足当前等级剩余经验，准确升一级。

通过：

- `node scripts/audit-exp-potions.mjs`：6 种成长曲线、Lv.1–99、零／半满／差一点升级，共 1782 个场景；进化与技能学习、事件去重、99→100、普通药水不回归。
- 同一脚本调用真实使用处理函数、模拟云端提交边界：新旧界面数据不一致时按最新快照计算；9 种拒绝／失败场景不修改库存、不播放成功动画。未使用真实账号执行线上购买或云端存档写入。
- `node scripts/audit-shop-item-tiers.mjs`：10 项检查通过。
- `node scripts/audit-exp-overflow.mjs`：5 项检查通过，覆盖 209 种宝可梦。
- `node scripts/audit-growth-battle-guards.mjs`：通过。
- `node scripts/audit-game-data.mjs`：退出码 0，非法道具／缺失道具资源均为 0；现有技能覆盖统计仍由原审计保留。
- Playwright + Chrome 使用实际商店／背包组件的独立本地夹具：桌面和 390×844 手机预览；1500 金币可购买状态；使用后 Lv.50→51、库存 x2→x1、经验 0/7957；Lv.100 按钮禁用；无页面运行时错误。图片见同目录。
- 完整生产构建通过：`VITE_BASE_PATH=/ npm run build`，包含 prebuild、全量静态资源与 PWA 生成；存在项目原有大分块提示。
- `git diff --check` 通过。

扩展检查中的既有问题：

- `audit-trial-balance.mjs` 报四张天王地图没有 challenge 事件：FrostDojo、TideDojo、IronDojo、DragonDojo。用 HEAD 中修改前的药水目录重新运行，报错一致；本次没有修改这些地图事件或该审计。
- `audit-three-main-growth-route.mjs` 正常完成，但它的路线报告仍有 10 张地图的成长风险提示；本次只让其识别直升药水，没有重调地图难度，也不据此宣称全游戏平衡已经验证。

当前为本地修改，尚未提交或发布。极巨糖果和旅行自行车已实现；商店扩充文档中的其余 12 种新增道具仅为建议，尚未实现。

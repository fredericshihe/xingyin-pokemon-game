# Git 版本管理说明

本项目已经接入 Git，并推送到 GitHub 私有仓库：

https://github.com/fredericshihe/xingyin-pokemon-game

## 日常优化流程

1. 修改前查看状态：

```bash
git status
```

2. 完成一轮可验证修改后提交：

```bash
git add .
git commit -m "描述这次修改"
git push
```

3. 查看最近版本：

```bash
git log --oneline --decorate -10
```

## 撤销与恢复

撤销某个文件的未提交修改：

```bash
git restore 路径/文件名
```

撤销已经提交的一次修改，保留历史记录：

```bash
git revert 提交ID
git push
```

回到首次接入 Git 的基线版本：

```bash
git checkout baseline-2026-05-24
```

如果只是想查看旧版本，用完后回到主线：

```bash
git checkout main
```

## 提醒

- `.env.local`、`local-secrets/`、`node_modules/`、`dist/`、`output/`、`supabase/.temp/` 已被忽略，不会进入仓库。
- 后续每完成一个稳定阶段，可以创建 tag：

```bash
git tag 阶段名
git push origin 阶段名
```

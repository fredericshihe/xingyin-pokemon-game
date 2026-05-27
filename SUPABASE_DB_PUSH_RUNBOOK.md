# Supabase db push 恢复说明

本文记录本项目 `supabase db push` 的可用连接方式和排障结论，避免下次再次被 DNS、pooler 或迁移历史问题卡住。

## 项目信息

- Project ref: `waesizzoqodntrlvrwhw`
- Pooler host: `aws-1-ap-northeast-1.pooler.supabase.com`
- Pooler user: `postgres.waesizzoqodntrlvrwhw`
- Database: `postgres`
- 本地 Supabase 配置: `supabase/config.toml`

不要把数据库密码写入仓库。需要执行命令时临时填入连接串，执行完如有泄露风险请到 Supabase Dashboard 重置数据库密码。

## 必须使用的命令

当前网络环境下不要裸跑 `supabase db push`。应使用 pooler + HTTPS DNS：

```bash
cd /Users/shihe/Documents/宝可梦养成

supabase db push \
  --db-url 'postgresql://postgres.waesizzoqodntrlvrwhw:<DATABASE_PASSWORD>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres' \
  --dns-resolver https
```

如果密码包含 `@`, `:`, `/`, `?`, `#`, `[`, `]` 等 URL 特殊字符，必须先 percent-encode 再放进 `--db-url`。

## 本次已确认的关键结论

1. 裸命令 `supabase db push` 会走直连域名：

   ```text
   db.waesizzoqodntrlvrwhw.supabase.co
   ```

   当前机器会把它解析到 `198.18.x.x`，例如：

   ```text
   198.18.1.0
   ```

   这是 fake-ip / 代理 DNS 场景，Postgres 5432 会超时。

2. `--dns-resolver https` 对直连 DB 域名也不可靠。本项目直连域名在 HTTPS DNS 下返回无可用 IP。

3. Pooler 入口能连通。`aws-1-ap-northeast-1.pooler.supabase.com:5432` 可以完成数据库握手。

4. 本次排查发现：`SUPABASE_DB_PASSWORD` 环境变量和 `--password` 参数在这个 `--db-url` pooler 场景里仍然触发认证失败；只有把密码直接嵌进 `--db-url` 时认证通过。

5. 认证通过后，`db push` 又被迁移历史挡住：远端老项目存在大量历史迁移记录，本地 `supabase/migrations` 起初只有最近两份。已经补齐历史占位迁移文件，使本地和远端版本号对齐。

## 已做的本地修复

- 新增 `supabase/config.toml`
- 设置：

  ```toml
  project_id = "waesizzoqodntrlvrwhw"
  ```

- 补齐远端已有的历史迁移占位文件：

  ```text
  supabase/migrations/20250325120000_profiles_redeem.sql
  supabase/migrations/20251206_fix_signup_trigger.sql
  supabase/migrations/20260325223000_seed_redeem_codes.sql
  supabase/migrations/20260325224000_profiles_backfill_columns.sql
  supabase/migrations/20260326001000_admin_panel_support.sql
  supabase/migrations/20260326002000_bootstrap_admin_user.sql
  supabase/migrations/20260326120000_redeem_codes_enable_rls.sql
  supabase/migrations/20260326130000_disable_seed_codes.sql
  supabase/migrations/20260327190000_sim_trade_stats.sql
  supabase/migrations/20260327200000_sim_trades_dedup_unique.sql
  supabase/migrations/20260401120000_tv_mtf_signals.sql
  supabase/migrations/20260401140000_redeem_code_once_per_user.sql
  supabase/migrations/202604190930_update_coin_adjustment_types.sql
  supabase/migrations/202604191000_recalculate_semester_earned_from_adjustments.sql
  supabase/migrations/20260422110000_redeem_codes_soft_delete.sql
  supabase/migrations/202605111200_fix86_anti_grind_score_rollout.sql
  supabase/migrations/202605111330_apply_fix86_score_rollout.sql
  ```

这些占位文件只用于迁移历史对齐，不包含实际 SQL 变更。

## 2026-05-24 新增迁移提醒

本地新增了云端原子读档迁移：

```text
supabase/migrations/202605240001_atomic_cloud_load.sql
```

这条迁移会新增 `load_cloud_game_state_with_resources(UUID)`，让前端一次读取云存档和金币/能量，减少“进度和资源分两次查询读偏”的窗口。拉到这次代码后，需要再执行一次本文的 `supabase db push`。

同一轮还新增了密码暴露面收口迁移：

```text
supabase/migrations/202605240002_reduce_password_exposure.sql
```

这条迁移会：

- 让 `login_with_table_password` 不再把 `plain_password` 返回给前端
- 新增 `teacher_reset_student_password(UUID, UUID, TEXT)`，供老师后台直接重设学生密码
- 缩小 `register_table_user` 返回的 profile 字段范围

如果你拉到这版前端代码但没执行这条迁移，老师后台的“更新学生密码”会失败，登录页在缺少新 RPC 时也会提示先同步数据库。

## 验证命令

查看本地/远端迁移是否对齐：

```bash
supabase migration list \
  --db-url 'postgresql://postgres.waesizzoqodntrlvrwhw:<DATABASE_PASSWORD>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres' \
  --dns-resolver https
```

成功时应看到所有版本左右两列都有值，尤其：

```text
202605170001 | 202605170001
202605180001 | 202605180001
```

再次执行 `db push` 成功时，如果没有新迁移，会显示：

```text
Remote database is up to date.
```

## 如果又失败

### `198.18.x.x` 或 timeout

说明又走了直连域名或 native DNS。改用本文的 pooler 命令，并保留：

```bash
--dns-resolver https
```

### `password authentication failed`

说明连接到了数据库，但密码不对，或连接串里的用户名/项目 ref 不匹配。到 Supabase Dashboard 重置数据库密码：

```text
Project Settings -> Database -> Database password -> Reset database password
```

然后把新密码放进 `--db-url` 再试。

### `Remote migration versions not found in local migrations directory`

说明远端迁移历史有版本号，本地 `supabase/migrations` 缺同名版本文件。不要随便 repair 远端历史；优先补本地占位迁移文件，保持版本号一致。

## 备用部署方式

如果 `db push` 临时仍然不可用，可以通过 Management API 执行单个迁移：

```bash
supabase db query --linked -f supabase/migrations/<migration_file>.sql
```

执行后需要把对应版本写入远端迁移历史，否则以后 `db push` 会认为迁移历史不一致。

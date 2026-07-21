import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const psqlBin = process.env.LONG_TERM_REWARD_AUDIT_PSQL || 'psql'
const auditEnabled = process.env.LONG_TERM_REWARD_AUDIT_ALLOW === 'local-only'

if (!auditEnabled) {
  throw new Error('Refusing to run: set LONG_TERM_REWARD_AUDIT_ALLOW=local-only for an isolated local database.')
}

const psqlArgs = ['-X', '-v', 'ON_ERROR_STOP=1', '-At']

const runSql = (sql) => execFileSync(psqlBin, [...psqlArgs, '-c', sql], {
  encoding: 'utf8',
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
}).trim()

const runSqlConcurrent = (sql) => new Promise((resolve, reject) => {
  const child = spawn(psqlBin, [...psqlArgs, '-c', sql], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('error', reject)
  child.on('close', (code) => {
    if (code === 0) {
      resolve(stdout.trim())
    } else {
      reject(new Error(stderr.trim() || `psql exited with ${code}`))
    }
  })
})

const serverAddress = runSql("SELECT COALESCE(inet_server_addr()::TEXT, 'local-socket');")
if (!['local-socket', '127.0.0.1', '::1'].includes(serverAddress)) {
  throw new Error(`Refusing to run against non-local PostgreSQL server: ${serverAddress}`)
}

const teacherId = randomUUID()
const studentId = randomUUID()
const sessionId = `long-term-concurrency-${randomUUID()}`
const seedPayload = {
  _sync: {
    revision: 1,
    sessionId: 'long-term-concurrency-audit',
    playtimeSessionId: sessionId
  },
  playerInventory: [{ itemType: 'pokeball', itemKey: 'pokeball_basic', quantity: 1 }],
  world: { completionRewardClaimIds: [] }
}

const claimSql = (threshold, expectedRevision) => `
  SELECT row_to_json(result)::TEXT
  FROM claim_long_term_progression_reward(
    '${studentId}'::UUID,
    'map_completion',
    'GodotMap',
    ${threshold},
    NULL,
    1,
    ${expectedRevision},
    '${sessionId}',
    ${threshold}
  ) AS result;
`

try {
  runSql(`
    INSERT INTO users (id, email, username, nickname, role, registration_status)
    VALUES (
      '${teacherId}'::UUID,
      'concurrency-teacher-${teacherId}@invalid.local',
      'concurrency-teacher-${teacherId}',
      'Concurrency audit teacher',
      'teacher',
      'approved'
    );
    INSERT INTO users (
      id, email, username, nickname, role, teacher_id, gold, energy,
      max_energy, registration_status, daily_playtime_limit_minutes
    )
    VALUES (
      '${studentId}'::UUID,
      'concurrency-student-${studentId}@invalid.local',
      'concurrency-student-${studentId}',
      'Concurrency audit student',
      'student',
      '${teacherId}'::UUID,
      100,
      5,
      10,
      'approved',
      30
    );
    SELECT * FROM begin_student_playtime_session('${studentId}'::UUID, '${sessionId}');
    SELECT * FROM save_cloud_game_save(
      '${studentId}'::UUID,
      $payload$${JSON.stringify(seedPayload)}$payload$::JSONB
    );
  `)

  const sameClaimRows = await Promise.all([
    runSqlConcurrent(claimSql(25, 1)),
    runSqlConcurrent(claimSql(25, 1))
  ])
  const sameClaimResults = sameClaimRows.map((row) => JSON.parse(row))
  assert.equal(sameClaimResults.every((row) => row.accepted === true), true)
  assert.equal(sameClaimResults.filter((row) => row.already_claimed === false).length, 1)
  assert.equal(sameClaimResults.filter((row) => row.already_claimed === true).length, 1)
  assert.equal(sameClaimResults.every((row) => Number(row.save_revision) === 2), true)

  const sameClaimState = JSON.parse(runSql(`
    SELECT json_build_object(
      'revision', gs.save_revision,
      'claimCount', (
        SELECT COUNT(*)
        FROM jsonb_array_elements_text(gs.game_data #> '{world,completionRewardClaimIds}') AS claim(value)
        WHERE claim.value = 'map:GodotMap:completion:v1:25'
      ),
      'quantity', (
        SELECT COALESCE(SUM((slot.value ->> 'quantity')::INT), 0)
        FROM jsonb_array_elements(gs.game_data -> 'playerInventory') AS slot(value)
        WHERE slot.value ->> 'itemType' = 'pokeball'
          AND slot.value ->> 'itemKey' = 'pokeball_basic'
      )
    )::TEXT
    FROM game_saves gs
    WHERE gs.user_id = '${studentId}'::UUID;
  `))
  assert.deepEqual(sameClaimState, { revision: 2, claimCount: 1, quantity: 3 })

  const competingClaimRows = await Promise.all([
    runSqlConcurrent(claimSql(50, 2)),
    runSqlConcurrent(claimSql(75, 2))
  ])
  const competingClaimResults = competingClaimRows.map((row) => JSON.parse(row))
  assert.equal(competingClaimResults.filter((row) => row.accepted === true).length, 1)
  assert.equal(competingClaimResults.filter((row) => row.accepted === false).length, 1)
  assert.match(competingClaimResults.find((row) => row.accepted === false)?.error_message || '', /旧版本存档/)

  const finalState = JSON.parse(runSql(`
    SELECT json_build_object(
      'revision', gs.save_revision,
      'claimIds', gs.game_data #> '{world,completionRewardClaimIds}',
      'inventory', gs.game_data -> 'playerInventory'
    )::TEXT
    FROM game_saves gs
    WHERE gs.user_id = '${studentId}'::UUID;
  `))
  assert.equal(finalState.revision, 3)
  assert.equal(finalState.claimIds.length, 2)

  console.log(JSON.stringify({
    ok: true,
    serverAddress,
    checks: [
      'two simultaneous identical claims grant exactly once',
      'the losing identical request returns the committed row idempotently',
      'two simultaneous different claims from one revision allow only one commit',
      'reward inventory and claim fact advance in the same revision'
    ],
    sameClaimState,
    finalRevision: finalState.revision
  }, null, 2))
} finally {
  runSql(`DELETE FROM users WHERE id = '${teacherId}'::UUID;`)
}

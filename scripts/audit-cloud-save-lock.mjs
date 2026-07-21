#!/usr/bin/env node
import assert from 'node:assert/strict'

import {
  clearCloudSaveQueue,
  saveCloudGameWithLock,
} from '../src/utils/cloudSaveLock.js'

const createGate = () => {
  let release
  const promise = new Promise((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const runSerialOrderCheck = async () => {
  clearCloudSaveQueue()
  const gate = createGate()
  const trace = []

  const firstSave = saveCloudGameWithLock(async () => {
    trace.push('first:start')
    await gate.promise
    trace.push('first:end')
    return 'first'
  })
  const secondSave = saveCloudGameWithLock(async () => {
    trace.push('second:start')
    return 'second'
  })

  assert.deepEqual(trace, ['first:start'])
  gate.release()
  assert.deepEqual(await Promise.all([firstSave, secondSave]), ['first', 'second'])
  assert.deepEqual(trace, ['first:start', 'first:end', 'second:start'])
}

const runQueuedFailureCheck = async () => {
  clearCloudSaveQueue()
  const gate = createGate()
  const trace = []

  const firstSave = saveCloudGameWithLock(async () => {
    trace.push('first:start')
    await gate.promise
    trace.push('first:end')
    return 'first'
  })
  const failedSave = saveCloudGameWithLock(async () => {
    trace.push('failed:start')
    throw new Error('queued-save-failed')
  })
  const finalSave = saveCloudGameWithLock(async () => {
    trace.push('final:start')
    return 'final'
  })

  const settledSaves = Promise.allSettled([firstSave, failedSave, finalSave])
  gate.release()
  const results = await settledSaves

  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.match(results[1].reason?.message || '', /queued-save-failed/)
  assert.deepEqual(results[2], { status: 'fulfilled', value: 'final' })
  assert.deepEqual(trace, [
    'first:start',
    'first:end',
    'failed:start',
    'final:start',
  ])
}

const runClearQueueCheck = async () => {
  clearCloudSaveQueue()
  const gate = createGate()
  const activeSave = saveCloudGameWithLock(async () => {
    await gate.promise
    return 'active'
  })
  const queuedSave = saveCloudGameWithLock(async () => 'should-not-run')
  const queuedResult = queuedSave.then(
    (value) => ({ status: 'fulfilled', value }),
    (error) => ({ status: 'rejected', message: error?.message || '' }),
  )

  clearCloudSaveQueue(new Error('test-clear'))
  gate.release()

  assert.equal(await activeSave, 'active')
  assert.deepEqual(await queuedResult, { status: 'rejected', message: 'test-clear' })
}

await runSerialOrderCheck()
await runQueuedFailureCheck()
await runClearQueueCheck()

console.log(JSON.stringify({
  summary: {
    checkCount: 3,
    failedCount: 0,
  },
  checks: [
    'queued saves execute serially',
    'queued rejection reaches its caller and the queue continues',
    'clearing the queue rejects pending callers without unlocking the active save',
  ],
}, null, 2))

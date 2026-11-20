import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const serverFile = fileURLToPath(
  new URL('../server/index.mjs', import.meta.url),
)

async function launch(directory, demo = false) {
  const child = spawn(process.execPath, [serverFile], {
    env: {
      ...process.env,
      PORT: '0',
      STACKPILOT_DATA: directory,
      STACKPILOT_DEMO: demo ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const closed = once(child, 'close')
  let errors = ''
  child.stderr.setEncoding('utf8').on('data', (chunk) => (errors += chunk))
  let base
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error('Server did not start: ' + errors)),
        8000,
      )
      child.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('close', (code) => {
        clearTimeout(timeout)
        reject(Error('Exit ' + code + ': ' + errors))
      })
      child.stdout.setEncoding('utf8').on('data', (chunk) => {
        const result = chunk.match(/http:\/\/127\.0\.0\.1:\d+/)
        if (result) {
          base = result[0]
          clearTimeout(timeout)
          resolve()
        }
      })
    })
  } catch (error) {
    child.kill()
    throw error
  }
  return {
    base,
    async get() {
      const response = await fetch(base + '/api/workspace')
      assert.equal(response.status, 200)
      return response.json()
    },
    async post(route, payload, token) {
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = 'Bearer ' + token
      const response = await fetch(base + '/api/' + route, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      return { status: response.status, data: await response.json() }
    },
    async stop() {
      child.kill()
      await closed
    },
  }
}

const registration = {
  name: '订单任务',
  kind: 'commerce',
  description: '集成测试程序',
  owner: '测试组',
  folder: '/opt/local/orders',
  url: 'http://127.0.0.1:9009',
  timeout: 2,
}
const failed = {
  eventId: 'content-import-42',
  title: '订单导入',
  status: 'failed',
  duration: 1270,
  message: '缺少订单编号',
}

test('程序密钥、心跳、幂等运行、告警和持久化通过本机 HTTP 接口联动', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'stackpilot-http-'))
  let service = await launch(directory)
  t.after(async () => {
    await service.stop()
    await rm(directory, { force: true, recursive: true })
  })
  assert.equal((await service.get()).apps.length, 0)
  const invalid = await service.post('apps', {
    ...registration,
    url: 'file:///tmp/local',
  })
  assert.equal(invalid.status, 400)
  const registrationResult = await service.post('apps', registration)
  assert.equal(registrationResult.status, 201)
  const { id, token } = registrationResult.data
  let workspace = await service.get()
  assert.equal(workspace.apps[0].health, 'pending')
  assert.equal(workspace.apps[0].folder, registration.folder)
  assert.equal(workspace.apps[0].url, registration.url)
  assert.equal('tokenHash' in workspace.apps[0], false)
  assert.equal(JSON.stringify(workspace).includes(token), false)

  const beat = (status, secret = token) =>
    service.post(
      'ingest/' + id + '/heartbeat',
      { status, message: '采集服务超时' },
      secret,
    )
  const report = (content, secret = token) =>
    service.post('ingest/' + id + '/runs', content, secret)
  assert.equal((await beat('healthy', 'unknown')).status, 401)
  const second = await service.post('apps', {
    ...registration,
    name: '第二个应用',
  })
  assert.equal((await beat('healthy', second.data.token)).status, 401)
  assert.equal((await beat('invalid')).status, 400)
  assert.equal((await beat('warning')).status, 200)
  await beat('warning')
  workspace = await service.get()
  assert.equal(workspace.apps.find((app) => app.id === id).health, 'warning')
  assert.equal(workspace.alerts.length, 1)
  const incidentId = workspace.alerts[0].id
  assert.equal(
    (await service.post('alerts/' + incidentId, { state: 'ack' })).status,
    200,
  )
  assert.equal((await service.get()).alerts[0].state, 'ack')
  await beat('healthy')
  workspace = await service.get()
  assert.equal(workspace.apps.find((app) => app.id === id).health, 'healthy')
  assert.equal(workspace.alerts[0].state, 'resolved')
  assert.equal(
    (await service.post('alerts/' + incidentId, { state: 'ack' })).status,
    409,
  )

  const responses = await Promise.all([
    report(failed),
    report(failed),
    report(failed),
  ])
  assert.ok(responses.every((response) => response.status === 200))
  assert.equal(
    responses.filter((response) => !response.data.duplicate).length,
    1,
  )
  assert.equal(new Set(responses.map((response) => response.data.id)).size, 1)
  assert.equal(
    (await report({ ...failed, duration: -1, eventId: 'bad-duration' })).status,
    400,
  )
  workspace = await service.get()
  assert.equal(workspace.runs.length, 1)
  assert.equal(
    workspace.alerts.filter(
      (alert) => alert.cause === 'run:' + workspace.runs[0].id,
    ).length,
    1,
  )

  // Backdate a real persisted heartbeat to exercise expiry and recovery without a two-minute sleep.
  const db = new DatabaseSync(path.join(directory, 'workspace.sqlite'))
  try {
    db.prepare('UPDATE apps SET lastSeen=? WHERE id=?').run(
      Date.now() - 180000,
      id,
    )
  } finally {
    db.close()
  }
  await service.get()
  workspace = await service.get()
  assert.equal(workspace.apps.find((app) => app.id === id).health, 'offline')
  assert.equal(
    workspace.alerts.filter((a) => a.cause.startsWith('offline:')).length,
    1,
  )
  await beat('healthy')
  assert.equal(
    (await service.get()).alerts.find((a) => a.cause.startsWith('offline:'))
      .state,
    'resolved',
  )

  const rotated = await service.post('apps/' + id + '/rotate', {})
  assert.equal(rotated.status, 200)
  assert.notEqual(rotated.data.token, token)
  assert.equal((await beat('healthy')).status, 401)
  assert.equal((await beat('healthy', rotated.data.token)).status, 200)
  assert.equal(
    (
      await service.post('apps/' + id, {
        ...registration,
        name: '订单导入工具',
        kind: 'tool',
      })
    ).status,
    200,
  )
  await service.stop()
  service = await launch(directory)
  workspace = await service.get()
  assert.equal(workspace.apps.find((app) => app.id === id).name, '订单导入工具')
  assert.equal(workspace.apps.find((app) => app.id === id).kind, 'tool')
  assert.equal(workspace.runs[0].title, failed.title)
  assert.equal((await report(failed, rotated.data.token)).data.duplicate, true)
})

test('示例数据可追溯、支持 gzip 且重启不重复创建', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'stackpilot-demo-'))
  let service = await launch(directory, true)
  t.after(async () => {
    await service.stop()
    await rm(directory, { force: true, recursive: true })
  })
  const response = await fetch(service.base + '/api/workspace', {
    headers: { 'Accept-Encoding': 'gzip' },
  })
  assert.equal(response.headers.get('Content-Encoding'), 'gzip')
  const workspace = await response.json()
  assert.equal(
    workspace.apps.filter((a) => a.project.source === 'demo').length,
    12,
  )
  assert.ok(
    workspace.apps
      .filter((a) => a.project.source === 'demo')
      .every((a) => a.demo === 1),
  )
  assert.ok(workspace.runs.length > 1000)
  assert.ok(workspace.runs.every((run) => run.time <= workspace.now))
  assert.ok(
    workspace.alerts.every((alert) =>
      workspace.apps.some((a) => a.id === alert.appId),
    ),
  )
  const failure = workspace.alerts.find((a) => a.cause.startsWith('run:'))
  assert.ok(
    workspace.runs.some(
      (r) =>
        r.id === failure.cause.slice(4) &&
        r.status === 'failed' &&
        r.appId === failure.appId,
    ),
  )
  assert.equal(
    (
      await service.post(
        'apps/' + workspace.apps.find((a) => a.demo).id + '/rotate',
        {},
      )
    ).status,
    400,
  )
  await service.post('alerts/' + failure.id, { state: 'resolved' })
  await service.stop()
  service = await launch(directory, true)
  const next = await service.get()
  assert.equal(next.runs.length, workspace.runs.length)
  assert.equal(next.alerts.find((a) => a.id === failure.id).state, 'resolved')
})

test('工具登记、发布、反馈和归档在重启后仍可关联', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'stackpilot-catalog-'))
  let service = await launch(directory, true)
  t.after(async () => {
    await service.stop()
    await rm(directory, { force: true, recursive: true })
  })
  const initial = await service.get()
  assert.ok(
    initial.apps.every((app) => app.usage && app.lifecycle === 'active'),
  )
  assert.ok(
    initial.releases.every((r) => initial.apps.some((a) => r.appId === a.id)),
  )
  assert.ok(
    initial.feedback.every((f) =>
      initial.releases.some(
        (r) => f.appId === r.appId && f.version === r.version,
      ),
    ),
  )
  assert.ok(
    initial.releases.some(
      (release) => release.url === '/demo/sheet-clean.html',
    ),
  )
  const demoId = 'SHEET-CLEAN'
  const catalog = {
    mode: 'web',
    lifecycle: 'archived',
    usage: '在网页中清洗表格，保留原文件。',
  }
  assert.equal(
    (await service.post('apps/' + demoId + '/catalog', catalog)).status,
    200,
  )

  const newApp = await service.post('apps', {
    ...registration,
    kind: 'tool',
    mode: 'web',
    usage: '输入店铺商品编码。',
  })
  assert.equal(newApp.status, 201)
  const appId = newApp.data.id
  assert.equal((await service.post('apps/' + appId, registration)).status, 200)
  const catalogApp = (await service.get()).apps.find((app) => app.id === appId)
  assert.equal(catalogApp.mode, 'web')
  assert.equal(catalogApp.usage, '输入店铺商品编码。')

  const release = { appId, version: '1.0.0', notes: '首个试用版本。', url: '' }
  assert.equal(
    (await service.post('releases', { ...release, url: 'file:///tmp/app' }))
      .status,
    400,
  )
  assert.equal(
    (await service.post('releases', { ...release, url: '/demo/../index.html' }))
      .status,
    400,
  )
  assert.equal(
    (await service.post('releases', { ...release, appId: 'missing' })).status,
    404,
  )
  const saved = await Promise.all([
    service.post('releases', release),
    service.post('releases', release),
  ])
  assert.deepEqual(saved.map((r) => r.status).sort(), [201, 409])
  const second = await service.post('releases', {
    ...release,
    version: '1.1.0',
    url: 'https://example.com/tool.zip',
  })
  assert.equal(second.status, 201)
  assert.equal(
    (
      await service.post('releases', {
        ...release,
        appId: demoId,
        version: '1.0.0',
        url: '/demo/sheet-clean.html',
      })
    ).status,
    201,
  )
  const fb = await service.post('feedback', {
    appId,
    version: '1.0.0',
    title: '导出失败',
    detail: '文件被占用时缺少提示。',
    reporter: '仓储组',
  })
  assert.equal(fb.status, 201)
  assert.equal(fb.data.state, 'open')
  assert.equal(
    (await service.post('feedback/' + fb.data.id, { state: 'invalid' })).status,
    400,
  )
  assert.equal(
    (await service.post('feedback/' + fb.data.id, { state: 'ack' })).status,
    200,
  )
  assert.equal(
    (await service.post('feedback/' + fb.data.id, { state: 'resolved' }))
      .status,
    200,
  )
  await service.stop()
  service = await launch(directory, true)
  const final = await service.get()
  assert.equal(
    final.feedback.find((f) => f.id === fb.data.id).state,
    'resolved',
  )
  assert.equal(final.releases.filter((r) => r.appId === appId).length, 2)
  assert.equal(final.releases.length, initial.releases.length + 3)
  const archived = final.apps.find((a) => a.id === demoId)
  assert.equal(archived.lifecycle, 'archived')
  assert.equal(archived.usage, catalog.usage)
})

test('原有 SQLite 档案就地升级并保留密钥、历史和告警处理状态', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'stackpilot-legacy-'))
  let service = await launch(directory)
  t.after(async () => {
    await service.stop()
    await rm(directory, { force: true, recursive: true })
  })
  const { data: app } = await service.post('apps', registration)
  const { data: tool } = await service.post('apps', {
    ...registration,
    kind: 'tool',
  })
  await service.post('ingest/' + app.id + '/runs', failed, app.token)
  const original = await service.get()
  await service.post('alerts/' + original.alerts[0].id, { state: 'ack' })
  await service.stop()
  // Recreate the exact prior schema with already-populated apps, runs and alerts.
  const db = new DatabaseSync(path.join(directory, 'workspace.sqlite'))
  try {
    db.exec(`DROP TABLE feedback; DROP TABLE releases;
      ALTER TABLE apps DROP COLUMN mode; ALTER TABLE apps DROP COLUMN usage; ALTER TABLE apps DROP COLUMN lifecycle`)
  } finally {
    db.close()
  }
  service = await launch(directory)
  const migrated = await service.get()
  assert.equal(migrated.apps.find((a) => a.id === app.id).mode, 'scheduled')
  assert.equal(migrated.apps.find((a) => a.id === tool.id).mode, 'desktop')
  assert.deepEqual(migrated.runs, original.runs)
  assert.equal(migrated.alerts[0].state, 'ack')
  assert.equal(migrated.alerts[0].id, original.alerts[0].id)
  assert.equal(
    (
      await service.post(
        'ingest/' + app.id + '/heartbeat',
        { status: 'healthy' },
        app.token,
      )
    ).status,
    200,
  )
})

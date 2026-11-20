import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { openStore } from '../server/store.mjs'
import { updateSeat, importNames } from '../server/office.mjs'

const serverFile = fileURLToPath(
  new URL('../server/index.mjs', import.meta.url),
)
const ids = 'A1 A2 A3 B1 B2 B3 B4 B5 B6 C1 C2 C3 C4 D1 D2 D3 D4 D5 D6'.split(
  ' ',
)
const userApp = {
  name: '用户已有程序',
  kind: 'tool',
  description: '',
  owner: '',
  folder: '',
  url: '',
  mode: 'desktop',
  usage: '',
  timeout: 15,
}

test('19 席迁移保留旧库；示例关联可清除，非演示工作区保持空白', async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'stackpilot-office-old-'))
  const filename = path.join(folder, 'workspace.sqlite')
  let store = openStore(filename, false)
  t.after(async () => {
    store.db.close()
    await rm(folder, { recursive: true, force: true })
  })
  const real = store.register(userApp)
  const before = store.snapshot()
  assert.deepEqual(
    before.officeSeats.map((s) => s.id),
    ids,
  )
  assert.ok(
    before.officeSeats.every(
      (s) => !s.name && !s.example && s.revision === 0 && !s.appIds.length,
    ),
  )
  store.db.exec('DROP TABLE office_seat_apps; DROP TABLE office_seats')
  store.db.close()
  store = openStore(filename, true)
  const migrated = store.snapshot()
  assert.deepEqual(
    migrated.apps.find((a) => a.id === real.id),
    before.apps[0],
  )
  assert.ok(store.authenticate(real.id, real.token))
  const examples = migrated.officeSeats.filter((s) => s.example)
  assert.equal(examples.length, 6)
  const activeIds = new Set(migrated.apps.map((a) => a.id))
  assert.ok(
    examples.every(
      (s) => s.appIds.length && s.appIds.every((id) => activeIds.has(id)),
    ),
  )
  assert.ok(migrated.officeSeats.every((s) => !s.name))
  updateSeat(store, 'A1', { name: '', appIds: [], revision: 0 })
  store.db.close()
  store = openStore(filename, true)
  assert.deepEqual(
    store.snapshot().officeSeats.find((s) => s.id === 'A1'),
    {
      ...migrated.officeSeats[0],
      id: 'A1',
      name: '',
      appIds: [],
      example: false,
      revision: 1,
    },
  )
})

test('姓名导入保持已有姓名和项目；无效请求回滚整笔编辑或导入', (t) => {
  const store = openStore(':memory:', true)
  t.after(() => store.db.close())
  const old = store.snapshot().officeSeats
  assert.throws(
    () => importNames(store, { names: { A1: '旧录入', Z9: '错误' } }),
    { status: 400 },
  )
  assert.deepEqual(store.snapshot().officeSeats, old)
  assert.throws(
    () =>
      updateSeat(store, 'C2', {
        name: '变更',
        appIds: ['ORDER-SYNC', 'unknown'],
        revision: 0,
      }),
    { status: 400 },
  )
  assert.deepEqual(store.snapshot().officeSeats, old)
  assert.throws(
    () =>
      updateSeat(store, 'C2', {
        name: '',
        appIds: ['ORDER-SYNC', 'ORDER-SYNC'],
        revision: 0,
      }),
    { status: 400 },
  )
  assert.deepEqual(
    importNames(store, { names: { A1: '  本机旧名  ', B1: '', A2: '第二席' } }),
    { imported: 2 },
  )
  assert.deepEqual(
    importNames(store, { names: { A1: '另一姓名', A2: '第二席' } }),
    { imported: 0 },
  )
  assert.deepEqual(store.snapshot().officeSeats[0], {
    ...old[0],
    name: '本机旧名',
    revision: 1,
  })
  assert.throws(
    () => updateSeat(store, 'A1', { name: '过期', appIds: [], revision: 0 }),
    { status: 409 },
  )
  const seat = updateSeat(store, 'A1', {
    name: '核实姓名',
    appIds: ['ORDER-SYNC', 'SHEET-CLEAN'],
    revision: 1,
  })
  assert.equal(seat.example, false)
  assert.deepEqual(store.snapshot().officeSeats[0].appIds, [
    'ORDER-SYNC',
    'SHEET-CLEAN',
  ])
})

async function startService(directory) {
  const child = spawn(process.execPath, [serverFile], {
    env: {
      ...process.env,
      PORT: '0',
      STACKPILOT_DEMO: '1',
      STACKPILOT_DATA: directory,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const closed = once(child, 'close')
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('服务启动超时')), 8000)
      child.once('error', (e) => {
        clearTimeout(timer)
        reject(e)
      })
      child.once('close', (code) => {
        clearTimeout(timer)
        reject(Error('服务退出 ' + code))
      })
      child.stdout.setEncoding('utf8').on('data', (message) => {
        const address = message.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
        if (address) {
          clearTimeout(timer)
          resolve(address)
        }
      })
    })
    return {
      url,
      async stop() {
        child.kill()
        await closed
      },
    }
  } catch (error) {
    child.kill()
    throw error
  }
}
async function subscriber(url) {
  const response = await fetch(url + '/api/office/events')
  assert.match(response.headers.get('content-type'), /^text\/event-stream/)
  const reader = response.body.getReader()
  let buffer = ''
  return {
    async next() {
      while (!buffer.includes('\n\n')) {
        const result = await reader.read()
        if (result.done) throw Error('事件流已结束')
        buffer += new TextDecoder().decode(result.value)
      }
      const at = buffer.indexOf('\n\n')
      const frame = buffer.slice(0, at)
      buffer = buffer.slice(at + 2)
      return frame
    },
    close() {
      return reader.cancel()
    },
  }
}

test(
  '并发编辑仅一次生效，事件流发送变更信号且重连可恢复',
  { timeout: 10000 },
  async (t) => {
    const folder = await mkdtemp(
      path.join(tmpdir(), 'stackpilot-office-events-'),
    )
    const server = await startService(folder)
    const streams = []
    t.after(async () => {
      await Promise.all(streams.map((s) => s.close()))
      await server.stop()
      await rm(folder, { recursive: true, force: true })
    })
    const post = (route, payload, token) =>
      fetch(server.url + '/api/' + route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify(payload),
      })
    const get = async () => (await fetch(server.url + '/api/workspace')).json()
    const stream = await subscriber(server.url)
    streams.push(stream)
    assert.equal(await stream.next(), 'retry: 2500\ndata: changed')
    const edits = await Promise.all(
      ['甲', '乙'].map((name) =>
        post('office/seats/A1', { name, appIds: ['ORDER-SYNC'], revision: 0 }),
      ),
    )
    assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409])
    assert.equal(await stream.next(), 'data: changed')
    const changed = await edits.find((response) => response.ok).json()
    assert.deepEqual(
      (await get()).officeSeats.find((s) => s.id === 'A1'),
      changed,
    )
    const action = await post('office/seats/A1/life', {
      action: 'chat',
      partnerId: 'B2',
    })
    assert.equal(action.status, 200)
    assert.equal(await stream.next(), 'data: changed')
    const talking = await action.json()
    const partner = (await get()).officeSeats.find((s) => s.id === 'B2')
    assert.equal(talking.lifeCue.partnerId, 'B2')
    assert.equal(talking.revision, changed.revision)
    assert.deepEqual(partner.lifeCue, { ...talking.lifeCue, partnerId: 'A1' })
    const swapped = await post('office/seats/A1/swap', {
      targetId: 'A2',
      revision: changed.revision,
      targetRevision: 0,
    })
    assert.equal(swapped.status, 200)
    assert.equal(
      (await swapped.json()).seats[1].character.id,
      talking.character.id,
    )
    assert.equal(await stream.next(), 'data: changed')
    const app = await (await post('apps', userApp)).json()
    assert.equal(await stream.next(), 'data: changed')
    const operations = [
      ['ingest/' + app.id + '/heartbeat', { status: 'warning' }, app.token],
      [
        'ingest/' + app.id + '/runs',
        { eventId: 'A', status: 'success', duration: 100, title: '核对' },
        app.token,
      ],
      ['feedback', { appId: app.id, title: '请增加使用说明' }],
      ['releases', { appId: app.id, version: '1.0', notes: '首发' }],
      ['office/import-names', { names: { D6: '旧姓名' } }],
    ]
    for (const [route, data, token] of operations) {
      assert.ok((await post(route, data, token)).ok)
      assert.equal(await stream.next(), 'data: changed')
    }
    const snapshot = await get()
    assert.ok(
      (
        await post(
          'alerts/' + snapshot.alerts.find((a) => a.appId === app.id).id,
          { state: 'ack' },
        )
      ).ok,
    )
    assert.equal(await stream.next(), 'data: changed')
    await stream.close()
    streams.pop()
    const reconnected = await subscriber(server.url)
    streams.push(reconnected)
    assert.equal(await reconnected.next(), 'retry: 2500\ndata: changed')
    assert.equal(
      (await get()).officeSeats.find((s) => s.id === 'D6').name,
      '旧姓名',
    )
  },
)

import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  localChats,
  parseThreadId,
  withChatLinks,
  handleChatRequest,
} from '../server/chats.mjs'
import { openStore } from '../server/store.mjs'

function fixture(t) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'chat-meta-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'))
  db.exec(
    'CREATE TABLE threads(id TEXT,name TEXT,title TEXT,cwd TEXT,source TEXT,agent_role TEXT,agent_path TEXT,archived INTEGER,updated_at INTEGER,preview TEXT,first_user_message TEXT)',
  )
  const insert = db.prepare(
    'INSERT INTO threads VALUES(?,?,?,?,?,NULL,NULL,?,?,?,?)',
  )
  const one = randomUUID(),
    two = randomUUID()
  insert.run(
    one,
    '我的工具箱',
    '原始标题',
    '/work/toolkit',
    'vscode',
    0,
    4,
    'private message',
    'private prompt',
  )
  insert.run(
    two,
    null,
    '表格工具',
    '/work/sheets',
    'cli',
    0,
    2,
    'private message',
    'private prompt',
  )
  insert.run(
    randomUUID(),
    '内部代理',
    '子任务',
    '/work/toolkit',
    '{"subagent":{}}',
    0,
    7,
    'private message',
    'private prompt',
  )
  insert.run(
    randomUUID(),
    '存档',
    '存档',
    '/work/old',
    'vscode',
    1,
    9,
    'private message',
    'private prompt',
  )
  db.close()
  return { home, one, two }
}
test('reads only named, user-visible thread metadata with paging, search and suggested candidates', (t) => {
  const { home, one, two } = fixture(t)
  const result = localChats({ home, limit: 1 })
  assert.equal(result.available, true)
  assert.equal(result.total, 2)
  assert.deepEqual(result.threads, [
    { threadId: one, title: '我的工具箱', cwd: '/work/toolkit' },
  ])
  assert.equal(
    localChats({ home, limit: 1, offset: 1 }).threads[0].threadId,
    two,
  )
  assert.equal(localChats({ home, q: 'SHEETS' }).total, 1)
  assert.equal(
    localChats({ home, hints: ['toolkit', '未匹配'] }).threads[0].threadId,
    one,
  )
  assert.equal(localChats({ home, q: 'private' }).total, 0)
  assert.equal(
    localChats({ home: path.join(home, 'missing') }).available,
    false,
  )
})
test('only accepts a technical thread ID or a canonical, local conversation link', () => {
  const id = randomUUID()
  assert.equal(parseThreadId(id.toUpperCase()), id)
  assert.equal(parseThreadId('codex://threads/' + id), id)
  for (const v of [
    'https://example.com/' + id,
    'codex://threads/new',
    'codex://threads/' + id + '?cmd=run',
    [],
    null,
  ])
    assert.equal(parseThreadId(v), null)
})
test('associations survive reopening, are idempotent, and can be unlinked independently of conversations', async (t) => {
  const { home, one } = fixture(t)
  const saved = process.env.STACKPILOT_CODEX_HOME
  process.env.STACKPILOT_CODEX_HOME = home
  t.after(() => {
    if (saved === undefined) delete process.env.STACKPILOT_CODEX_HOME
    else process.env.STACKPILOT_CODEX_HOME = saved
  })
  const filename = path.join(home, 'workspace.sqlite')
  let store = openStore(filename, false)
  const appId = store.register({
    name: '项目',
    kind: 'tool',
    folder: '',
    owner: '',
    url: '',
    timeout: 15,
    description: '',
    mode: 'desktop',
    usage: '',
  }).id
  async function call(route, data) {
    let value
    await handleChatRequest({
      req: { method: 'POST', url: route },
      route,
      store,
      json: (_, v) => {
        value = v
      },
      body: async () => data,
      fail: (status, m) => Object.assign(Error(m), { status }),
    })
    return value
  }
  const item = await call('/api/chat-links', {
    threadId: 'codex://threads/' + one,
    appId,
  })
  assert.equal(item.title, '我的工具箱')
  assert.equal(
    (await call('/api/chat-links', { threadId: one, appId })).id,
    item.id,
  )
  assert.equal(withChatLinks(store, {}).chatLinks.length, 1)
  store.db.close()
  store = openStore(filename, false)
  assert.equal(withChatLinks(store, {}).chatLinks[0].cwd, '/work/toolkit')
  const manual = await call('/api/chat-links', {
    threadId: randomUUID(),
    appId,
    title: '手动引入',
  })
  assert.equal(manual.title, '手动引入')
  await call('/api/chat-links/' + item.id + '/unlink', {})
  assert.equal(withChatLinks(store, {}).chatLinks.length, 1)
  assert.equal(localChats({ home }).total, 2)
  store.db.close()
})

test('migrates old links and imports separate machines atomically, leaving local titles and station routes independent', async (t) => {
  const { home, one } = fixture(t)
  const filename = path.join(home, 'manager.sqlite')
  let store = openStore(filename, false)
  t.after(() => store.db.close())
  const appId = store.register({
    name: '测试项目',
    kind: 'tool',
    folder: '',
    owner: '',
    url: '',
    timeout: 15,
    description: '',
    mode: 'desktop',
    usage: '',
  }).id
  const previousId = randomUUID()
  store.db.exec(
    'CREATE TABLE chat_links (id TEXT PRIMARY KEY,appId TEXT NOT NULL REFERENCES apps(id),threadId TEXT NOT NULL,title TEXT NOT NULL,cwd TEXT NOT NULL,UNIQUE(appId,threadId))',
  )
  store.exec(
    'INSERT INTO chat_links VALUES(?,?,?,?,?)',
    previousId,
    appId,
    one,
    '本机对话',
    '/local',
  )
  const local = withChatLinks(store, {}).chatLinks
  assert.deepEqual(
    local.map((l) => [l.id, l.location, l.machine, l.stationUrl]),
    [[previousId, 'local', '', '']],
  )
  async function call(route, data) {
    let result
    await handleChatRequest({
      req: { method: 'POST', url: route },
      route,
      store,
      body: async () => data,
      fail: (status, m) => Object.assign(Error(m), { status }),
      json: (_, v) => {
        result = v
      },
    })
    return result
  }
  const link = {
    appId,
    threadId: one,
    title: '来自开发机的标题',
    cwd: 'D:/tools',
  }
  const bundle = {
    format: 'stackpilot-chat-links',
    version: 1,
    machine: 'Dev-PC',
    links: [link],
    stationUrl: 'rustdesk://123456789',
  }
  assert.deepEqual(await call('/api/chat-links/import', bundle), {
    added: 1,
    updated: 0,
    unchanged: 0,
    total: 1,
  })
  assert.deepEqual(
    await call('/api/chat-links/import', { ...bundle, machine: 'dev-pc' }),
    { added: 0, updated: 0, unchanged: 1, total: 1 },
  )
  const different = await call('/api/chat-links', {
    ...link,
    location: 'remote',
    machine: '另一台电脑',
  })
  assert.equal(different.stationUrl, '')
  assert.equal(different.title, link.title)
  assert.equal(different.cwd, link.cwd)
  const changed = { ...link, title: '已更新标题' }
  assert.equal(
    (await call('/api/chat-links/import', { ...bundle, links: [changed] }))
      .updated,
    1,
  )
  const before = withChatLinks(store, {}).chatLinks
  assert.equal(before.length, 3)
  assert.equal(before.find((l) => l.location === 'local').title, '本机对话')
  assert.equal(
    before.find((l) => l.machine === 'Dev-PC').stationUrl,
    bundle.stationUrl,
  )
  await assert.rejects(
    call('/api/chat-links/import', {
      ...bundle,
      links: [
        { ...changed, title: '不应保存' },
        { ...link, appId: '不存在' },
      ],
    }),
  )
  await assert.rejects(
    call('/api/chat-links/import', {
      ...bundle,
      links: [{ ...link, threadId: 'bad' }],
    }),
  )
  await assert.rejects(
    call('/api/chat-links/import', {
      ...bundle,
      stationUrl: 'javascript:alert(1)',
    }),
  )
  await assert.rejects(
    call('/api/chat-links/import', { ...bundle, links: Array(201).fill(link) }),
  )
  assert.deepEqual(withChatLinks(store, {}).chatLinks, before)
  const sibling = { ...link, threadId: randomUUID() }
  await call('/api/chat-links/import', { ...bundle, links: [sibling] })
  await call('/api/chat-stations', {
    machine: 'DEV-PC',
    url: 'https://remote.example/connect',
  })
  assert.equal(
    withChatLinks(store, {}).chatLinks.filter(
      (l) => l.stationUrl === 'https://remote.example/connect',
    ).length,
    2,
  )
  await call('/api/chat-links/' + different.id + '/unlink', {})
  store.db.close()
  store = openStore(filename, false)
  const readback = withChatLinks(store, {}).chatLinks
  assert.equal(readback.length, 3)
  assert.ok(readback.find((l) => l.id === previousId))
  assert.equal(readback.filter((l) => l.location === 'remote').length, 2)
})

import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const python = process.platform === 'win32' ? ['py', '-3'] : ['python3']
const hasPython =
  spawnSync(python[0], [...python.slice(1), '--version']).status === 0
const serverFile = fileURLToPath(
  new URL('../server/index.mjs', import.meta.url),
)

async function start(command, args, env) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const closed = once(child, 'close')
  let errors = ''
  child.stderr.setEncoding('utf8').on('data', (text) => (errors += text))
  try {
    const base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error('启动超时：' + errors)),
        8000,
      )
      child.once('error', (e) => {
        clearTimeout(timeout)
        reject(e)
      })
      child.once('close', () => {
        clearTimeout(timeout)
        reject(Error('服务已退出：' + errors))
      })
      child.stdout.setEncoding('utf8').on('data', (part) => {
        const url = part.match(/http:\/\/127\.0\.0\.1:\d+\S*/)
        if (url) {
          clearTimeout(timeout)
          resolve(url[0])
        }
      })
    })
    return {
      base,
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

function codexIndex(folder, rows) {
  const db = new DatabaseSync(path.join(folder, 'state_12.sqlite'))
  try {
    db.exec(
      'CREATE TABLE threads(id TEXT,source TEXT,title TEXT,cwd TEXT,archived INTEGER,agent_path TEXT,body TEXT,updated_at INTEGER)',
    )
    const insert = db.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?,?)')
    for (const [id, title, archived, agent] of rows)
      insert.run(
        id,
        agent ? 'subagent' : 'cli',
        title,
        '/project',
        archived,
        agent ? '/root/helper' : '/root',
        '仅用于验证的消息正文',
        Date.now(),
      )
  } finally {
    db.close()
  }
}

test(
  '下载单文件助手，在另一份 Codex 库选择会话，按项目导出关联清单',
  { skip: !hasPython && '需要 Python 3' },
  async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'stackpilot-station-'))
    const home = path.join(directory, 'local-codex'),
      remote = path.join(directory, 'remote-codex'),
      indexOnly = path.join(directory, 'jsonl-codex')
    await Promise.all([mkdir(home), mkdir(remote), mkdir(indexOnly)])
    const localId = randomUUID(),
      picked = randomUUID(),
      unpicked = randomUUID()
    codexIndex(home, [[localId, '工作台本地会话', 0, false]])
    codexIndex(remote, [
      [picked, '库存功能开发', 0, false],
      [unpicked, '另一个用户会话', 0, false],
      [randomUUID(), '内部子任务', 0, true],
      [randomUUID(), '已归档会话', 1, false],
    ])
    // An older, incompatible database must not outrank state_12.
    await writeFile(path.join(remote, 'state_2.sqlite'), 'incompatible')
    const service = await start(process.execPath, [serverFile], {
      PORT: '0',
      STACKPILOT_DATA: path.join(directory, 'workspace'),
      STACKPILOT_DEMO: '1',
      STACKPILOT_CODEX_HOME: home,
    })
    const helpers = []
    t.after(async () => {
      for (const helper of helpers) await helper.stop()
      await service.stop()
      await rm(directory, { recursive: true, force: true })
    })
    async function downloaded(suffix, remoteHome, name) {
      const response = await fetch(
        service.base + '/api/chat-station/helper.py' + suffix,
      )
      assert.equal(response.status, 200)
      assert.match(
        response.headers.get('content-disposition'),
        /StackPilot-Chat-Link\.py/,
      )
      const source = await response.text()
      assert.ok(!source.includes(localId))
      const file = path.join(directory, name + '.py')
      await writeFile(file, source)
      const helper = await start(
        python[0],
        [...python.slice(1), file, '--no-browser'],
        { CODEX_HOME: remoteHome },
      )
      helpers.push(helper)
      return helper.base
    }
    assert.equal(
      (await fetch(service.base + '/api/chat-station/helper.py?app=missing'))
        .status,
      404,
    )
    const base = await downloaded('?app=STOCK-WATCH', remote, 'scope')
    const data = await (await fetch(base + 'data')).json()
    assert.deepEqual(data.projects, [
      { id: 'STOCK-WATCH', name: '库存巡检助手' },
    ])
    assert.equal(data.source, 'state_12.sqlite')
    assert.deepEqual(
      data.sessions.map((s) => s.threadId).sort(),
      [picked, unpicked].sort(),
    )
    assert.ok(!JSON.stringify(data).includes('仅用于验证的消息正文'))
    const post = async (base, payload) =>
      fetch(base + 'export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    const request = {
      machine: '库存电脑',
      links: [{ appId: 'STOCK-WATCH', threadId: picked }],
    }
    const result = await post(base, request)
    assert.equal(result.status, 200)
    const pack = await result.json()
    assert.deepEqual(pack, {
      format: 'stackpilot-chat-links',
      version: 1,
      machine: '库存电脑',
      links: [
        {
          appId: 'STOCK-WATCH',
          threadId: picked,
          title: '库存功能开发',
          cwd: '/project',
        },
      ],
    })
    assert.equal(
      (
        await post(base, {
          ...request,
          links: [{ appId: 'ORDER-SYNC', threadId: picked }],
        })
      ).status,
      400,
    )
    assert.equal(
      (
        await post(base, {
          ...request,
          links: [{ appId: 'STOCK-WATCH', threadId: localId }],
        })
      ).status,
      400,
    )

    const imported = await fetch(service.base + '/api/chat-links/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pack),
    })
    assert.equal(imported.status, 200)
    const remoteLinks = (
      await (await fetch(service.base + '/api/workspace')).json()
    ).chatLinks
    assert.deepEqual(
      remoteLinks.map((l) => [
        l.location,
        l.machine,
        l.appId,
        l.threadId,
        l.title,
        l.cwd,
      ]),
      [
        [
          'remote',
          '库存电脑',
          'STOCK-WATCH',
          picked,
          '库存功能开发',
          '/project',
        ],
      ],
    )

    const secondId = randomUUID()
    await writeFile(
      path.join(indexOnly, 'session_index.jsonl'),
      [
        '{invalid',
        JSON.stringify({ id: secondId, thread_name: '旧名' }),
        JSON.stringify({
          id: secondId,
          thread_name: '重命名',
          updated_at: '2026-01-01',
        }),
      ].join('\n'),
    )
    const all = await downloaded('', indexOnly, 'all')
    const alternate = await (await fetch(all + 'data')).json()
    assert.equal(alternate.source, 'session_index.jsonl')
    assert.equal(
      alternate.projects.length,
      (await (await fetch(service.base + '/api/workspace')).json()).apps.length,
    )
    assert.deepEqual(alternate.sessions, [
      { threadId: secondId, title: '重命名', cwd: '' },
    ])
    const multi = await post(all, {
      machine: '第二台',
      links: [
        { appId: 'ORDER-SYNC', threadId: secondId },
        { appId: 'STOCK-WATCH', threadId: secondId },
      ],
    })
    assert.equal((await multi.json()).links.length, 2)
  },
)

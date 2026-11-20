import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openStore } from '../server/store.mjs'
import { setProject, syncGithub } from '../server/projects.mjs'

const toolbox = 'ZSZ-TOOLS',
  moduleId = 'ZSZ-SYCM'
const repo = 'https://github.com/xyq20/ZSZ-Tools'
const app = {
  name: '库存核对',
  kind: 'tool',
  description: '',
  owner: '',
  folder: '',
  url: '',
  timeout: 15,
  mode: 'desktop',
  usage: '',
}

test('参考档案来自正式版本导航；旧项目无损迁移；来源和真实状态独立', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'stackpilot-project-'))
  const file = path.join(dir, 'workspace.sqlite')
  let store = openStore(file, false)
  t.after(() => {
    store.db.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const real = store.register(app)
  store.heartbeat(real.id, 'healthy', '')
  const before = store.snapshot().apps[0]
  // The previous catalog already had programs and releases, without project metadata.
  store.db.exec('DROP TABLE projects; ALTER TABLE releases DROP COLUMN github')
  store.db.close()
  store = openStore(file, true)
  const w = store.snapshot()
  const moved = w.apps.find((a) => a.id === real.id)
  assert.equal(moved.lastSeen, before.lastSeen)
  assert.equal(moved.project.source, 'manual')
  assert.ok(store.authenticate(real.id, real.token))
  const reference = w.apps.filter((a) => a.project.source === 'reference')
  assert.equal(reference.length, 8)
  assert.ok(
    reference.every((a) => !a.demo && !a.lastSeen && a.health === 'pending'),
  )
  assert.ok(reference.every((a) => a.folder === '' && a.project.machine === ''))
  assert.deepEqual(
    reference
      .filter((a) => a.project.parentId === toolbox)
      .map((a) => a.name)
      .sort(),
    [
      '销售月报',
      '批量导入价格',
      '自动库存填写',
      '分级总表',
      '淘宝素材上传',
      '淘宝商品提醒',
      '生意参谋数据抓取',
    ].sort(),
  )
  assert.equal(reference.find((a) => a.id === moduleId).owner, '董卓')
  assert.equal(w.apps.find((a) => a.id === 'IMAGE-PIPE').project.form, 'remote')
  assert.equal(w.apps.find((a) => a.id === 'IMAGE-PIPE').project.source, 'demo')
  assert.deepEqual(
    w.releases
      .filter((r) => r.github)
      .map((r) => [r.version, r.appId, r.url, r.time]),
    [
      [
        'v0.4.24',
        toolbox,
        repo + '/releases/tag/v0.4.24',
        Date.parse('2026-11-19T06:48:59Z'),
      ],
    ],
  )
  store.db.close()
  store = openStore(file, true)
  assert.equal(store.snapshot().apps.length, w.apps.length)
})

test('新登记与项目归属原子保存，子模块继承入口且工具箱不能成环', (t) => {
  const s = openStore(':memory:', true)
  t.after(() => s.db.close())
  const count = s.snapshot().apps.length
  assert.throws(
    () =>
      s.register({ ...app, project: { form: 'module', parentId: 'missing' } }),
    { status: 400 },
  )
  assert.equal(s.snapshot().apps.length, count)
  const { id } = s.register({
    ...app,
    project: { form: 'module', parentId: toolbox, source: 'reference' },
  })
  const project = () => s.snapshot().apps.find((a) => a.id === id).project
  assert.equal(project().source, 'manual')
  assert.equal(project().repo, repo)
  assert.equal(project().releaseUrl, repo + '/releases')
  assert.throws(
    () => setProject(s.db, toolbox, { form: 'module', parentId: toolbox }),
    { status: 400 },
  )
  assert.throws(() => setProject(s.db, toolbox, { form: 'other' }), {
    status: 409,
  })
  assert.throws(
    () =>
      setProject(s.db, id, { form: 'remote', remoteUrl: 'file:///tmp/file' }),
    { status: 400 },
  )
  assert.throws(
    () =>
      setProject(s.db, id, {
        form: 'remote',
        remoteUrl: 'https://user:pw@example.com/',
      }),
    { status: 400 },
  )
  setProject(s.db, id, {
    form: 'remote',
    remoteUrl: 'rustdesk://123456789',
    machine: '测试机',
    source: 'demo',
  })
  assert.equal(project().source, 'manual')
  assert.equal(project().machine, '测试机')
  assert.equal(project().repo, '')
})

test('GitHub 刷新定位父级、校验正式版本、幂等且失败时保留缓存', async (t) => {
  const s = openStore(':memory:', true)
  t.after(() => s.db.close())
  let draft = false
  const ok = async (url) => {
    assert.equal(
      url,
      'https://api.github.com/repos/xyq20/ZSZ-Tools/releases/latest',
    )
    return Response.json({
      tag_name: 'v-test',
      name: '测试',
      body: '一条模拟正式发布响应',
      draft,
      prerelease: false,
      published_at: '2026-12-01T10:00:00Z',
    })
  }
  assert.equal((await syncGithub(s.db, moduleId, ok)).appId, toolbox)
  assert.equal((await syncGithub(s.db, toolbox, ok)).updated, false)
  const releases = s.snapshot().releases
  assert.equal(
    releases.filter((r) => r.github && r.version === 'v-test').length,
    1,
  )
  draft = true
  await assert.rejects(syncGithub(s.db, moduleId, ok), { status: 502 })
  await assert.rejects(
    syncGithub(s.db, moduleId, async () => new Response(null, { status: 404 })),
    { status: 404 },
  )
  await assert.rejects(
    syncGithub(s.db, moduleId, async () => new Response(null, { status: 429 })),
    { status: 429 },
  )
  await assert.rejects(
    syncGithub(s.db, moduleId, async () => {
      throw Error('offline')
    }),
    { status: 502 },
  )
  assert.deepEqual(s.snapshot().releases, releases)
  await assert.rejects(
    syncGithub(s.db, 'IMAGE-PIPE', () => assert.fail('不应联网')),
    { status: 400 },
  )
})

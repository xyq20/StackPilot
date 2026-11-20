import { randomUUID } from 'node:crypto'

const fail = (status, message) => Object.assign(new Error(message), { status })
const referenceRepo = 'https://github.com/xyq20/ZSZ-Tools'
const toolboxId = 'ZSZ-TOOLS'
// Names and users from the navigation at tag v0.4.24 (app/index.html).
const modules = [
  [
    'REPORT',
    '销售月报',
    '丹姐',
    'chart',
    '按月份汇总快麦店铺销售和退款，核对后导出 Excel。',
  ],
  [
    'PRICE',
    '批量导入价格',
    '三公',
    'tag',
    '从表格中找出空白价格，按货号核对后备份并回填。',
  ],
  [
    'STOCK',
    '自动库存填写',
    '三公',
    'boxes',
    '根据二店商品和 SKU 编码回填库存，支持中断后继续。',
  ],
  [
    'MONTHLY',
    '分级总表',
    '双姐',
    'sheet',
    '按月度节点预览实发数量与退货率，校验后备份更新。',
  ],
  [
    'TAOBAO',
    '淘宝素材上传',
    '谭',
    'image',
    '选择视频目录，核对商品和素材内容后确认发布。',
  ],
  [
    'REMINDER',
    '淘宝商品提醒',
    '谭',
    'tickets',
    '按配置时间巡检商品创建日期，并发送 7 天或 15 天节点提醒。',
  ],
  [
    'SYCM',
    '生意参谋数据抓取',
    '董卓',
    'scan',
    '选择分级总表，刷新流量、主图和曲线数据，在输出副本中核对。',
  ],
]
export function installProjects(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    appId TEXT PRIMARY KEY REFERENCES apps(id), form TEXT NOT NULL DEFAULT 'other',
    parentId TEXT REFERENCES apps(id), repo TEXT NOT NULL DEFAULT '', releaseUrl TEXT NOT NULL DEFAULT '',
    machine TEXT NOT NULL DEFAULT '', remoteUrl TEXT NOT NULL DEFAULT '', remoteNote TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual'
  )`)
  if (
    !db
      .prepare('PRAGMA table_info(releases)')
      .all()
      .some((col) => col.name === 'github')
  ) {
    db.exec('ALTER TABLE releases ADD COLUMN github INTEGER NOT NULL DEFAULT 0')
  }
  db.exec(`INSERT INTO projects(appId,source)
    SELECT id,CASE WHEN demo=1 THEN 'demo' ELSE 'manual' END FROM apps WHERE id NOT IN (SELECT appId FROM projects)`)
}

export function seedProjects(db, includeReference) {
  if (
    !includeReference ||
    db.prepare("SELECT 1 FROM meta WHERE key='project-reference-1'").get()
  )
    return
  const recorded = Date.now()
  const insert =
    db.prepare(`INSERT INTO apps(id,name,kind,description,owner,folder,url,icon,demo,tokenHash,created,lastSeen,reported,timeout,lifecycle,usage,mode)
    VALUES(?,?,'tool',?,?,'','',?,0,'',?,NULL,'healthy',15,'active',?,'desktop')`)
  const project = db.prepare(
    'INSERT INTO projects(appId,form,parentId,repo,releaseUrl,source) VALUES(?,?,?,?,?,?)',
  )
  insert.run(
    toolboxId,
    '钊叔工具箱',
    'Windows 与 macOS 共用的团队桌面工具箱。',
    '',
    'boxes',
    recorded,
    '按使用人选择模块，从 GitHub Releases 获取当前系统对应的桌面安装包。',
  )
  project.run(
    toolboxId,
    'toolbox',
    null,
    referenceRepo,
    referenceRepo + '/releases',
    'reference',
  )
  for (const [key, name, owner, icon, usage] of modules) {
    const id = 'ZSZ-' + key
    insert.run(id, name, usage, owner, icon, recorded, usage)
    project.run(id, 'module', toolboxId, '', '', 'reference')
  }
  db.prepare(
    `INSERT INTO releases(id,appId,version,notes,url,time,github) VALUES(?,?,?,?,?,?,1)`,
  ).run(
    randomUUID(),
    toolboxId,
    'v0.4.24',
    '三公新增自动库存填写，支持续跑与库存回读；提供 Mac Apple Silicon 和 Windows x64 安装包。',
    referenceRepo + '/releases/tag/v0.4.24',
    Date.parse('2026-11-19T06:48:59Z'),
  )
  db.prepare(
    `UPDATE projects SET form='remote',machine='示例 · 设计电脑',remoteNote='本示例由设计组通过远控客户端维护。接入实际电脑后登记连接入口。'
    WHERE appId='IMAGE-PIPE' AND source='demo'`,
  ).run()
  db.prepare("INSERT INTO meta VALUES('project-reference-1',?)").run(
    String(recorded),
  )
}

function readText(data, key, max = 2048) {
  const value = data[key] ?? ''
  if (typeof value !== 'string' || value.length > max)
    throw fail(400, '字段格式有误：' + key)
  return value.trim()
}
function link(value, remote = false) {
  if (!value) return ''
  if (remote && /^rustdesk:\/\/(?:connection\/new\/)?\d+\/?$/i.test(value))
    return value
  if (remote && /^anydesk:(?:\/\/)?\d+$/i.test(value))
    return value.replace(/^anydesk:(?:\/\/)?/i, 'anydesk:')
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw fail(400, '请输入完整的网址或支持的远控链接')
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password)
    throw fail(400, '链接协议无效或含有登录凭据')
  if (
    remote &&
    [...parsed.searchParams.keys()].some((key) =>
      /^(password|passwd|pwd|token|secret)$/i.test(key),
    )
  )
    throw fail(400, '远控链接不能包含口令或令牌')
  return value
}
export function validateRemoteUrl(value) {
  return link(value, true)
}

function repository(value) {
  if (!value) return ''
  const short = /^[\w.-]+\/[\w.-]+$/.test(value)
    ? 'https://github.com/' + value
    : value
  const url = new URL(link(short))
  if (url.hostname !== 'github.com') return short
  if (
    url.port ||
    url.search ||
    url.hash ||
    !/^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname)
  )
    throw fail(400, '请填写 GitHub 仓库首页地址')
  return (
    'https://github.com' + url.pathname.replace(/\/$/, '').replace(/\.git$/, '')
  )
}
export function setProject(db, id, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw fail(400, '项目资料格式无效')
  const original = db.prepare('SELECT * FROM projects WHERE appId=?').get(id)
  if (!original) throw fail(404, '项目不存在')
  const form = readText(data, 'form', 20)
  if (!['toolbox', 'module', 'remote', 'other'].includes(form))
    throw fail(400, '项目形态无效')
  const parentId = readText(data, 'parentId', 128)
  if (form === 'module') {
    const parent = db
      .prepare('SELECT form FROM projects WHERE appId=?')
      .get(parentId)
    if (parentId === id || parent?.form !== 'toolbox')
      throw fail(400, '子项目须选择一个不同的工具箱')
  } else if (parentId) throw fail(400, '只有子项目能归属工具箱')
  if (
    form !== 'toolbox' &&
    db.prepare('SELECT 1 FROM projects WHERE parentId=?').get(id)
  )
    throw fail(409, '请先迁移此工具箱的子项目')
  const repo = form === 'module' ? '' : repository(readText(data, 'repo'))
  const releaseUrl = form === 'module' ? '' : link(readText(data, 'releaseUrl'))
  const machine = readText(data, 'machine', 160),
    remoteUrl = link(readText(data, 'remoteUrl'), true),
    remoteNote = readText(data, 'remoteNote', 2000)
  db.prepare(
    'UPDATE projects SET form=?,parentId=?,repo=?,releaseUrl=?,machine=?,remoteUrl=?,remoteNote=? WHERE appId=?',
  ).run(
    form,
    parentId || null,
    repo,
    releaseUrl,
    machine,
    remoteUrl,
    remoteNote,
    id,
  )
}
export function attachProjects(db, apps) {
  const projects = new Map(
    db
      .prepare('SELECT * FROM projects')
      .all()
      .map(({ appId, ...p }) => [appId, p]),
  )
  for (const app of apps) {
    const p = projects.get(app.id)
    const host = projects.get(p.parentId)
    app.project = {
      ...p,
      parentId: p.parentId || '',
      repo: host?.repo ?? p.repo,
      releaseUrl: host?.releaseUrl ?? p.releaseUrl,
    }
  }
}
function releaseOwner(db, id) {
  return db
    .prepare(
      `SELECT host.* FROM projects p JOIN projects host ON host.appId=COALESCE(p.parentId,p.appId) WHERE p.appId=?`,
    )
    .get(id)
}
export async function syncGithub(db, id, fetchRelease = fetch) {
  const project = releaseOwner(db, id)
  if (!project) throw fail(404, '项目不存在')
  const match = project.repo.match(
    /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)$/,
  )
  if (!match) throw fail(400, '请先登记公开的 GitHub 仓库地址')
  let release
  try {
    const response = await fetchRelease(
      'https://api.github.com/repos/' +
        match[1] +
        '/' +
        match[2] +
        '/releases/latest',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'StackPilot-local',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      },
    )
    if (response.status === 404)
      throw fail(404, '未找到公开仓库或正式发布，已保留本地记录')
    if (response.status === 403 || response.status === 429)
      throw fail(429, 'GitHub 暂时限制访问，请稍后重试')
    if (!response.ok) throw Error()
    release = await response.json()
    if (
      release.draft !== false ||
      release.prerelease !== false ||
      typeof release.tag_name !== 'string' ||
      !release.tag_name.trim() ||
      release.tag_name.length > 255 ||
      !Number.isFinite(Date.parse(release.published_at))
    )
      throw Error()
  } catch (error) {
    if (error.status) throw error
    throw fail(502, '无法获取 GitHub 正式发布，已保留本地记录')
  }
  const current = releaseOwner(db, id)
  if (current?.repo !== project.repo || current.appId !== project.appId)
    throw fail(409, '项目发布来源已变更，请重新同步')
  const version = release.tag_name,
    url = project.repo + '/releases/tag/' + encodeURIComponent(version),
    time = Date.parse(release.published_at)
  const notes = (release.body?.trim() || release.name || version).slice(
    0,
    12000,
  )
  const cached = db
    .prepare('SELECT * FROM releases WHERE appId=? AND version=?')
    .get(project.appId, version)
  if (cached && !cached.github)
    throw fail(409, '该版本已有手工发布记录，已保留原数据')
  if (!cached) {
    db.prepare(
      'INSERT INTO releases(id,appId,version,notes,url,time,github) VALUES(?,?,?,?,?,?,1)',
    ).run(randomUUID(), project.appId, version, notes, url, time)
  } else if (
    cached.notes !== notes ||
    cached.url !== url ||
    cached.time !== time
  ) {
    db.prepare('UPDATE releases SET notes=?,url=?,time=? WHERE id=?').run(
      notes,
      url,
      time,
      cached.id,
    )
  }
  return {
    ok: true,
    updated:
      !cached ||
      cached.notes !== notes ||
      cached.url !== url ||
      cached.time !== time,
    version,
    appId: project.appId,
  }
}

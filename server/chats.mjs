import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { validateRemoteUrl } from './projects.mjs'

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const threadInput = new RegExp('^(?:codex://threads/)?(' + uuid + ')/?$', 'i')
export function parseThreadId(input) {
  if (typeof input !== 'string' || input.length > 160) return null
  return input.trim().match(threadInput)?.[1].toLowerCase() ?? null
}
const installed = new WeakSet()
const createLinks = `CREATE TABLE chat_links (
  id TEXT PRIMARY KEY, appId TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  threadId TEXT NOT NULL, title TEXT NOT NULL, cwd TEXT NOT NULL,
  location TEXT NOT NULL CHECK(location IN ('local','remote')),
  machine TEXT NOT NULL COLLATE NOCASE,
  CHECK((location='local' AND machine='') OR (location='remote' AND machine<>'')),
  UNIQUE(appId,location,machine,threadId)
)`
const linkRows = `SELECT l.id,l.appId,l.threadId,l.title,l.cwd,l.location,l.machine,
                       coalesce(s.url,'') AS stationUrl FROM chat_links l
                   LEFT JOIN chat_stations s ON l.location='remote' AND s.machine=l.machine`
function transact(store, fn) {
  store.db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    store.db.exec('COMMIT')
    return result
  } catch (error) {
    store.db.exec('ROLLBACK')
    throw error
  }
}
function install(store) {
  if (installed.has(store.db)) return
  transact(store, () => {
    const columns = store.all('PRAGMA table_info(chat_links)')
    if (!columns.length) store.db.exec(createLinks)
    else if (!columns.some((c) => c.name === 'location')) {
      store.db.exec('ALTER TABLE chat_links RENAME TO chat_links_local_v1')
      store.db.exec(createLinks)
      store.db
        .exec(`INSERT INTO chat_links(id,appId,threadId,title,cwd,location,machine)
        SELECT id,appId,threadId,title,cwd,'local','' FROM chat_links_local_v1 ORDER BY rowid`)
      store.db.exec('DROP TABLE chat_links_local_v1')
    }
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS chat_stations(machine TEXT PRIMARY KEY COLLATE NOCASE, url TEXT NOT NULL)',
    )
  })
  installed.add(store.db)
}
export function withChatLinks(store, snapshot) {
  install(store)
  return {
    ...snapshot,
    chatLinks: store.all(linkRows + ' ORDER BY l.rowid DESC'),
  }
}

function textField(value, name, max, required, fail) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    value.includes('\0') ||
    (required && !value.trim())
  )
    throw fail(400, name + '格式无效')
  return value.trim().normalize('NFC')
}
function checkedProject(store, value, fail) {
  const id = textField(value, '项目编号', 128, true, fail)
  if (!store.one('SELECT 1 FROM apps WHERE id=?', id))
    throw fail(400, '导入清单或关联目标包含未登记的项目：' + id)
  return id
}
function stationUrl(input, fail) {
  return validateRemoteUrl(textField(input, '远控入口', 2048, false, fail))
}
function writeStation(store, machine, url) {
  store.exec(
    'INSERT INTO chat_stations(machine,url) VALUES(?,?) ON CONFLICT(machine) DO UPDATE SET url=excluded.url',
    machine,
    url,
  )
}
function putLink(store, link) {
  const { appId, threadId, title, cwd, location, machine } = link
  const key = [appId, location, machine, threadId]
  const existing = store.one(
    'SELECT id,title,cwd FROM chat_links WHERE appId=? AND location=? AND machine=? AND threadId=?',
    ...key,
  )
  if (existing) {
    if (existing.title === title && existing.cwd === cwd)
      return { id: existing.id, status: 'unchanged' }
    store.exec(
      'UPDATE chat_links SET title=?,cwd=? WHERE id=?',
      title,
      cwd,
      existing.id,
    )
    return { id: existing.id, status: 'updated' }
  }
  const id = randomUUID()
  store.exec(
    'INSERT INTO chat_links(id,appId,location,machine,threadId,title,cwd) VALUES(?,?,?,?,?,?,?)',
    id,
    ...key,
    title,
    cwd,
  )
  return { id, status: 'added' }
}

function codexHome() {
  return (
    process.env.STACKPILOT_CODEX_HOME ||
    process.env.CODEX_HOME ||
    path.join(homedir(), '.codex')
  )
}

// The desktop index can change between Codex versions. Query only the columns
// needed for discovery and open the existing database with a read-only handle.
export function localChats({
  home = codexHome(),
  q = '',
  limit = 25,
  offset = 0,
  threadId,
  hints = [],
} = {}) {
  const unavailable = { available: false, threads: [], total: 0 }
  let db
  try {
    const names = readdirSync(home)
      .map((name) => /^state_(\d+)\.sqlite$/.exec(name))
      .filter(Boolean)
    const filename = names.sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0]
    if (!filename) return unavailable
    db = new DatabaseSync(path.join(home, filename), { readOnly: true })
    const columns = new Set(
      db
        .prepare('PRAGMA table_info(threads)')
        .all()
        .map((c) => c.name),
    )
    if (!['id', 'title', 'cwd', 'source'].every((name) => columns.has(name)))
      return unavailable
    const title = columns.has('name')
      ? "coalesce(nullif(trim(name),''),title,'')"
      : "coalesce(title,'')"
    const ex = '(substr(' + title + ',1,160))'
    const filters = [
      "lower(source) NOT LIKE '%subagent%'",
      "lower(source) NOT LIKE '%sub_agent%'",
    ]
    if (columns.has('agent_path'))
      filters.push("coalesce(agent_path,'') IN ('','/root')")
    if (columns.has('agent_role')) filters.push("coalesce(agent_role,'')=''")
    if (columns.has('attached_thread_parent_id'))
      filters.push('attached_thread_parent_id IS NULL')
    if (columns.has('archived') && !threadId)
      filters.push('coalesce(archived,0)=0')
    const params = []
    if (threadId) {
      filters.push('id=?')
      params.push(threadId)
    }
    if (q) {
      filters.push(
        'instr(lower(' + ex + " || ' ' || cwd || ' ' || id),lower(?))>0",
      )
      params.push(q)
    }
    if (hints.length) {
      filters.push(
        '(' +
          hints
            .map(() => 'instr(lower(' + ex + " || ' ' || cwd),lower(?))>0")
            .join(' OR ') +
          ')',
      )
      params.push(...hints)
    }
    const where = filters.join(' AND ')
    const recency = ['updated_at_ms', 'updated_at', 'created_at']
      .filter((k) => columns.has(k))
      .map((k) => k + ' DESC')
    const total = Number(
      db
        .prepare('SELECT count(*) AS n FROM threads WHERE ' + where)
        .get(...params).n,
    )
    const rows = db
      .prepare(
        'SELECT id AS threadId,' +
          ex +
          ' AS title,substr(cwd,1,2048) AS cwd FROM threads WHERE ' +
          where +
          ' ORDER BY ' +
          [...recency, 'id DESC'].join(',') +
          ' LIMIT ? OFFSET ?',
      )
      .all(...params, limit, offset)
    return {
      available: true,
      total,
      threads: rows
        .filter((r) => parseThreadId(r.threadId))
        .map((r) => ({
          ...r,
          title:
            r.title
              .split(/\r?\n/)
              .find((s) => s.trim())
              ?.trim() || '未命名对话',
        })),
    }
  } catch {
    return unavailable
  } finally {
    db?.close()
  }
}

export async function handleChatRequest({
  req,
  route,
  store,
  json,
  body,
  fail,
}) {
  if (
    route !== '/api/chats' &&
    route !== '/api/chat-links' &&
    route !== '/api/chat-stations' &&
    !route.startsWith('/api/chat-links/')
  )
    return false
  install(store)
  if (route === '/api/chats') {
    if (req.method !== 'GET') throw fail(405, '请使用 GET 查询会话')
    const params = new URL(req.url, 'http://localhost').searchParams
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(params.get('limit'), 10) || 25),
    )
    const offset = Math.min(
      1000000,
      Math.max(0, Number.parseInt(params.get('offset'), 10) || 0),
    )
    const hints = params
      .getAll('hint')
      .map((v) => v.trim().slice(0, 160))
      .filter((v) => v.length >= 2)
      .slice(0, 4)
    json(
      200,
      localChats({
        q: (params.get('q') || '').trim().slice(0, 160),
        limit,
        offset,
        hints,
      }),
    )
    return true
  }
  if (req.method !== 'POST') throw fail(405, '请使用 POST 更新关联')
  const data =
    route === '/api/chat-links/import'
      ? await body(req, 2 * 1024 * 1024)
      : await body(req)
  if (route === '/api/chat-stations') {
    const machine = textField(data.machine, '设备名', 120, true, fail)
    const url = stationUrl(data.url, fail)
    writeStation(store, machine, url)
    json(200, { machine, url })
    return true
  }
  if (route === '/api/chat-links/import') {
    if (
      data.format !== 'stackpilot-chat-links' ||
      data.version !== 1 ||
      !Array.isArray(data.links) ||
      data.links.length < 1 ||
      data.links.length > 200
    )
      throw fail(400, '需要版本 1 的会话清单，每次可导入 1 至 200 条')
    const machine = textField(data.machine, '来源电脑', 120, true, fail)
    const remoteUrl = stationUrl(data.stationUrl ?? '', fail)
    const links = data.links.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw fail(400, '对话记录格式无效')
      const appId = checkedProject(store, item.appId, fail)
      const threadId = parseThreadId(item.threadId)
      if (!threadId) throw fail(400, '清单中包含无效的会话编号')
      return {
        appId,
        threadId,
        title: textField(item.title, '对话标题', 160, true, fail),
        cwd: textField(item.cwd, '工作目录', 2048, false, fail),
        location: 'remote',
        machine,
      }
    })
    const counts = transact(store, () => {
      const result = { added: 0, updated: 0, unchanged: 0, total: links.length }
      for (const link of links) result[putLink(store, link).status]++
      if (remoteUrl) writeStation(store, machine, remoteUrl)
      return result
    })
    json(200, counts)
    return true
  }
  if (route === '/api/chat-links') {
    const appId = checkedProject(store, data.appId, fail)
    const threadId = parseThreadId(data.threadId)
    if (!threadId) throw fail(400, '请提供 Codex 对话链接或有效的 UUID')
    const location = data.location ?? 'local'
    if (!['local', 'remote'].includes(location)) throw fail(400, '会话来源无效')
    const remote = location === 'remote'
    const machine = remote
      ? textField(data.machine, '来源电脑', 120, true, fail)
      : ''
    const remoteUrl = remote ? stationUrl(data.stationUrl ?? '', fail) : ''
    const local = remote ? null : localChats({ threadId, limit: 1 }).threads[0]
    const title =
      local?.title ||
      textField(data.title ?? '', '对话标题', 160, false, fail) ||
      'Codex 对话 ' + threadId.slice(0, 8)
    const cwd =
      local?.cwd || textField(data.cwd ?? '', '工作目录', 2048, false, fail)
    const result = transact(store, () => {
      if (remoteUrl) writeStation(store, machine, remoteUrl)
      return putLink(store, { appId, threadId, title, cwd, location, machine })
    })
    json(200, store.one(linkRows + ' WHERE l.id=?', result.id))
    return true
  }
  const match = route.match(/^\/api\/chat-links\/([a-f\d-]+)\/unlink$/i)
  if (!match) throw fail(404, '找不到该接口')
  store.exec('DELETE FROM chat_links WHERE id=?', match[1])
  json(200, { ok: true })
  return true
}

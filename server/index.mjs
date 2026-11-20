import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'
import { openStore } from './store.mjs'
import {
  officeEventFeed,
  updateSeat,
  importNames,
  startLife,
  swapSeats,
} from './office.mjs'
import { downloadChatHelper } from './portable.mjs'
import { setProject, syncGithub } from './projects.mjs'
import { handleChatRequest, withChatLinks } from './chats.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const dev = process.argv.includes('--dev')
const port = Number(process.env.PORT || 5173)
const gzipJson = promisify(gzip)
const directory = process.env.STACKPILOT_DATA || path.join(root, 'data')
await mkdir(directory, { recursive: true })
const officeEvents = officeEventFeed()
const store = openStore(
  path.join(directory, 'workspace.sqlite'),
  process.env.STACKPILOT_DEMO !== '0',
  officeEvents.changed,
)
const vite = dev
  ? await (
      await import('vite')
    ).createServer({
      root,
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    })
  : null
const fail = (status, message) => Object.assign(new Error(message), { status })
function field(data, key, max = 200, required = false) {
  const value = data[key] ?? ''
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim())
  )
    throw fail(400, '字段格式有误：' + key)
  return value.trim()
}
function choice(data, key, values) {
  if (!values.includes(data[key])) throw fail(400, '字段取值无效：' + key)
  return data[key]
}
function number(data, key, min, max) {
  if (!Number.isSafeInteger(data[key]) || data[key] < min || data[key] > max)
    throw fail(400, '数值超出范围：' + key)
  return data[key]
}
const catalogModes = ['desktop', 'web', 'scheduled']
function resourceUrl(data, allowDemo = false) {
  const url = field(data, 'url', 2048)
  if (!url) return ''
  if (allowDemo && url.startsWith('/demo/')) {
    const segments = url.slice('/demo/'.length).split('/')
    if (
      segments.every((segment) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment))
    )
      return url
    throw fail(400, '示例附件路径无效')
  }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw fail(400, '请输入完整的网址')
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw fail(400, '网址须使用 HTTP 或 HTTPS')
  }
  return url
}
function appFields(data) {
  const url = resourceUrl(data)
  return {
    name: field(data, 'name', 60, true),
    description: field(data, 'description', 500),
    owner: field(data, 'owner', 60),
    folder: field(data, 'folder', 1024),
    url,
    kind: choice(data, 'kind', ['commerce', 'tool']),
    timeout: number(data, 'timeout', 1, 1440),
  }
}
async function body(req, maxBytes = 32768) {
  if (
    req.headers['content-type']?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  )
    throw fail(415, '请求需要使用 JSON')
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > maxBytes) throw fail(413, '请求内容过大')
    chunks.push(chunk)
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error()
    return data
  } catch {
    throw fail(400, 'JSON 格式错误')
  }
}
const server = http.createServer(async (req, res) => {
  const json = (status, value) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(value))
    if (req.method === 'POST' && status >= 200 && status < 300)
      officeEvents.changed()
  }
  try {
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(
        new URL('http://' + req.headers.host).hostname,
      )
    )
      throw fail(403, '请使用本机地址访问')
    if (
      req.headers.origin &&
      req.headers.origin !== 'http://' + req.headers.host
    )
      throw fail(403, '不允许跨站请求')
    const url = new URL(req.url, 'http://localhost')
    const route = url.pathname
    if (route.startsWith('/api/')) {
      if (route === '/api/office/events') {
        if (req.method !== 'GET') throw fail(405, '请使用 GET 订阅工作台更新')
        return officeEvents.subscribe(res)
      }
      if (route === '/api/chat-station/helper.py') {
        if (req.method !== 'GET') throw fail(405, '请使用 GET 下载会话助手')
        return await downloadChatHelper(
          store,
          url.searchParams.get('app'),
          res,
          fail,
        )
      }
      if (route === '/api/workspace' && req.method === 'GET') {
        const snapshot = withChatLinks(store, store.snapshot())
        const acceptsGzip = (req.headers['accept-encoding'] || '')
          .split(',')
          .some((value) => {
            const [encoding, quality = 'q=1'] = value.trim().split(';')
            return (
              encoding === 'gzip' &&
              Number(quality.trim().replace(/^q=/, '')) > 0
            )
          })
        if (!acceptsGzip) return json(200, snapshot)
        const compressed = await gzipJson(JSON.stringify(snapshot), {
          level: 1,
        })
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Encoding': 'gzip',
          Vary: 'Accept-Encoding',
        })
        return res.end(compressed)
      }
      if (await handleChatRequest({ req, route, store, json, body, fail }))
        return
      if (req.method !== 'POST') throw fail(405, '不支持该请求方法')
      const data = await body(req)
      if (route === '/api/office/import-names')
        return json(200, importNames(store, data))
      const seatRoute = route.match(
        /^\/api\/office\/seats\/([^/]+)(?:\/(life|swap))?$/,
      )
      if (seatRoute) {
        const [, id, action] = seatRoute
        if (action === 'life') return json(200, startLife(store, id, data))
        if (action === 'swap') return json(200, swapSeats(store, id, data))
        return json(200, updateSeat(store, id, data))
      }
      if (route === '/api/apps') {
        const app = appFields(data)
        app.usage = field(data, 'usage', 4000)
        app.mode =
          data.mode === undefined
            ? app.kind === 'commerce'
              ? 'scheduled'
              : 'desktop'
            : choice(data, 'mode', catalogModes)
        app.project = data.project
        return json(201, store.register(app))
      }
      if (route === '/api/releases' || route === '/api/feedback') {
        const appId = field(data, 'appId', 128, true)
        if (!store.one('SELECT 1 FROM apps WHERE id=?', appId))
          throw fail(404, '程序不存在')
        const id = randomUUID()
        const time = Date.now()
        if (route === '/api/releases') {
          if (
            store.one('SELECT form FROM projects WHERE appId=?', appId)
              ?.form === 'module'
          ) {
            throw fail(409, '子项目沿用工具箱版本，请在所属工具箱登记发布')
          }
          const version = field(data, 'version', 64, true)
          const notes = field(data, 'notes', 4000, true)
          const url = resourceUrl(data, true)
          const result = store.exec(
            'INSERT INTO releases(id,appId,version,notes,url,time) VALUES(?,?,?,?,?,?) ON CONFLICT(appId,version) DO NOTHING',
            id,
            appId,
            version,
            notes,
            url,
            time,
          )
          if (!result.changes) throw fail(409, '该程序已登记此版本')
          return json(201, { id, appId, version, notes, url, time })
        }
        const version = field(data, 'version', 64)
        const title = field(data, 'title', 120, true)
        const detail = field(data, 'detail', 4000)
        const reporter = field(data, 'reporter', 60)
        const state = 'open'
        store.exec(
          'INSERT INTO feedback(id,appId,version,title,detail,reporter,state,time) VALUES(?,?,?,?,?,?,?,?)',
          id,
          appId,
          version,
          title,
          detail,
          reporter,
          state,
          time,
        )
        return json(201, {
          id,
          appId,
          version,
          title,
          detail,
          reporter,
          state,
          time,
        })
      }
      const match = route.match(
        /^\/api\/(apps|ingest|alerts|feedback)\/([\w-]+)(?:\/([\w-]+))?$/,
      )
      if (!match) throw fail(404, '接口不存在')
      const [, group, id, action] = match
      if (group === 'ingest') {
        const auth = req.headers.authorization || ''
        if (
          !auth.startsWith('Bearer ') ||
          !store.authenticate(id, auth.slice(7))
        )
          throw fail(401, '程序 ID 或接入密钥无效')
        if (action === 'heartbeat') {
          store.heartbeat(
            id,
            choice(data, 'status', ['healthy', 'warning']),
            field(data, 'message', 2000),
          )
          return json(200, { ok: true })
        }
        if (action === 'runs')
          return json(
            200,
            store.record(id, {
              title: field(data, 'title', 120, true),
              eventId: field(data, 'eventId', 128, true),
              status: choice(data, 'status', ['success', 'failed']),
              duration: number(data, 'duration', 0, 31536000000),
              message: field(data, 'message', 2000),
            }),
          )
      }
      if (group === 'apps') {
        const app = store.one('SELECT demo FROM apps WHERE id=?', id)
        if (!app) throw fail(404, '程序不存在')
        if (action === 'project') {
          setProject(store.db, id, data)
          return json(200, { ok: true })
        }
        if (action === 'github-sync')
          return json(200, await syncGithub(store.db, id))
        if (action === 'catalog') {
          store.exec(
            'UPDATE apps SET lifecycle=?,mode=?,usage=? WHERE id=?',
            choice(data, 'lifecycle', ['active', 'archived']),
            choice(data, 'mode', catalogModes),
            field(data, 'usage', 4000),
            id,
          )
          return json(200, { ok: true })
        }
        if (action === 'rotate') {
          if (app.demo) throw fail(400, '示例程序使用内置配置')
          return json(200, store.rotate(id))
        }
        if (!action) {
          const app = appFields(data)
          store.exec(
            'UPDATE apps SET name=?,kind=?,description=?,owner=?,folder=?,url=?,timeout=?,icon=CASE WHEN demo=1 THEN icon ELSE ? END WHERE id=?',
            app.name,
            app.kind,
            app.description,
            app.owner,
            app.folder,
            app.url,
            app.timeout,
            app.kind === 'tool' ? 'code' : 'workflow',
            id,
          )
          return json(200, { ok: true })
        }
      }
      if (group === 'feedback' && !action) {
        const state = choice(data, 'state', ['open', 'ack', 'resolved'])
        const update = store.exec(
          'UPDATE feedback SET state=? WHERE id=?',
          state,
          id,
        )
        if (!update.changes) throw fail(404, '反馈不存在')
        return json(200, { ok: true })
      }
      if (group === 'alerts' && !action) {
        const a = store.one('SELECT state FROM alerts WHERE id=?', id)
        if (!a) throw fail(404, '告警不存在')
        const state = choice(data, 'state', ['ack', 'resolved'])
        if (a.state === 'resolved' && state !== 'resolved')
          throw fail(409, '该告警已处理')
        store.exec('UPDATE alerts SET state=? WHERE id=?', state, id)
        return json(200, { ok: true })
      }
      throw fail(404, '接口不存在')
    }
    if (vite) return vite.middlewares(req, res)
    const dist = path.join(root, 'dist')
    let file = path.resolve(dist, '.' + decodeURIComponent(route))
    if (file !== dist && !file.startsWith(dist + path.sep))
      throw fail(403, '无效路径')
    if (!(await stat(file).catch(() => null))?.isFile()) {
      if (path.extname(route)) throw fail(404, '文件不存在')
      file = path.join(dist, 'index.html')
    }
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.webp': 'image/webp',
    }
    const content = await readFile(file)
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    })
    res.end(content)
  } catch (e) {
    if (!e.status) console.error(e)
    json(e.status || 500, {
      error: e.status ? e.message : '工作台服务暂时不可用',
    })
  }
})
server.on('error', (e) => {
  console.error(e.message)
  process.exit(1)
})
server.listen(port, '127.0.0.1', () =>
  console.log(
    'StackPilot is running at http://127.0.0.1:' + server.address().port,
  ),
)
const timer = setInterval(() => store.pulse(), 60000)
timer.unref()

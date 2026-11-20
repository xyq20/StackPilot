import { DatabaseSync } from 'node:sqlite'
import { installCatalog, seedCatalog } from './catalog.mjs'
import { installOffice, officeSeats } from './office.mjs'
import {
  installProjects,
  seedProjects,
  attachProjects,
  setProject,
} from './projects.mjs'
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'

export const hash = (value) => createHash('sha256').update(value).digest('hex')
export const minute = 60000
const day = minute * 1440
export function health(app, now = Date.now()) {
  if (!app.lastSeen) return 'pending'
  if (now - app.lastSeen > app.timeout * minute) return 'offline'
  return app.reported === 'warning' ? 'warning' : 'healthy'
}

export function openStore(file, demo = true, onPulseChange = () => {}) {
  const db = new DatabaseSync(file)
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, description TEXT NOT NULL,
      owner TEXT NOT NULL, folder TEXT NOT NULL, url TEXT NOT NULL, icon TEXT NOT NULL, demo INTEGER NOT NULL,
      tokenHash TEXT NOT NULL, created INTEGER NOT NULL, lastSeen INTEGER, reported TEXT NOT NULL,
      timeout INTEGER NOT NULL DEFAULT 15);
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, appId TEXT NOT NULL REFERENCES apps(id), title TEXT NOT NULL, status TEXT NOT NULL,
      time INTEGER NOT NULL, duration INTEGER NOT NULL, message TEXT NOT NULL, eventId TEXT NOT NULL, UNIQUE(appId,eventId));
    CREATE INDEX IF NOT EXISTS run_time ON runs(time);
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY, appId TEXT NOT NULL REFERENCES apps(id), title TEXT NOT NULL, detail TEXT NOT NULL,
      level TEXT NOT NULL, state TEXT NOT NULL, time INTEGER NOT NULL, cause TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)
  const all = (sql, ...args) => db.prepare(sql).all(...args)
  const one = (sql, ...args) => db.prepare(sql).get(...args)
  const exec = (sql, ...args) => db.prepare(sql).run(...args)
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  transaction(() => installCatalog(db))
  const addAlert = (appId, title, detail, level, time, cause) =>
    exec(
      "INSERT INTO alerts VALUES(?,?,?,?,?,'open',?,?)",
      randomUUID(),
      appId,
      title,
      detail,
      level,
      time,
      cause,
    )
  const demoApps = [
    [
      '订单同步引擎',
      'ORDER-SYNC',
      'commerce',
      'shopping',
      '同步多店铺订单与履约状态',
      '运营组',
    ],
    [
      '库存巡检助手',
      'STOCK-WATCH',
      'commerce',
      'boxes',
      '定时核对仓库与店铺库存差异',
      '仓储组',
    ],
    [
      '商品采集服务',
      'PRODUCT-FETCH',
      'commerce',
      'scan',
      '采集商品信息与价格变动',
      '运营组',
    ],
    [
      '报表生成器',
      'REPORT-KIT',
      'tool',
      'chart',
      '生成团队日报并归档汇总结果',
      '数据组',
    ],
    [
      '批量图片处理',
      'IMAGE-PIPE',
      'tool',
      'image',
      '批量裁切、压缩与导出商品图',
      '设计组',
    ],
    [
      '售后工单同步',
      'AFTERSALE-SYNC',
      'commerce',
      'tickets',
      '归集店铺售后申请与处理进度',
      '客服组',
    ],
    [
      '物流轨迹追踪',
      'TRACK-FLOW',
      'commerce',
      'truck',
      '跟踪物流节点与签收情况',
      '仓储组',
    ],
    [
      '表格清洗工具',
      'SHEET-CLEAN',
      'tool',
      'sheet',
      '规范表格字段并检查重复数据',
      '数据组',
    ],
    [
      '促销价格巡检',
      'PRICE-GUARD',
      'commerce',
      'tag',
      '巡检活动价格与优惠规则',
      '运营组',
    ],
    [
      '素材归档助手',
      'ASSET-SORT',
      'tool',
      'folder',
      '按商品与日期整理素材',
      '设计组',
    ],
    [
      '对账任务中心',
      'BILL-CHECK',
      'commerce',
      'wallet',
      '核对店铺账单与回款明细',
      '财务组',
    ],
    [
      '文档转换工具',
      'DOC-CONVERT',
      'tool',
      'file',
      '统一转换团队文档格式',
      '行政组',
    ],
  ]
  if (demo && !one("SELECT 1 FROM meta WHERE key='seed'"))
    transaction(() => {
      const now = Date.now()
      let rand = 182
      const random = () => {
        rand = (1664525 * rand + 1013904223) >>> 0
        return rand / 4294967296
      }
      demoApps.forEach(([name, id, kind, icon, desc, owner], i) =>
        exec(
          'INSERT INTO apps(id,name,kind,description,owner,folder,url,icon,demo,tokenHash,created,lastSeen,reported,timeout,mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          id,
          name,
          kind,
          desc,
          owner,
          '',
          '',
          icon,
          1,
          '',
          now - (40 - i) * day,
          now - (i === 4 ? 42 : 1 + (i % 3)) * minute,
          i === 2 ? 'warning' : 'healthy',
          15,
          kind === 'commerce' ? 'scheduled' : 'desktop',
        ),
      )
      const today = new Date(now)
      today.setHours(0, 0, 0, 0)
      const waves = [0.9, 0.81, 1.0, 0.89, 1.29, 1.12, 1.38]
      for (let d = 0; d < 15; d++) {
        const date = new Date(today)
        date.setDate(date.getDate() - d)
        const span = Math.max(1, Math.min(day, now - date.getTime()))
        for (const [index, app] of demoApps.entries()) {
          const amount = Math.round(
            (app[2] === 'commerce' ? 28 : 19) *
              (app[2] === 'commerce'
                ? waves[(14 - d) % 7]
                : waves[(16 - d) % 7]) *
              (0.8 + random() * 0.4) *
              (d === 0 ? span / day : 1),
          )
          for (let j = 0; j < amount; j++) {
            const bad = random() < 0.013
            exec(
              'INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',
              randomUUID(),
              app[1],
              [
                '订单增量同步',
                '库存差异核对',
                '商品信息采集',
                '运营日报汇总',
                '图片批量导出',
                '售后状态同步',
                '物流节点更新',
                '清理重复行',
                '活动价格校验',
                '素材分组归档',
                '店铺账单核对',
                '文档格式转换',
              ][index],
              bad ? 'failed' : 'success',
              date.getTime() + Math.floor(random() * span),
              Math.floor(3200 + random() * 89000),
              bad
                ? '任务未完成，请检查输入数据与依赖服务。'
                : '任务执行完成，结果已保存。',
              randomUUID(),
            )
          }
        }
      }
      addAlert(
        'PRODUCT-FETCH',
        '商品采集请求超时',
        '上游商品接口响应超过等待时间，请检查采集服务日志。',
        'error',
        now - 6 * minute,
        'health',
      )
      addAlert(
        'IMAGE-PIPE',
        '程序心跳中断',
        '连续 42 分钟未收到心跳，最近任务可能尚未完成。',
        'warning',
        now - 27 * minute,
        'offline',
      )
      const failedRun = randomUUID()
      const failureDetail = '一批库存记录缺少商品编码，请核对源文件。'
      exec(
        'INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',
        failedRun,
        'STOCK-WATCH',
        '库存校验任务',
        'failed',
        now - 53 * minute,
        4300,
        failureDetail,
        randomUUID(),
      )
      addAlert(
        'STOCK-WATCH',
        '库存校验任务失败',
        failureDetail,
        'warning',
        now - 53 * minute,
        'run:' + failedRun,
      )
      exec("INSERT INTO meta VALUES('seed',?)", String(now))
    })
  transaction(() => {
    seedCatalog(db)
    installProjects(db)
    seedProjects(db, demo)
    installOffice(db, demo)
  })
  function pulse() {
    const now = Date.now()
    let changed = false
    for (const app of all(
      'SELECT * FROM apps WHERE demo=0 AND lastSeen IS NOT NULL AND lastSeen + timeout*60000 < ?',
      now,
    )) {
      const cause = 'offline:' + app.lastSeen
      if (
        !one('SELECT id FROM alerts WHERE appId=? AND cause=?', app.id, cause)
      ) {
        changed = true
        addAlert(
          app.id,
          '程序心跳中断',
          '已超过该程序设置的心跳超时时间。',
          'warning',
          now,
          cause,
        )
      }
    }
    if (changed) onPulseChange()
  }
  const snapshot = () => {
    pulse()
    const now = Date.now()
    const seed = one("SELECT value FROM meta WHERE key='seed'")
    // Move only the fixture's display clock. Persisted records keep their original timestamps.
    const shift = seed
      ? Math.max(0, Math.floor((now - Number(seed.value)) / minute)) * minute
      : 0
    const apps = all(
      'SELECT id,name,kind,description,owner,folder,url,icon,demo,created,lastSeen,reported,timeout,usage,lifecycle,mode FROM apps ORDER BY demo,created',
    )
    attachProjects(db, apps)
    for (const app of apps) {
      if (app.demo && app.lastSeen !== null) app.lastSeen += shift
      app.health = health(app, now)
    }
    const cutoff = now - 15 * day
    const runs = all(
      `SELECT runs.* FROM runs JOIN apps ON apps.id=runs.appId
      WHERE runs.time>=? AND apps.demo=0 UNION ALL
      SELECT runs.* FROM runs JOIN apps ON apps.id=runs.appId
      WHERE runs.time>=? AND apps.demo=1`,
      cutoff,
      cutoff - shift,
    )
    const alerts = all('SELECT * FROM alerts')
    const demoIds = new Set(apps.filter((app) => app.demo).map((app) => app.id))
    for (const records of [runs, alerts]) {
      for (const record of records)
        if (demoIds.has(record.appId)) record.time += shift
      records.sort((a, b) => b.time - a.time)
    }
    return {
      apps,
      runs,
      alerts,
      releases: all('SELECT * FROM releases ORDER BY time DESC,rowid DESC').map(
        (release) => ({ ...release, github: !!release.github }),
      ),
      feedback: all('SELECT * FROM feedback ORDER BY time DESC,rowid DESC'),
      officeSeats: officeSeats(db),
      now,
    }
  }
  const issue = () => {
    const token = 'sp_' + randomBytes(24).toString('hex')
    return { token, digest: hash(token) }
  }
  const register = (data) =>
    transaction(() => {
      const id = 'APP-' + randomUUID().slice(0, 8).toUpperCase()
      const { token, digest } = issue()
      exec(
        'INSERT INTO apps(id,name,kind,description,owner,folder,url,icon,demo,tokenHash,created,lastSeen,reported,timeout,mode,usage) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        id,
        data.name,
        data.kind,
        data.description,
        data.owner,
        data.folder,
        data.url,
        data.kind === 'tool' ? 'code' : 'workflow',
        0,
        digest,
        Date.now(),
        null,
        'healthy',
        data.timeout,
        data.mode,
        data.usage,
      )
      exec("INSERT INTO projects(appId,source) VALUES(?,'manual')", id)
      if (data.project !== undefined) setProject(db, id, data.project)
      return { id, token }
    })
  function rotate(id) {
    const { token, digest } = issue()
    exec('UPDATE apps SET tokenHash=? WHERE id=? AND demo=0', digest, id)
    return { id, token }
  }
  function authenticate(id, token) {
    const app = one('SELECT tokenHash FROM apps WHERE id=? AND demo=0', id)
    return (
      app?.tokenHash?.length === 64 &&
      timingSafeEqual(Buffer.from(app.tokenHash), Buffer.from(hash(token)))
    )
  }
  const heartbeat = (id, status, message) =>
    transaction(() => {
      const app = one('SELECT reported FROM apps WHERE id=?', id)
      exec(
        'UPDATE apps SET lastSeen=?,reported=? WHERE id=?',
        Date.now(),
        status,
        id,
      )
      exec(
        "UPDATE alerts SET state='resolved' WHERE appId=? AND cause LIKE 'offline:%' AND state!='resolved'",
        id,
      )
      if (status === 'warning' && app.reported !== 'warning')
        addAlert(
          id,
          '程序报告异常',
          message || '程序在最近一次心跳中报告了异常状态。',
          'error',
          Date.now(),
          'health',
        )
      if (status === 'healthy')
        exec(
          "UPDATE alerts SET state='resolved' WHERE appId=? AND cause='health' AND state!='resolved'",
          id,
        )
    })
  const record = (id, data) =>
    transaction(() => {
      const existing = one(
        'SELECT id FROM runs WHERE appId=? AND eventId=?',
        id,
        data.eventId,
      )
      if (existing) return { id: existing.id, duplicate: true }
      const runId = randomUUID()
      exec(
        'INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',
        runId,
        id,
        data.title,
        data.status,
        Date.now(),
        data.duration,
        data.message,
        data.eventId,
      )
      if (data.status === 'failed')
        addAlert(
          id,
          data.title + '失败',
          data.message || '程序上报了任务执行失败。',
          'error',
          Date.now(),
          'run:' + runId,
        )
      return { id: runId, duplicate: false }
    })
  return {
    db,
    transaction,
    all,
    one,
    exec,
    pulse,
    snapshot,
    register,
    rotate,
    authenticate,
    heartbeat,
    record,
  }
}

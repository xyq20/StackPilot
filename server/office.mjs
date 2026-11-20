import {
  installOfficeLife,
  attachOfficeLife,
  updateCharacter,
  clearLifeCue,
  writeLifeCue,
} from './office-life.mjs'
const seatCounts = { A: 3, B: 6, C: 4, D: 6 }
const seatIds = Object.entries(seatCounts).flatMap(([group, count]) =>
  Array.from({ length: count }, (_, index) => group + (index + 1)),
)
const examples = {
  A1: ['PRODUCT-FETCH'],
  A3: ['ORDER-SYNC'],
  B2: ['IMAGE-PIPE'],
  B5: ['SHEET-CLEAN'],
  C2: ['STOCK-WATCH', 'TRACK-FLOW'],
  D3: ['ZSZ-SYCM'],
}
const fail = (status, message) => Object.assign(new Error(message), { status })

// Called inside the workspace's initialization transaction, after projects exist.
export function installOffice(db, demo) {
  db.exec(`CREATE TABLE IF NOT EXISTS office_seats (
    id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', example INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS office_seat_apps (
    seatId TEXT NOT NULL REFERENCES office_seats(id) ON DELETE CASCADE,
    appId TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE, position INTEGER NOT NULL,
    PRIMARY KEY (seatId,appId)
  );`)
  const insert = db.prepare(
    'INSERT INTO office_seats(id,example) VALUES(?,?) ON CONFLICT(id) DO NOTHING',
  )
  const bind = db.prepare(
    'INSERT INTO office_seat_apps(seatId,appId,position) VALUES(?,?,?)',
  )
  const knownApps = new Set(
    db
      .prepare('SELECT id FROM apps')
      .all()
      .map((row) => row.id),
  )
  for (const id of seatIds) {
    const sample = demo
      ? (examples[id] || []).filter((appId) => knownApps.has(appId))
      : []
    if (insert.run(id, Number(sample.length > 0)).changes) {
      sample.forEach((appId, index) => bind.run(id, appId, index))
    }
  }
  installOfficeLife(db)
}

export function officeSeats(db) {
  const records = db
    .prepare('SELECT id,name,example,revision FROM office_seats ORDER BY id')
    .all()
  const byId = new Map(
    records.map((row) => [
      row.id,
      { ...row, example: !!row.example, appIds: [] },
    ]),
  )
  const links = db
    .prepare(
      'SELECT seatId,appId FROM office_seat_apps ORDER BY seatId,position',
    )
    .all()
  for (const link of links) byId.get(link.seatId).appIds.push(link.appId)
  attachOfficeLife(db, byId)
  return [...byId.values()]
}

function seatName(value) {
  if (typeof value !== 'string' || value.length > 60)
    throw fail(400, '座位姓名须为 0 至 60 个字符')
  return value.trim()
}
export function updateSeat(store, id, data) {
  if (!seatIds.includes(id)) throw fail(404, '座位不存在')
  const name = seatName(data.name)
  const { appIds, revision } = data
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw fail(400, '座位版本无效，请刷新后重试')
  if (
    !Array.isArray(appIds) ||
    appIds.some((appId) => typeof appId !== 'string' || !appId) ||
    new Set(appIds).size !== appIds.length
  ) {
    throw fail(400, '关联项目须为不重复的项目编号')
  }
  return store.transaction(() => {
    const changed = store.exec(
      'UPDATE office_seats SET name=?,example=0,revision=revision+1 WHERE id=? AND revision=?',
      name,
      id,
      revision,
    )
    if (!changed.changes)
      throw fail(409, '座位资料已更新，请核对最新资料后再保存')
    store.exec('DELETE FROM office_seat_apps WHERE seatId=?', id)
    const lookup = store.db.prepare('SELECT 1 FROM apps WHERE id=?')
    const add = store.db.prepare(
      'INSERT INTO office_seat_apps(seatId,appId,position) VALUES(?,?,?)',
    )
    appIds.forEach((appId, index) => {
      if (!lookup.get(appId)) throw fail(400, '关联的项目不存在')
      add.run(id, appId, index)
    })
    updateCharacter(store, id, data.character)
    if (!name && !appIds.length) clearLifeCue(store, id)
    return officeSeats(store.db).find((seat) => seat.id === id)
  })
}

export function startLife(store, id, data) {
  return store.transaction(() => {
    writeLifeCue(store, id, data)
    return officeSeats(store.db).find((seat) => seat.id === id)
  })
}

export function swapSeats(store, id, { targetId, revision, targetRevision }) {
  if (!seatIds.includes(id) || !seatIds.includes(targetId))
    throw fail(404, '座位不存在')
  if (id === targetId) throw fail(400, '请选择另一个座位')
  if (
    ![revision, targetRevision].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  )
    throw fail(400, '座位版本无效')
  return store.transaction(() => {
    const seats = officeSeats(store.db)
    const source = seats.find((s) => s.id === id),
      target = seats.find((s) => s.id === targetId)
    if (source.revision !== revision || target.revision !== targetRevision)
      throw fail(409, '座位资料已更新，请刷新后换座')
    if (
      !source.name &&
      !source.appIds.length &&
      !target.name &&
      !target.appIds.length
    )
      throw fail(409, '两个座位均为空')
    clearLifeCue(store, id)
    clearLifeCue(store, targetId)
    store.exec(
      'DELETE FROM office_characters WHERE seatId IN (?,?)',
      id,
      targetId,
    )
    store.exec(
      'DELETE FROM office_seat_apps WHERE seatId IN (?,?)',
      id,
      targetId,
    )
    for (const [destination, person] of [
      [targetId, source],
      [id, target],
    ]) {
      store.exec(
        'UPDATE office_seats SET revision=revision+1,name=?,example=? WHERE id=?',
        person.name,
        Number(person.example),
        destination,
      )
      const { id: characterId, gender, look, accent, habit } = person.character
      store.exec(
        'INSERT INTO office_characters(id,seatId,gender,look,accent,habit) VALUES(?,?,?,?,?,?)',
        characterId,
        destination,
        gender,
        look,
        accent,
        habit,
      )
      person.appIds.forEach((appId, index) =>
        store.exec(
          'INSERT INTO office_seat_apps(seatId,appId,position) VALUES(?,?,?)',
          destination,
          appId,
          index,
        ),
      )
    }
    return {
      seats: officeSeats(store.db).filter(
        (s) => s.id === id || s.id === targetId,
      ),
    }
  })
}

export function importNames(store, data) {
  const { names } = data
  if (!names || typeof names !== 'object' || Array.isArray(names))
    throw fail(400, '请提供以座位编号为键的姓名记录')
  return store.transaction(() => {
    let imported = 0
    for (const [id, value] of Object.entries(names)) {
      if (!seatIds.includes(id)) throw fail(400, '旧姓名记录包含未知座位')
      const name = seatName(value)
      if (name)
        imported += store.exec(
          "UPDATE office_seats SET name=?,revision=revision+1 WHERE id=? AND name=''",
          name,
          id,
        ).changes
    }
    return { imported }
  })
}

export function officeEventFeed() {
  const clients = new Set()
  const changed = 'data: changed\n\n'
  let keepAlive
  function write(res, frame) {
    if (res.destroyed || res.writableEnded) return
    if (!res.write(frame)) res.destroy()
  }
  function broadcast(frame) {
    for (const res of clients) write(res, frame)
  }
  function subscribe(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    })
    clients.add(res)
    res.once('close', () => {
      clients.delete(res)
      if (!clients.size) {
        clearInterval(keepAlive)
        keepAlive = undefined
      }
    })
    if (!keepAlive) {
      keepAlive = setInterval(() => broadcast(': keepalive\n\n'), 25000)
      keepAlive.unref()
    }
    // Reconnecting clients immediately load the latest snapshot, including missed changes.
    write(res, 'retry: 2500\n' + changed)
  }
  return { subscribe, changed: () => broadcast(changed) }
}

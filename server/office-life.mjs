import { randomUUID } from 'node:crypto'

const accents = ['violet', 'teal', 'amber', 'blue', 'rose', 'sage']
const habits = ['balanced', 'focused', 'social', 'relaxed']
const actions = ['work', 'drink', 'restroom', 'slack', 'stretch', 'chat']
const fail = (status, message) => Object.assign(new Error(message), { status })

export function installOfficeLife(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS office_characters (
    id TEXT PRIMARY KEY, seatId TEXT NOT NULL UNIQUE REFERENCES office_seats(id) ON DELETE CASCADE,
    gender TEXT NOT NULL, look TEXT NOT NULL, accent TEXT NOT NULL, habit TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS office_life_cues (
    seatId TEXT PRIMARY KEY REFERENCES office_seats(id) ON DELETE CASCADE, id TEXT NOT NULL,
    action TEXT NOT NULL, at INTEGER NOT NULL, partnerId TEXT REFERENCES office_seats(id) ON DELETE CASCADE
  );`)
  const seats = db
    .prepare(
      'SELECT s.id,s.example,s.name,c.id AS characterId FROM office_seats s LEFT JOIN office_characters c ON c.seatId=s.id ORDER BY s.id',
    )
    .all()
  const insert = db.prepare(
    'INSERT INTO office_characters(id,seatId,gender,look,accent,habit) VALUES(?,?,?,?,?,?)',
  )
  seats.forEach((seat, index) => {
    if (seat.characterId) return
    const female = index % 2 === 1
    const look =
      (female ? 'f' : 'm') + String(Math.floor(index / 2) + 1).padStart(2, '0')
    const gender =
      seat.example && !seat.name ? (female ? 'female' : 'male') : 'unset'
    insert.run(
      randomUUID(),
      seat.id,
      gender,
      look,
      accents[index % accents.length],
      seat.example ? habits[index % habits.length] : 'balanced',
    )
  })
}

export function attachOfficeLife(db, byId) {
  const rows = db
    .prepare(
      `SELECT c.*,q.id AS cueId,q.action,q.at,coalesce(q.partnerId,'') AS partnerId
    FROM office_characters c LEFT JOIN office_life_cues q ON c.seatId=q.seatId`,
    )
    .all()
  for (const {
    seatId,
    id,
    gender,
    look,
    accent,
    habit,
    cueId,
    action,
    at,
    partnerId,
  } of rows) {
    const seat = byId.get(seatId)
    seat.character = { id, gender, look, accent, habit }
    seat.lifeCue = cueId ? { id: cueId, action, at, partnerId } : null
  }
}

export function updateCharacter(store, seatId, edit) {
  if (edit === undefined) return
  if (!edit || typeof edit !== 'object' || Array.isArray(edit))
    throw fail(400, '角色资料格式无效')
  const current = store.one(
    'SELECT id,gender,look,accent,habit FROM office_characters WHERE seatId=?',
    seatId,
  )
  if (edit.id !== undefined && edit.id !== current.id)
    throw fail(409, '角色已变更，请刷新座位资料')
  const { gender, look, accent, habit } = { ...current, ...edit }
  if (!['male', 'female', 'unset'].includes(gender))
    throw fail(400, '角色性别选项无效')
  if (typeof look !== 'string' || !/^[mf](?:0[1-9]|10)$/.test(look))
    throw fail(400, '角色造型无效')
  if (
    (gender === 'male' && !look.startsWith('m')) ||
    (gender === 'female' && !look.startsWith('f'))
  )
    throw fail(400, '请选择与角色性别设置一致的造型')
  if (!accents.includes(accent) || !habits.includes(habit))
    throw fail(400, '角色配色或习惯无效')
  store.exec(
    'UPDATE office_characters SET gender=?,look=?,accent=?,habit=? WHERE seatId=?',
    gender,
    look,
    accent,
    habit,
    seatId,
  )
}

// Both rows in a conversation share the same cue ID. Interrupting either seat clears the pair.
export function clearLifeCue(store, seatId) {
  const cue = store.one(
    'SELECT id FROM office_life_cues WHERE seatId=?',
    seatId,
  )
  if (cue) store.exec('DELETE FROM office_life_cues WHERE id=?', cue.id)
}

export function writeLifeCue(store, seatId, { action, partnerId = '' }) {
  if (!actions.includes(action)) throw fail(400, '动作无效')
  if (action !== 'chat' && partnerId !== '')
    throw fail(400, '只有聊天动作可指定对象')
  const occupied = (id) => {
    const seat = store.one(
      `SELECT name!='' OR EXISTS(SELECT 1 FROM office_seat_apps WHERE seatId=s.id) AS occupied
      FROM office_seats s WHERE s.id=?`,
      id,
    )
    if (!seat) throw fail(404, '座位不存在')
    if (!seat.occupied) throw fail(409, '该座位尚未有角色入场')
  }
  occupied(seatId)
  if (action === 'chat') {
    if (typeof partnerId !== 'string' || !partnerId || partnerId === seatId)
      throw fail(400, '请选择另一位已入场的角色')
    occupied(partnerId)
  }
  const id = randomUUID(),
    at = Date.now()
  const insert = store.db.prepare(
    'INSERT INTO office_life_cues(seatId,id,action,at,partnerId) VALUES(?,?,?,?,?)',
  )
  clearLifeCue(store, seatId)
  if (action === 'chat') {
    clearLifeCue(store, partnerId)
    insert.run(partnerId, id, action, at, seatId)
  }
  insert.run(seatId, id, action, at, partnerId || null)
}

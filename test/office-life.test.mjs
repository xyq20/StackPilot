import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openStore } from '../server/store.mjs'
import {
  officeSeats,
  updateSeat,
  startLife,
  swapSeats,
} from '../server/office.mjs'

test('旧工作间升级保留席位和关联，为 19 席生成并持久保存不同造型与身份', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'office-identity-'))
  const file = path.join(dir, 'workspace.sqlite')
  let s = openStore(file, true)
  t.after(async () => {
    s.db.close()
    await rm(dir, { force: true, recursive: true })
  })
  const existing = updateSeat(s, 'A2', {
    name: '原有姓名',
    appIds: ['ORDER-SYNC'],
    revision: 0,
  })
  s.db.exec('DROP TABLE office_life_cues; DROP TABLE office_characters')
  s.db.close()
  s = openStore(file, true)
  const rows = officeSeats(s.db)
  assert.equal(new Set(rows.map((r) => r.character.look)).size, 19)
  assert.equal(new Set(rows.map((r) => r.character.id)).size, 19)
  assert.ok(rows.every((r) => !r.lifeCue))
  assert.deepEqual(
    new Set(rows.filter((r) => r.example).map((r) => r.character.gender)),
    new Set(['male', 'female']),
  )
  const seat = rows.find((r) => r.id === 'A2')
  assert.equal(seat.name, existing.name)
  assert.deepEqual(seat.appIds, existing.appIds)
  assert.equal(seat.revision, existing.revision)
  assert.equal(seat.character.gender, 'unset')
  const body = { name: seat.name, appIds: seat.appIds, revision: seat.revision }
  for (const invalid of [
    { gender: 'male', look: 'f08' },
    { gender: 'female', look: 'm08' },
    { look: 'm00' },
    { look: 'f11' },
    { habit: 'invalid' },
    { accent: 'invalid' },
  ]) {
    assert.throws(
      () => updateSeat(s, seat.id, { ...body, character: invalid }),
      { status: 400 },
    )
  }
  assert.deepEqual(
    officeSeats(s.db).find((r) => r.id === seat.id),
    seat,
  )
  const character = {
    ...seat.character,
    look: 'f10',
    gender: 'female',
    accent: 'amber',
    habit: 'social',
  }
  const updated = updateSeat(s, seat.id, { ...body, character })
  assert.deepEqual(updated.character, character)
  const partial = updateSeat(s, seat.id, {
    ...body,
    revision: updated.revision,
    character: { habit: 'relaxed' },
  })
  assert.deepEqual(partial.character, { ...character, habit: 'relaxed' })
  const legacy = updateSeat(s, seat.id, { ...body, revision: partial.revision })
  assert.deepEqual(legacy.character, partial.character)
  const last = startLife(s, seat.id, { action: 'drink' })
  s.db.close()
  s = openStore(file, true)
  assert.deepEqual(
    officeSeats(s.db).find((r) => r.id === seat.id),
    last,
  )
})

test('动作使用服务端同钟；配对聊天互指、可打断；清空或换座处理双方', (t) => {
  const s = openStore(':memory:', true)
  t.after(() => s.db.close())
  const get = (id) => officeSeats(s.db).find((seat) => seat.id === id)
  const cue = (id, action, partnerId) =>
    startLife(s, id, { action, partnerId }).lifeCue
  for (const action of ['work', 'drink', 'restroom', 'slack', 'stretch']) {
    const before = Date.now(),
      event = cue('A1', action)
    assert.equal(event.action, action)
    assert.equal(event.partnerId, '')
    assert.ok(event.at >= before && event.at <= Date.now())
    assert.equal(get('A1').revision, 0)
  }
  assert.throws(() => cue('A2', 'work'), { status: 409 })
  assert.throws(() => cue('A1', 'chat', 'A2'), { status: 409 })
  assert.throws(() => cue('A1', 'chat', 'A1'), { status: 400 })
  assert.throws(() => cue('A1', 'chat'), { status: 400 })
  assert.throws(() => cue('A1', 'invalid'), { status: 400 })
  assert.throws(() => cue('A1', 'drink', 'A3'), { status: 400 })
  const first = cue('A1', 'chat', 'A3')
  assert.deepEqual(get('A3').lifeCue, { ...first, partnerId: 'A1' })
  cue('C2', 'chat', 'D3')
  const next = cue('A1', 'chat', 'C2')
  assert.notEqual(next.id, first.id)
  assert.equal(get('A3').lifeCue, null)
  assert.equal(get('D3').lifeCue, null)
  assert.deepEqual(get('C2').lifeCue, { ...next, partnerId: 'A1' })
  cue('C2', 'stretch')
  assert.equal(get('A1').lifeCue, null)
  cue('B2', 'chat', 'B5')
  updateSeat(s, 'B2', { name: '', appIds: [], revision: 0 })
  assert.equal(get('B5').lifeCue, null)
  assert.equal(get('B2').lifeCue, null)

  const source = updateSeat(s, 'A1', {
    name: '已登记',
    revision: 0,
    appIds: ['STOCK-WATCH', 'SHEET-CLEAN'],
    character: { habit: 'focused' },
  })
  const target = get('D3')
  cue('A1', 'chat', 'B5')
  cue('D3', 'chat', 'A3')
  const before = officeSeats(s.db)
  assert.throws(
    () =>
      swapSeats(s, 'A1', { targetId: 'D3', revision: 0, targetRevision: 0 }),
    { status: 409 },
  )
  assert.deepEqual(officeSeats(s.db), before)
  const swapped = swapSeats(s, 'A1', {
    targetId: 'D3',
    revision: source.revision,
    targetRevision: target.revision,
  }).seats
  assert.deepEqual(swapped, [
    { ...target, id: 'A1', revision: source.revision + 1, lifeCue: null },
    { ...source, id: 'D3', revision: target.revision + 1, lifeCue: null },
  ])
  assert.equal(get('B5').lifeCue, null)
  assert.equal(get('A3').lifeCue, null)
  assert.equal(
    new Set(officeSeats(s.db).map((seat) => seat.character.id)).size,
    19,
  )
})

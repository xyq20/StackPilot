import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'

// Use the application's own TS loader and the actual chair/direction map.
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
})
let intentsFor, OfficeLifeScene, positions, cooler, waterService
try {
  ;({ intentsFor, OfficeLifeScene, cooler, waterService } =
    await vite.ssrLoadModule('/src/office-life.ts'))
  ;({ positions } = await vite.ssrLoadModule('/src/office-geometry.ts'))
} finally {
  await vite.close()
}

const start = Date.UTC(2026, 10, 19, 0, 0)
const minute = 60000
const people = Object.keys(positions)
  .sort()
  .map((id, i) => ({
    id,
    name: '调度样例',
    appIds: [],
    example: false,
    revision: 0,
    character: {
      id: 'scheduler-person-' + i,
      gender: 'unset',
      look: 'm01',
      accent: 'blue',
      habit: ['balanced', 'focused', 'social', 'relaxed'][i % 4],
    },
    lifeCue: null,
  }))

test('整日模拟以工作为主，自动休息交错，最多同时发起一件事', () => {
  for (const count of [1, 2, 6, 19]) {
    const group = people.slice(0, count)
    const seen = new Set()
    let working = 0,
      total = 0,
      lastBreak = -Infinity
    for (let now = start; now < start + 24 * 60 * minute; now += 2000) {
      const intents = [...intentsFor(group, now, true).entries()]
      const paused = intents.filter(([, intent]) => intent.action !== 'work')
      total += count
      working += count - paused.length
      assert.ok(paused.length <= 2)
      if (!paused.length) continue
      const [seat, first] = paused[0]
      if (paused.length === 2) {
        const [peer, second] = paused[1]
        assert.equal(first.action, 'chat')
        assert.equal(second.action, 'chat')
        assert.equal(first.partnerId, peer)
        assert.equal(second.partnerId, seat)
        assert.equal(second.id, first.id)
        assert.equal(second.at, first.at)
      } else {
        assert.notEqual(first.action, 'chat')
      }
      if (!seen.has(first.id)) {
        assert.ok(first.at - lastBreak >= 90000)
        seen.add(first.id)
        lastBreak = first.at
      }
    }
    assert.ok(seen.size > 0)
    assert.ok(
      working / total > 0.94,
      '工作时间比例 ' + count + ' 席 ' + working / total,
    )
  }
  assert.equal(intentsFor([], start, true).size, 0)
  assert.equal(
    intentsFor([{ ...people[0], name: '', appIds: [] }], start, true).size,
    0,
  )
})

test('显式动作优先，手动工作保持十分钟，停用自动动作仍可手动喝水', () => {
  const seat = people[0]
  const other = people[1]
  const forced = {
    ...seat,
    lifeCue: { id: 'manual', action: 'work', at: start, partnerId: '' },
  }
  for (let now = start; now < start + 10 * minute; now += 2000) {
    const scene = intentsFor([forced, other], now, true)
    assert.equal(scene.get(seat.id).id, 'manual')
    assert.equal(scene.get(seat.id).action, 'work')
    assert.notEqual(scene.get(other.id).partnerId, seat.id)
  }
  assert.notEqual(
    intentsFor([forced], start + 10 * minute, true).get(seat.id).id,
    'manual',
  )
  const drink = {
    ...seat,
    lifeCue: { id: 'drink-now', action: 'drink', at: start, partnerId: '' },
  }
  const scene = new OfficeLifeScene()
  const during = scene.frames([drink], start + 10000, false).get(seat.id)
  assert.equal(during.action, 'drink')
  assert.equal(during.atDesk, false)
  for (const now of [start + 24000, start + 2 * minute, start + 8 * minute]) {
    const frame = scene.frames([drink, other], now, false).get(seat.id)
    assert.equal(frame.action, 'work')
    assert.equal(frame.atDesk, true)
    assert.deepEqual(frame.p, positions[seat.id].stand)
  }
})

test('在座三种动作都面对显示器，自动聊天可按同钟重播，全程按路线回座', () => {
  for (const original of people) {
    for (const action of ['work', 'slack', 'stretch']) {
      const seat = {
        ...original,
        lifeCue: { id: action, action, at: start, partnerId: '' },
      }
      const frame = new OfficeLifeScene()
        .frames([seat], start + 2000, false)
        .get(seat.id)
      assert.equal(frame.action, action)
      assert.equal(frame.atDesk, true)
      assert.equal(frame.facing, positions[seat.id].facing)
      assert.deepEqual(frame.p, positions[seat.id].stand)
    }
  }

  const group = people.slice(0, 6)
  let event, actor
  for (let now = start; now < start + 6 * 60 * minute && !event; now += 2000) {
    for (const [id, intent] of intentsFor(group, now, true)) {
      if (intent.action === 'chat') {
        event = intent
        actor = id
        break
      }
    }
  }
  assert.ok(event)
  const ids = [actor, event.partnerId]
  const live = new OfficeLifeScene()
  live.frames(group, event.at - 1000, true)
  for (const offset of [120, 3000, 10000, 16000, 24000]) {
    const now = event.at + offset
    const active = live.frames(group, now, true)
    const reload = new OfficeLifeScene().frames([...group].reverse(), now, true)
    for (const id of ids) {
      assert.deepEqual(active.get(id), reload.get(id))
      if (offset === 10000) assert.equal(active.get(id).action, 'chat')
      if (offset === 24000) {
        const frame = active.get(id)
        assert.equal(frame.action, 'work')
        assert.equal(frame.atDesk, true)
        assert.deepEqual(frame.p, positions[id].stand)
        assert.equal(frame.facing, positions[id].facing)
      }
    }
  }
})

const cue = (seat, action, at = start, partnerId = '') => ({
  ...seat,
  lifeCue: { id: action + '-' + at, action, at, partnerId },
})
function poseOrder(samples, ...names) {
  let index = -1
  for (const name of names) {
    index = samples.findIndex((frame, i) => i > index && frame.pose === name)
    assert.notEqual(index, -1, '缺少连续动作 ' + name)
  }
}
function confirmMotion(samples, maxStep) {
  for (let i = 0; i < samples.length; i++) {
    const frame = samples[i]
    assert.ok(frame.progress >= 0 && frame.progress <= 1)
    assert.ok(frame.seatBlend >= 0 && frame.seatBlend <= 1)
    assert.ok(frame.stride >= 0 && frame.stride < 1 && frame.speed >= 0)
    if (i) {
      const last = samples[i - 1]
      assert.ok(
        Math.hypot(frame.p[0] - last.p[0], frame.p[1] - last.p[1]) <= maxStep,
        '脚点应连续',
      )
    }
  }
}
// Footprint bounds leave clearance for shoes at the cabinet base and desk edges.
const forbidden = [
  [128, 108, 710, 220],
  [153, 476, 730, 658],
  [140, 883, 900, 988],
  [983, 141, 1226, 678],
  [726, 74, 807, 201],
  [cooler[0] - 34, 190, cooler[0] + 34, cooler[1] + 10],
]
function assertClearFloor(id, [x, y]) {
  assert.ok(x >= 120 && x < 1480 && y >= 110 && y <= 1000)
  for (const furniture of Object.values(positions)) {
    const [cx, cy] = furniture.chair
    const side = furniture.facing === 'east' || furniture.facing === 'west'
    assert.ok(
      !(
        Math.abs(x - cx) < 46 &&
        y > cy - (side ? 76 : 64) &&
        y < cy + (side ? 30 : 23)
      ),
      id + ' 走入椅子占用区域',
    )
  }
  assert.ok(
    !forbidden.some(([l, t, r, b]) => x > l && x < r && y > t && y < b),
    id + ' 进入桌面或家具占用区',
  )
}
test('逐帧验证接水、饮用、如厕与桌边放松，过道避开桌椅、柜子和饮水机', () => {
  for (const original of people) {
    for (const action of ['drink', 'restroom']) {
      const scene = new OfficeLifeScene(),
        seat = cue(original, action),
        samples = []
      for (let ms = 0; ms <= 30000; ms += 50) {
        const frame = scene.frames([seat], start + ms, false).get(seat.id)
        samples.push(frame)
        assertClearFloor(original.id, frame.p)
      }
      confirmMotion(samples, 14)
      if (action === 'drink') {
        for (const frame of samples) {
          if (frame.pose !== 'sip' && frame.pose !== 'fill') continue
          const [x, y] = frame.p
          // Leave room for both shoes beside the door leaf and its front jamb.
          assert.ok(x < 1250 || y < 751, '饮水位置侵入了开门区')
        }
        poseOrder(
          samples,
          'rise',
          'walk',
          'reach',
          'fill',
          'walk',
          'reach',
          'sip',
          'relax',
          'walk',
          'sit',
          'typing',
        )
      } else
        poseOrder(
          samples,
          'rise',
          'walk',
          'door',
          'away',
          'door',
          'walk',
          'sit',
          'typing',
        )
      assert.deepEqual(samples.at(-1).p, positions[seat.id].stand)
      assert.equal(samples.at(-1).seatBlend, 1)
      const steps = samples.filter((f) => f.pose === 'walk')
      assert.ok(
        steps.some((f) => f.speed < 65) && steps.some((f) => f.speed > 205),
        '起步与停步应有加减速',
      )
      assert.ok(
        steps.some((f) => Math.abs(f.heading % 90) > 7),
        '拐弯应经过斜向',
      )
    }
  }
  for (const [action, order] of [
    ['slack', ['reach', 'phone', 'pocket', 'typing']],
    ['stretch', ['stretch', 'relax', 'typing']],
  ]) {
    const seat = cue(people[0], action),
      scene = new OfficeLifeScene(),
      samples = []
    for (let ms = 0; ms <= 15000; ms += 50)
      samples.push(scene.frames([seat], start + ms, false).get(seat.id))
    poseOrder(samples, ...order)
    assert.ok(
      samples.every(
        (f) =>
          f.atDesk &&
          f.seatBlend === 1 &&
          f.facing === positions[seat.id].facing,
      ),
    )
  }
})

test('双人对话轮流说话并停顿；同时接水预留水嘴和不同饮水位置', () => {
  const scene = new OfficeLifeScene(),
    a = people[0],
    b = people[14]
  const pair = [cue(a, 'chat', start, b.id), cue(b, 'chat', start, a.id)]
  const lines = [],
    poses = [new Set(), new Set()]
  let bothSilent = false,
    changedSpeaker = false,
    lastSpeaker
  for (let ms = 0; ms < 25000; ms += 50) {
    const frames = [...scene.frames(pair, start + ms, false).values()]
    const speaking = frames.filter((f) => f.pose === 'speak')
    assert.ok(speaking.length <= 1)
    assert.ok(frames.every((f) => !f.talk || f.pose === 'speak'))
    frames.forEach((f, i) => poses[i].add(f.pose))
    if (speaking.length) {
      const speaker = speaking[0].partnerId
      if (lastSpeaker && speaker !== lastSpeaker) changedSpeaker = true
      lastSpeaker = speaker
      if (lines.at(-1) !== speaking[0].talk) lines.push(speaking[0].talk)
      assert.ok(frames.every((f) => f.pose === 'speak' || f.pose === 'listen'))
    }
    if (frames.every((f) => f.pose === 'listen')) bothSilent = true
  }
  assert.equal(lines.length, 3)
  assert.ok(changedSpeaker && bothSilent)
  assert.ok(
    poses.every(
      (s) => s.has('rise') && s.has('walk') && s.has('sit') && s.has('typing'),
    ),
  )
  const drinks = [cue(a, 'drink'), cue(b, 'drink')]
  const sips = new Map(),
    fills = new Set()
  const dispenser = new OfficeLifeScene()
  for (let ms = 0; ms < 33000; ms += 50) {
    const frames = [...dispenser.frames(drinks, start + ms, false)]
    assert.ok(frames.filter(([, f]) => f.pose === 'fill').length <= 1)
    for (const [id, f] of frames) {
      if (f.pose === 'fill') fills.add(id)
      if (f.pose === 'sip') sips.set(id, f.p)
    }
  }
  assert.equal(fills.size, 2)
  assert.equal(sips.size, 2)
  const [left, right] = [...sips.values()]
  assert.ok(Math.hypot(left[0] - right[0], left[1] - right[1]) > 50)
})

test('手动打断当前路径和同人换座保持脚点连续', () => {
  const scene = new OfficeLifeScene(),
    a = people[0],
    to = people.find((s) => s.id === 'D2')
  const drink = cue(a, 'drink'),
    cut = start + 1800
  for (let at = start; at < cut; at += 50) scene.frames([drink], at, false)
  const before = scene.frames([drink], cut, false).get(a.id)
  assert.equal(before.pose, 'walk')
  const work = cue(a, 'work', cut)
  const frames = []
  for (let dt = 0; dt <= 13000; dt += 50)
    frames.push(scene.frames([work], cut + dt, false).get(a.id))
  assert.deepEqual(frames[0].p, before.p)
  confirmMotion(frames, 14)
  poseOrder(frames, 'walk', 'sit', 'typing')
  const moved = { ...to, character: a.character, lifeCue: null }
  const travel = []
  for (let dt = 0; dt <= 14000; dt += 50)
    travel.push(scene.frames([moved], cut + 14000 + dt, false).get(to.id))
  assert.deepEqual(travel[0].p, positions[a.id].stand)
  poseOrder(travel, 'rise', 'walk', 'sit', 'typing')
  assert.deepEqual(travel.at(-1).p, positions[to.id].stand)
  const projected = travel.map((f) => {
    const origin = positions[f.blendSeatId]
    return {
      ...f,
      p: f.p.map(
        (n, i) => n + f.seatBlend * (origin.chair[i] - origin.stand[i]),
      ),
    }
  })
  assert.equal(travel[0].blendSeatId, a.id)
  assert.equal(travel.at(-1).blendSeatId, to.id)
  assert.deepEqual(projected[0].p, positions[a.id].chair)
  assert.deepEqual(projected.at(-1).p, positions[to.id].chair)
  confirmMotion(projected, 14)
})

test('六人同时手动接水依次接满后各自回座，重载时可重建队列', () => {
  const group = people.slice(0, 6).map((s) => cue(s, 'drink'))
  const scene = new OfficeLifeScene(),
    drank = new Set()
  for (let ms = 0; ms <= 65000; ms += 100) {
    const frames = scene.frames(group, start + ms, false)
    assert.ok([...frames.values()].filter((f) => f.pose === 'fill').length <= 1)
    for (const [id, f] of frames) if (f.pose === 'sip') drank.add(id)
    if (ms === 30000)
      assert.deepEqual(
        frames,
        new OfficeLifeScene().frames([...group].reverse(), start + ms, false),
      )
    if (ms === 65000)
      assert.ok(
        [...frames.values()].every((f) => f.pose === 'typing' && f.atDesk),
      )
  }
  assert.equal(drank.size, 6)
})

test('新水嘴单向进出，19 席同时接水时排队和饮水均留在中央及北侧通道', () => {
  assert.deepEqual(waterService, [cooler[0] - 38, cooler[1] + 32])
  assert.deepEqual(waterService, [736, 321])
  const scene = new OfficeLifeScene(),
    party = people.map((s) => cue(s, 'drink')),
    filled = new Set(),
    sips = new Map()
  const approached = new Set(),
    leftTap = new Set()
  for (let elapsed = 0; elapsed <= 150000; elapsed += 50) {
    const now = start + elapsed
    const frames = scene.frames(party, now, false)
    let filling = 0
    for (const [id, frame] of frames) {
      assertClearFloor(id, frame.p)
      const [x, y] = frame.p,
        dx = x - waterService[0],
        dy = y - waterService[1]
      if (frame.pose === 'fill') {
        assert.deepEqual(frame.p, waterService)
        assert.equal(frame.facing, 'east', '杯子应从西侧伸向南向饮水机')
        filled.add(id)
        filling++
      }
      if (frame.pose === 'walk' && dy > 2 && dy < 14 && Math.abs(dx) < 35) {
        if (frame.label === '走向饮水机' && dx < 0) approached.add(id)
        if (frame.carryingCup && dx > 0) leftTap.add(id)
      }
      if (frame.pose === 'sip') sips.set(id, frame.p)
      if (['sip', 'fill', 'wait'].includes(frame.pose))
        assert.ok(x < 900 && y < 700, '排队/饮水不应回到原右墙')
      if (elapsed === 150000) assert.equal(frame.pose, 'typing')
    }
    assert.ok(filling <= 1)
    if (elapsed === 30000 || elapsed === 50000)
      assert.deepEqual(
        frames,
        new OfficeLifeScene().frames([...party].reverse(), now, false),
      )
  }
  assert.equal(approached.size, 19)
  assert.equal(leftTap.size, 19)
  assert.equal(filled.size, 19)
  assert.equal(sips.size, 19)
  const points = [...sips.values()]
  for (let i = 0; i < points.length; i++)
    for (let j = 0; j < i; j++) {
      assert.ok(
        Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) >
          50,
      )
    }
})

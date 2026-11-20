import { positions, type Facing } from './office-geometry'
import type { OfficeAction, OfficeSeat } from './model'

export type Point = [number, number]
export const actionNames: Record<OfficeAction, string> = {
  work: '工作',
  drink: '喝水',
  restroom: '上厕所',
  slack: '摸鱼',
  stretch: '伸懒腰',
  chat: '聊天',
}
export const occupied = (s: OfficeSeat) =>
  Boolean(s.name.trim() || s.appIds.length)
// Both anchors are stage pixels. The service foot is offset from the fixture's
// bottom center so a forward-held cup meets the cold-water nozzle.
export const cooler: Point = [774, 289]
export const waterService: Point = [cooler[0] - 38, cooler[1] + 32]
const waterEntry: Point = [690, 347]
const waterExit: Point = [778, 385]
const door: Point = [1348, 995]
// Approach the south-facing dispenser from its southwest. Leave to the southeast.
// Waiting bays follow the upper cross aisle
// and the central spine, outside the desk banks, chairs and entrance door.
const upperWaterBays: Point[] = [
  [650, 327],
  [579, 327],
  [508, 327],
  [437, 327],
  [366, 327],
  [295, 327],
  [224, 327],
  [153, 327],
]
const centralWaterBays: Point[] = [
  waterExit,
  [863, 346],
  [863, 417],
  [778, 448],
  [863, 485],
  [778, 511],
  [863, 551],
  [778, 576],
  [863, 616],
  [778, 645],
  [863, 683],
]
const waterSpots = [...upperWaterBays, ...centralWaterBays].sort(
  (a, b) => distance(a, waterService) - distance(b, waterService),
)
const chatSpots: [Point, Point][] = Array.from({ length: 9 }, (_, i) => {
  const x = 930 + ((i + 1) % 3) * 125,
    y = 782 + Math.floor(i / 3) * 78
  return [
    [x, y],
    [x + 71, y],
  ]
})
const minute = 60000
const graph = new Map<string, { p: Point; edges: Set<string> }>()
function distance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}
const key = (p: Point) => p.join(',')
function connect(a: Point, b: Point) {
  const add = (p: Point) => {
    const k = key(p)
    if (!graph.has(k)) graph.set(k, { p, edges: new Set() })
    return graph.get(k)!
  }
  add(a).edges.add(key(b))
  add(b).edges.add(key(a))
}
function lane(points: Point[]) {
  for (let i = 1; i < points.length; i++) connect(points[i - 1], points[i])
}
// Stage coordinates are foot positions. Walkable lanes run between the desk banks,
// down either side of the right island and across the open floor below it.
const aisles: Point[][] = [[], [], [], []]
for (const [id, p] of Object.entries(positions)) {
  const [x, y] = p.stand
  const group =
    id[0] === 'D'
      ? p.facing === 'east'
        ? 2
        : 3
      : id[0] === 'A' || (id[0] === 'B' && Number(id.slice(1)) <= 3)
        ? 0
        : 1
  const exit: Point =
    group === 0
      ? [x, 312]
      : group === 1
        ? [x, 738]
        : group === 2
          ? [837, y]
          : [1363, y]
  connect(p.stand, exit)
  aisles[group].push(exit)
}
aisles[0].push([837, 312])
aisles[1].push([837, 738], [1348, 738], [1363, 738])
for (const point of chatSpots.flat()) {
  const exit: Point = [point[0], 738]
  aisles[1].push(exit)
  connect(exit, point)
}
for (const point of upperWaterBays) {
  const exit: Point = [point[0], 312]
  aisles[0].push(exit)
  connect(exit, point)
}
for (const point of centralWaterBays) {
  const exit: Point = [837, point[1]]
  aisles[2].push(exit)
  connect(exit, point)
}
const approachJunction: Point = [waterEntry[0], 312]
aisles[0].push(approachJunction)
connect(approachJunction, waterEntry)
connect(waterEntry, waterService)
connect(waterService, waterExit)
aisles[2].push([837, 312], [837, 738])
aisles[3].push([1363, 738])
aisles.forEach((points, i) =>
  lane(points.sort((a, b) => a[i < 2 ? 0 : 1] - b[i < 2 ? 0 : 1])),
)
connect([1348, 738], door)
const paths = new Map<string, Point[]>()
function pathBetween(a: Point, b: Point): Point[] {
  const cacheKey = key(a) + '/' + key(b),
    saved = paths.get(cacheKey)
  if (saved) return saved
  const pending = new Set(graph.keys()),
    cost = new Map([[key(a), 0]]),
    parent = new Map<string, string>()
  while (pending.size) {
    let next = '',
      lowest = Infinity
    for (const k of pending) {
      const score = cost.get(k) ?? Infinity
      if (score < lowest) {
        next = k
        lowest = score
      }
    }
    if (!next || next === key(b)) break
    pending.delete(next)
    // The service point is a destination, not a shortcut between the two gates.
    if (next === key(waterService) && next !== key(a)) continue
    const n = graph.get(next)!
    for (const k of n.edges) {
      const newCost = lowest + distance(n.p, graph.get(k)!.p)
      if (newCost < (cost.get(k) ?? Infinity)) {
        cost.set(k, newCost)
        parent.set(k, next)
      }
    }
  }
  const path: Point[] = [b]
  let node = key(b)
  while (parent.has(node)) {
    node = parent.get(node)!
    path.unshift(graph.get(node)!.p)
  }
  paths.set(cacheKey, path)
  return path
}
type Walk = { points: Point[]; distances: number[]; length: number }
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const lerp = (a: Point, b: Point, t: number): Point => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
]
function walk(points: Point[]): Walk {
  const nodes = points.filter((p, i) => !i || distance(p, points[i - 1]) > 0.01)
  const rounded: Point[] = [nodes[0]]
  for (let i = 1; i < nodes.length - 1; i++) {
    const [a, b, c] = nodes.slice(i - 1, i + 2)
    const d1 = distance(a, b),
      d2 = distance(b, c)
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) / (d1 * d2) < 0.06) {
      rounded.push(b)
      continue
    }
    // Keep the fillet inside the lane clearance even at closely spaced junctions.
    const radius = Math.min(17, d1 / 3, d2 / 3)
    const entry = lerp(b, a, radius / d1),
      exit = lerp(b, c, radius / d2)
    for (let k = 0; k <= 6; k++) {
      const t = k / 6
      rounded.push(lerp(lerp(entry, b, t), lerp(b, exit, t), t))
    }
  }
  if (nodes.length > 1) rounded.push(nodes[nodes.length - 1])
  const distances = [0]
  for (let i = 1; i < rounded.length; i++)
    distances.push(distances[i - 1] + distance(rounded[i - 1], rounded[i]))
  return { points: rounded, distances, length: distances[distances.length - 1] }
}
// An interrupted trip starts from the character's current lane, never from a new desk.
function route(from: Point, to: Point) {
  if (graph.has(key(from))) return walk(pathBetween(from, to))
  let closest = Infinity,
    edge: [Point, Point] = [to, to],
    on: Point = to
  for (const [id, n] of graph)
    for (const k of n.edges) {
      if (k <= id) continue
      const b = graph.get(k)!.p,
        dx = b[0] - n.p[0],
        dy = b[1] - n.p[1],
        l = dx * dx + dy * dy
      if (!l) continue
      const t = Math.min(
        1,
        Math.max(0, ((from[0] - n.p[0]) * dx + (from[1] - n.p[1]) * dy) / l),
      )
      const p: Point = [n.p[0] + dx * t, n.p[1] + dy * t],
        d = distance(from, p)
      if (d < closest) {
        closest = d
        edge = [n.p, b]
        on = p
      }
    }
  const options = edge.map((end) => walk([from, on, ...pathBetween(end, to)]))
  return options[0].length <= options[1].length ? options[0] : options[1]
}
function pointAt(w: Walk, d: number): Point {
  const target = Math.min(w.length, Math.max(0, d))
  let hi = w.distances.length - 1,
    lo = 0
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (w.distances[mid] > target) hi = mid
    else lo = mid
  }
  const span = w.distances[hi] - w.distances[lo]
  return span
    ? lerp(w.points[lo], w.points[hi], (target - w.distances[lo]) / span)
    : w.points[lo]
}
const angle = (a: Point, b: Point) =>
  (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
const facingAngle: Record<Facing, number> = {
  east: 0,
  south: 90,
  west: 180,
  north: -90,
}
function facingOf(degrees: number): Facing {
  return (['east', 'south', 'west', 'north'] as const)[
    ((Math.round(degrees / 90) % 4) + 4) % 4
  ]
}
function tangent(w: Walk, d: number) {
  return angle(pointAt(w, d - 4), pointAt(w, d + 4))
}
function hash(text: string) {
  let value = 2166136261
  for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619)
  return value >>> 0
}
type Intent = {
  id: string
  action: OfficeAction
  at: number
  partnerId?: string
}
const duration: Record<OfficeAction, number> = {
  work: 10 * minute,
  slack: 14000,
  stretch: 10000,
  drink: 24000,
  restroom: 27000,
  chat: 24000,
}
// Remember the whole drinking party until the last person has had time to
// use the tap and walk back. A fresh view can reconstruct the same queue.
function waterQueue(people: OfficeSeat[], now: number) {
  const requests = people
    .filter((s) => s.lifeCue?.action === 'drink' && s.lifeCue.at <= now)
    .sort((a, b) => a.lifeCue!.at - b.lifeCue!.at)
  const batch = new Set<string>()
  let until = 0
  for (const s of requests) {
    if (s.lifeCue!.at >= until) batch.clear()
    batch.add(s.id)
    until = s.lifeCue!.at + duration.drink + (batch.size - 1) * 5300
  }
  return { batch, until }
}
const breakChoices: Record<OfficeSeat['character']['habit'], OfficeAction[]> = {
  balanced: ['drink', 'chat', 'restroom', 'drink', 'stretch'],
  focused: ['drink', 'work', 'restroom', 'chat', 'work'],
  social: ['chat', 'drink', 'chat', 'restroom', 'stretch'],
  relaxed: ['slack', 'drink', 'restroom', 'chat', 'stretch'],
}

export function intentsFor(seats: OfficeSeat[], now: number, auto: boolean) {
  const people = seats.filter(occupied).sort((a, b) => a.id.localeCompare(b.id))
  const intents = new Map<string, Intent>()
  const { batch, until } = waterQueue(people, now)
  const cueEnd = (s: OfficeSeat) =>
    batch.has(s.id)
      ? until
      : s.lifeCue
        ? s.lifeCue.at + duration[s.lifeCue.action]
        : 0
  for (const s of people) {
    intents.set(
      s.id,
      s.lifeCue && s.lifeCue.at <= now && now < cueEnd(s)
        ? s.lifeCue
        : { id: 'work-' + s.id, action: 'work', at: 0 },
    )
  }
  if (!auto || !people.length) return intents

  // One optional break per room slot. Small teams get roughly nine minutes
  // between each person's turns; a full room still spaces its breaks apart.
  const interval = Math.max(2 * minute, (9 * minute) / people.length)
  const slot = Math.floor(now / interval)
  const actor = people[slot % people.length]
  const seed = hash(actor.character.id)
  const round = Math.floor(slot / people.length)
  const at =
    slot * interval + 30000 + (hash(actor.character.id + ':' + slot) % 30000)
  const choices = breakChoices[actor.character.habit]
  let action = choices[(round + seed) % choices.length]
  if (action === 'work' || now < at || now >= at + duration[action])
    return intents

  // Select partners before considering overrides: a manual cue cancels that
  // meeting instead of pulling a different colleague into an ongoing trip.
  let partner: OfficeSeat | undefined
  if (action === 'chat') {
    if (people.length === 1) action = 'drink'
    else {
      const offset = 1 + ((round + seed) % (people.length - 1))
      partner = people[((slot % people.length) + offset) % people.length]
    }
  }
  // An automatic break missed during a manual action is skipped in full.
  const reserved = (s: OfficeSeat) =>
    !!s.lifeCue && s.lifeCue.at <= now && cueEnd(s) > at
  if (reserved(actor) || (partner && reserved(partner))) return intents
  const event = {
    id: 'auto-' + actor.character.id + '-' + at,
    action,
    at,
    partnerId: partner?.id,
  }
  intents.set(actor.id, event)
  if (partner) intents.set(partner.id, { ...event, partnerId: actor.id })
  return intents
}

export type LifePose =
  | 'typing'
  | 'rise'
  | 'walk'
  | 'sit'
  | 'reach'
  | 'fill'
  | 'sip'
  | 'phone'
  | 'pocket'
  | 'stretch'
  | 'relax'
  | 'listen'
  | 'speak'
  | 'wait'
  | 'door'
  | 'away'
export type LifeFrame = {
  p: Point
  facing: Facing
  heading: number
  action: OfficeAction
  phase: 'moving' | 'doing' | 'returning' | 'away'
  pose: LifePose
  progress: number
  stride: number
  speed: number
  seatBlend: number
  blendSeatId?: string
  label: string
  atDesk: boolean
  carryingCup?: boolean
  crossing?: 'out' | 'in'
  talk: string
  partnerId?: string
}
type Stage = {
  start: number
  end: number
  p: Point
  heading: number
  startHeading: number
  pose: LifePose
  label: string
  talk: string
  blendSeatId: string
  blendFrom: number
  blendTo: number
  phase: LifeFrame['phase']
  movement?: Walk
  carryingCup?: boolean
  crossing?: LifeFrame['crossing']
  stepOffset: number
}
const ease = (p: number) => p * p * (3 - 2 * p)

// A plan records timed poses and actual route lengths once. Sampling it never
// advances mutable animation state, so hidden tabs can resume on the same beat.
class MotionPlan {
  stages: Stage[] = []
  serviceEnd = 0
  spot = -1
  t: number
  p: Point
  blend: number
  heading: number
  stepOffset: number
  private pace: number
  private blendSeatId: string
  constructor(
    readonly seat: OfficeSeat,
    readonly intent: Intent,
    now: number,
    prior?: LifeFrame,
  ) {
    const home = positions[seat.id]
    const interrupted =
      prior && (distance(prior.p, home.stand) > 0.01 || prior.seatBlend < 0.999)
    this.t = interrupted ? now : intent.at
    this.p = interrupted ? prior.p : home.stand
    this.blend = interrupted ? prior.seatBlend : 1
    this.blendSeatId = interrupted ? prior.blendSeatId || seat.id : seat.id
    this.heading = interrupted ? prior.heading : facingAngle[home.facing]
    this.stepOffset = interrupted ? prior.stride : 0
    this.pace = 223 + (hash(seat.character.id) % 38)
  }
  hold(
    ms: number,
    pose: LifePose,
    label: string,
    heading = this.heading,
    blend = this.blend,
    talk = '',
    crossing?: LifeFrame['crossing'],
  ) {
    if (ms <= 0) return
    this.stages.push({
      start: this.t,
      end: this.t + ms,
      p: this.p,
      heading,
      startHeading: this.heading,
      pose,
      label,
      talk,
      crossing,
      blendSeatId: this.blendSeatId,
      blendFrom: this.blend,
      blendTo: blend,
      phase: pose === 'away' ? 'away' : 'doing',
      stepOffset: this.stepOffset,
    })
    this.t += ms
    this.heading = heading
    this.blend = blend
  }
  private walkTime(movement: Walk) {
    const cruise = (movement.length / this.pace) * 1000
    return cruise + Math.min(410, cruise * 0.42)
  }
  // Preserve one continuous gait through the approach/exit gates, including
  // when a new command starts partway along a lane.
  private journey(to: Point, via?: Point) {
    if (!via) return route(this.p, to)
    const first = graph.has(key(this.p))
      ? pathBetween(this.p, via)
      : route(this.p, via).points
    return walk([...first, ...pathBetween(via, to).slice(1)])
  }
  arrivalAt(to: Point, via?: Point) {
    return this.t + 690 * this.blend + this.walkTime(this.journey(to, via))
  }
  move(
    to: Point,
    phase: 'moving' | 'returning',
    label: string,
    carryingCup = false,
    via?: Point,
  ) {
    if (distance(this.p, to) < 0.01) return
    if (this.blend > 0)
      this.hold(690 * this.blend, 'rise', '起身', this.heading, 0)
    const movement = this.journey(to, via)
    const ms = this.walkTime(movement)
    this.stages.push({
      start: this.t,
      end: this.t + ms,
      p: this.p,
      heading: this.heading,
      startHeading: this.heading,
      pose: 'walk',
      label,
      talk: '',
      blendSeatId: this.blendSeatId,
      blendFrom: 0,
      blendTo: 0,
      phase,
      movement,
      carryingCup,
      stepOffset: this.stepOffset,
    })
    this.t += ms
    this.p = to
    this.heading = tangent(movement, movement.length)
    this.stepOffset = (this.stepOffset + movement.length / 57) % 1
  }
  home() {
    const home = positions[this.seat.id]
    this.move(home.stand, 'returning', '回工位')
    this.blendSeatId = this.seat.id
    this.hold(
      720 * (1 - this.blend),
      'sit',
      '坐回工位',
      facingAngle[home.facing],
      1,
    )
  }
  sample(now: number): LifeFrame {
    const stage = this.stages.find((s) => now < s.end)
    const pos = positions[this.seat.id]
    if (!stage)
      return {
        p: pos.stand,
        heading: facingAngle[pos.facing],
        facing: pos.facing,
        action: 'work',
        phase: 'doing',
        pose: 'typing',
        progress: ((now + hash(this.seat.character.id)) % 2600) / 2600,
        stride: 0,
        speed: 0,
        seatBlend: 1,
        blendSeatId: this.seat.id,
        label: '工作',
        atDesk: true,
        talk: '',
      }
    const ms = stage.end - stage.start,
      elapsed = Math.max(0, now - stage.start)
    const progress = clamp(elapsed / ms)
    let p = stage.p,
      heading = stage.heading,
      stride = stage.stepOffset,
      speed = 0
    if (stage.movement) {
      const w = stage.movement,
        ramp = Math.min(410, ms * 0.296),
        maxSpeed = w.length / (ms - ramp)
      const u = Math.min(elapsed, ms)
      const d =
        maxSpeed *
        (u < ramp
          ? (u * u) / (2 * ramp)
          : u > ms - ramp
            ? ms - ramp - (ms - u) ** 2 / (2 * ramp)
            : u - ramp / 2)
      p = pointAt(w, d)
      stride = (stage.stepOffset + d / 57) % 1
      speed = maxSpeed * 1000 * Math.min(1, u / ramp, (ms - u) / ramp)
      const target = tangent(w, d),
        delta = ((target - stage.heading + 540) % 360) - 180
      heading = stage.heading + delta * ease(clamp(u / 280))
    }
    if (!stage.movement) {
      const turn = ((stage.heading - stage.startHeading + 540) % 360) - 180
      heading =
        stage.startHeading + turn * ease(clamp(elapsed / Math.min(420, ms)))
    }
    heading = (((heading % 360) + 540) % 360) - 180
    const seatBlend = mix(stage.blendFrom, stage.blendTo, ease(progress))
    const atDesk =
      !stage.movement &&
      distance(p, positions[stage.blendSeatId].stand) < 0.01 &&
      (seatBlend > 0.001 || stage.pose === 'sit' || stage.pose === 'rise')
    return {
      p,
      heading,
      facing: atDesk ? positions[stage.blendSeatId].facing : facingOf(heading),
      action: this.intent.action,
      phase: stage.phase,
      pose: stage.pose,
      progress,
      stride,
      speed,
      seatBlend,
      blendSeatId: stage.blendSeatId,
      label: stage.label,
      atDesk,
      talk: stage.talk,
      partnerId: this.intent.partnerId,
      carryingCup: stage.carryingCup,
      crossing: stage.crossing,
    }
  }
}

function deskPlan(p: MotionPlan) {
  p.home()
  const end = p.intent.at + duration[p.intent.action]
  const span = Math.max(0, end - p.t)
  if (p.intent.action === 'slack') {
    p.hold(span * 0.12, 'reach', '拿起手机')
    p.hold(span * 0.76, 'phone', '看一会儿手机')
    p.hold(span * 0.12, 'pocket', '收起手机')
  } else if (p.intent.action === 'stretch') {
    p.hold(span * 0.65, 'stretch', '伸展肩背')
    p.hold(span * 0.35, 'relax', '放松双臂')
  }
}
function drinkPlan(p: MotionPlan, slot: number, freeAt: number) {
  p.spot = slot
  const side = waterSpots[slot]
  if (freeAt > p.arrivalAt(waterService, waterEntry)) {
    p.move(side, 'moving', '去接水')
    p.hold(
      freeAt - p.arrivalAt(waterService, waterEntry),
      'wait',
      '等饮水机',
      angle(side, waterService),
    )
  }
  p.move(waterService, 'moving', '走向饮水机', false, waterEntry)
  const tap = facingAngle.east
  p.hold(660, 'reach', '拿起水杯', tap)
  p.hold(1480, 'fill', '接水', tap)
  p.serviceEnd = p.t + 500
  p.move(side, 'moving', '让开饮水机', true, waterExit)
  p.hold(430, 'reach', '举起水杯', tap)
  p.hold(2300, 'sip', '喝水', tap)
  p.hold(650, 'relax', '放下水杯', tap)
  p.home()
}
function restroomPlan(p: MotionPlan) {
  p.move(door, 'moving', '去洗手间')
  p.hold(640, 'door', '推门离开', 90, 0, '', 'out')
  p.hold(4550, 'away', '门外 · 洗手间', 90)
  p.hold(600, 'door', '回到工作间', -90, 0, '', 'in')
  p.home()
}
const exchanges = [
  ['刚忙完？', '差不多了。', '待会见！'],
  ['休息一下？', '好呀。', '一会儿聊。'],
  ['进展如何？', '挺顺利的。', '那就好。'],
]
function chatPlan(a: MotionPlan, b: MotionPlan, slot: number) {
  a.spot = b.spot = slot
  const places = chatSpots[slot]
  a.move(places[0], 'moving', '去找同事')
  b.move(places[1], 'moving', '去找同事')
  const meet = Math.max(a.t, b.t),
    east = 0,
    west = 180
  a.hold(meet - a.t, 'wait', '等同事过来', east)
  b.hold(meet - b.t, 'wait', '等同事过来', west)
  const seed = hash(a.intent.id),
    lines = exchanges[seed % exchanges.length]
  const speakers = seed % 2 ? [a, b] : [b, a]
  for (let i = 0; i < lines.length; i++) {
    const ms = [1250, 1480, 930][i],
      gap = [450, 600, 440][i]
    for (const actor of [a, b]) {
      const heading = actor === a ? east : west
      const speaks = actor === speakers[i % 2]
      actor.hold(
        ms,
        speaks ? 'speak' : 'listen',
        speaks ? '聊天' : '听同事说话',
        heading,
        0,
        speaks ? lines[i] : '',
      )
      actor.hold(gap, 'listen', '聊天', heading)
    }
  }
  a.home()
  b.home()
}
function freeSpot(
  plans: Map<string, MotionPlan>,
  action: OfficeAction,
  capacity: number,
) {
  const used = new Set(
    [...plans.values()]
      .filter((p) => p.intent.action === action)
      .map((p) => p.spot),
  )
  for (let i = 0; i < capacity; i++) if (!used.has(i)) return i
  return 0
}
function sameIntent(
  plan: MotionPlan | undefined,
  intent: Intent,
  seat: OfficeSeat,
) {
  return (
    plan &&
    plan.intent.id === intent.id &&
    plan.intent.partnerId === intent.partnerId &&
    plan.intent.action === intent.action &&
    plan.seat.id === seat.id
  )
}

export class OfficeLifeScene {
  private plans = new Map<string, MotionPlan>()
  frames(seats: OfficeSeat[], now: number, auto: boolean) {
    const intents = intentsFor(seats, now, auto)
    const group = seats
      .filter((s) => intents.has(s.id))
      .sort(
        (a, b) =>
          intents.get(a.id)!.at - intents.get(b.id)!.at ||
          a.id.localeCompare(b.id),
      )
    const active = new Map<string, MotionPlan>(),
      bySeat = new Map(group.map((s) => [s.id, s]))
    for (const s of group) {
      const intent = intents.get(s.id)!,
        p = this.plans.get(s.character.id)
      if (sameIntent(p, intent, s)) active.set(s.character.id, p!)
    }
    const make = (s: OfficeSeat, intent: Intent) => {
      const previous = this.plans.get(s.character.id)
      const prior = previous?.sample(now)
      const p = new MotionPlan(s, intent, now, prior)
      active.set(s.character.id, p)
      return p
    }
    for (const s of group) {
      if (active.has(s.character.id)) continue
      const intent = intents.get(s.id)!,
        p = make(s, intent)
      if (intent.action === 'chat') {
        const peer = bySeat.get(intent.partnerId || '')
        if (peer && intents.get(peer.id)?.partnerId === s.id) {
          const other = make(peer, intents.get(peer.id)!)
          const slot = freeSpot(active, 'chat', chatSpots.length)
          const [left, right] = s.id < peer.id ? [p, other] : [other, p]
          chatPlan(left, right, slot)
        } else p.home()
      } else if (intent.action === 'drink') {
        const slot = freeSpot(active, 'drink', waterSpots.length)
        const freeAt = Math.max(
          0,
          ...[...active.values()].map((v) => v.serviceEnd),
        )
        drinkPlan(p, slot, freeAt)
      } else if (intent.action === 'restroom') restroomPlan(p)
      else deskPlan(p)
    }
    this.plans = active
    const frames = new Map<string, LifeFrame>()
    for (const plan of active.values())
      frames.set(plan.seat.id, plan.sample(now))
    return frames
  }
}

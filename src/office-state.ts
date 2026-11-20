import {
  days,
  relative,
  type App,
  type ChatLink,
  type Feedback,
  type Incident,
  type OfficeSeat,
  type Release,
  type Run,
  type Workspace,
} from './model'

export type SeatActivity = {
  kind:
    | 'alert'
    | 'feedback'
    | 'failed'
    | 'released'
    | 'success'
    | 'linked'
    | 'empty'
  label: string
  detail: string
}

function group<T extends { appId: string }>(items: T[]) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const existing = groups.get(item.appId)
    if (existing) existing.push(item)
    else groups.set(item.appId, [item])
  }
  return groups
}
const recentFirst = (a: { time: number }, b: { time: number }) =>
  b.time - a.time

function indexWorkspace(w: Workspace) {
  const apps = new Map(w.apps.map((a) => [a.id, a]))
  const runs = new Map<string, Run[]>()
  // Keep three observations per project for the inspector, even when events arrive out of order.
  for (const r of w.runs) {
    const recent = runs.get(r.appId)
    if (!recent) runs.set(r.appId, [r])
    else if (recent.length < 3 || r.time > recent[2].time) {
      recent.push(r)
      recent.sort(recentFirst)
      if (recent.length > 3) recent.pop()
    }
  }
  return {
    apps,
    runs,
    releases: group(w.releases),
    alerts: group(w.alerts.filter((a) => a.state !== 'resolved')),
    feedback: group(w.feedback.filter((f) => f.state !== 'resolved')),
    chats: group(w.chatLinks),
    seats: new WeakMap<OfficeSeat, SeatDetails>(),
  }
}
type SeatDetails = {
  apps: App[]
  active: App[]
  appById: Map<string, App>
  alerts: Incident[]
  feedback: Feedback[]
  releases: Release[]
  runs: Run[]
  chats: ChatLink[]
  activity: SeatActivity
}
const workspaceCache = new WeakMap<
  Workspace,
  ReturnType<typeof indexWorkspace>
>()

function summarize(
  details: Omit<SeatDetails, 'activity'>,
  now: number,
): SeatActivity {
  const { apps, active, alerts, feedback, releases, runs, appById } = details
  if (!apps.length)
    return {
      kind: 'empty',
      label: '待绑定项目',
      detail: '该工位还没有绑定项目。',
    }
  if (!active.length)
    return {
      kind: 'linked',
      label: '项目已归档',
      detail: '绑定的项目均已归档。',
    }
  if (alerts.length)
    return {
      kind: 'alert',
      label: '有未解决告警',
      detail: alerts.length + ' 条未解决告警 · ' + alerts[0].title,
    }
  if (feedback.length)
    return {
      kind: 'feedback',
      label: '反馈待跟进',
      detail: feedback.length + ' 条未解决反馈 · ' + feedback[0].title,
    }
  const run = runs[0],
    release = releases[0],
    since = now - 7 * days
  if (release && release.time >= since && (!run || release.time > run.time)) {
    const project = appById.get(release.appId)?.name || release.appId
    return {
      kind: 'released',
      label: release.github ? '发布了新版本' : '版本有更新',
      detail:
        project + ' · ' + release.version + ' · ' + relative(release.time, now),
    }
  }
  if (run && run.time >= since) {
    const failed = run.status === 'failed'
    return {
      kind: failed ? 'failed' : 'success',
      label: failed ? '最近任务失败' : '最近任务成功',
      detail: run.title + ' · ' + relative(run.time, now),
    }
  }
  const reporting = active.filter((a) => a.lastSeen != null).length
  return {
    kind: 'linked',
    label: '已绑定项目',
    detail:
      active.length +
      ' 个在用项目 · ' +
      (reporting ? reporting + ' 个曾上报心跳' : '暂无近期任务或版本记录'),
  }
}

export function getSeatDetails(seat: OfficeSeat, w: Workspace): SeatDetails {
  let index = workspaceCache.get(w)
  if (!index) {
    index = indexWorkspace(w)
    workspaceCache.set(w, index)
  }
  const previous = index.seats.get(seat)
  if (previous) return previous
  const apps: App[] = []
  for (const id of seat.appIds) {
    const app = index.apps.get(id)
    if (app) apps.push(app)
  }
  const active = apps.filter((a) => a.lifecycle === 'active')
  const ids = active.map((a) => a.id)
  const releasesFrom = new Set(
    active.map((a) =>
      a.project.form === 'module' ? a.project.parentId : a.id,
    ),
  )
  const collect = <T>(ids: Iterable<string>, groups: Map<string, T[]>) =>
    Array.from(ids).flatMap((id) => groups.get(id) || [])
  const data = {
    apps,
    active,
    appById: index.apps,
    alerts: collect(ids, index.alerts).sort(recentFirst),
    feedback: collect(ids, index.feedback).sort(recentFirst),
    releases: collect(releasesFrom, index.releases)
      .sort(recentFirst)
      .slice(0, 3),
    runs: collect(ids, index.runs).sort(recentFirst).slice(0, 3),
    chats: collect(seat.appIds, index.chats),
  }
  const result = { ...data, activity: summarize(data, w.now) }
  index.seats.set(seat, result)
  return result
}
export function getSeatActivity(seat: OfficeSeat, w: Workspace): SeatActivity {
  return getSeatDetails(seat, w).activity
}

export type Kind = 'commerce' | 'tool'
export type Health = 'healthy' | 'warning' | 'offline' | 'pending'
export type Mode = 'desktop' | 'web' | 'scheduled'
export const modeName = {
  desktop: '桌面工具',
  web: '网页工具',
  scheduled: '定时任务',
}
export type ProjectForm = 'toolbox' | 'module' | 'remote' | 'other'
export type Project = {
  form: ProjectForm
  parentId: string
  repo: string
  releaseUrl: string
  machine: string
  remoteUrl: string
  remoteNote: string
  source: 'reference' | 'demo' | 'manual'
}
export type ChatLink = {
  location: 'local' | 'remote'
  machine: string
  stationUrl: string
  id: string
  appId: string
  threadId: string
  title: string
  cwd: string
}
export type App = {
  project: Project
  mode: Mode
  lifecycle: 'active' | 'archived'
  usage: string
  id: string
  name: string
  kind: Kind
  description: string
  owner: string
  folder: string
  url: string
  icon: string
  demo: number
  lastSeen: number | null
  created: number
  timeout: number
  health: Health
}
export type Run = {
  id: string
  appId: string
  title: string
  status: 'success' | 'failed'
  time: number
  duration: number
  message: string
}
export type Incident = {
  id: string
  appId: string
  title: string
  detail: string
  level: 'error' | 'warning'
  state: 'open' | 'ack' | 'resolved'
  time: number
  cause: string
}
export type Release = {
  github?: boolean
  id: string
  appId: string
  version: string
  notes: string
  url: string
  time: number
}
export type Feedback = {
  id: string
  appId: string
  version: string
  title: string
  detail: string
  reporter: string
  state: 'open' | 'ack' | 'resolved'
  time: number
}
export type OfficeAction =
  | 'work'
  | 'drink'
  | 'restroom'
  | 'slack'
  | 'stretch'
  | 'chat'
export type OfficeCharacter = {
  id: string
  gender: 'male' | 'female' | 'unset'
  look: string
  accent: 'violet' | 'teal' | 'amber' | 'blue' | 'rose' | 'sage'
  habit: 'balanced' | 'focused' | 'social' | 'relaxed'
}
export type OfficeLifeCue = {
  id: string
  action: OfficeAction
  at: number
  partnerId: string
}
export type OfficeSeat = {
  character: OfficeCharacter
  lifeCue: OfficeLifeCue | null
  id: string
  name: string
  appIds: string[]
  example: boolean
  revision: number
}
export type Workspace = {
  officeSeats: OfficeSeat[]
  chatLinks: ChatLink[]
  releases: Release[]
  feedback: Feedback[]
  apps: App[]
  runs: Run[]
  alerts: Incident[]
  now: number
}
export type View =
  | 'overview'
  | 'office'
  | 'apps'
  | 'chats'
  | 'releases'
  | 'feedback'
  | 'monitor'
  | 'runs'
  | 'alerts'
  | 'connect'
export const kindName = { commerce: '电商自动化', tool: '团队工具' }
export const healthName = {
  healthy: '运行正常',
  warning: '运行异常',
  offline: '已离线',
  pending: '待接入',
}
export const stateName = { open: '待处理', ack: '跟进中', resolved: '已解决' }
export const viewName = {
  overview: '工作首页',
  office: '动态工作间',
  apps: '项目台账',
  chats: 'Codex 会话',
  releases: '版本发布',
  feedback: '反馈收件箱',
  monitor: '关键任务',
  runs: '运行记录',
  alerts: '告警中心',
  connect: '接入管理',
}
export const days = 86400000
export const compact = (num: number) => num.toLocaleString('en-US')
export function relative(t: number | null, now: number) {
  if (!t) return '暂无上报'
  const m = Math.max(0, Math.floor((now - t) / 60000))
  return m === 0
    ? '刚刚'
    : m < 60
      ? m + ' 分钟前'
      : m < 1440
        ? Math.floor(m / 60) + ' 小时前'
        : Math.floor(m / 1440) + ' 天前'
}
export const stamp = (t: number) =>
  new Date(t).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
export async function api<T>(path: string, data?: unknown): Promise<T> {
  const r = await fetch(
    '/api/' + path,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
  )
  const value = await r.json()
  if (!r.ok) throw Error(value.error || '请求失败')
  return value
}

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Tag,
  MessagesSquare,
  Inbox,
  ListChecks,
  Bell,
  Boxes,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  History,
  Layers3,
  LayoutDashboard,
  Armchair,
  Menu,
  Monitor,
  PanelLeft,
  PlugZap,
  Plus,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api, kindName, viewName, type View, type Workspace } from './model'
import { Empty, Trend } from './visuals'
import { ManagementHome, KeyTasks } from './management-home'
import { CatalogDialogs, type CatalogDialog } from './catalog-dialogs'
import { OfficeRoom } from './office-room'
import { ChatHub } from './chat-hub'
import { rememberChatUse, threadUrl } from './chat-links'
import { CatalogPages } from './catalog-pages'
import { Dialogs, type Dialog } from './dialogs'
import { Operations } from './operations'
import './style.css'
import './management.css'

const workNav: [View, LucideIcon][] = [
  ['overview', LayoutDashboard],
  ['apps', Boxes],
  ['chats', MessagesSquare],
  ['office', Armchair],
]
const deliveryNav: [View, LucideIcon][] = [
  ['releases', Tag],
  ['feedback', Inbox],
]
const maintenanceNav: [View, LucideIcon][] = [
  ['monitor', ListChecks],
  ['runs', History],
  ['alerts', Bell],
  ['connect', PlugZap],
]
const navItems = [...workNav, ...deliveryNav, ...maintenanceNav]
const descriptions: Record<View, string> = {
  office:
    '点击人物安排互动，点击工位查看项目。人物生活为场景演绎，工位灯对应实际项目记录。',
  overview: '',
  chats: '按项目查找开发对话，记录会话所在的电脑与远控入口。',
  releases: '查看 GitHub 正式发布、安装包入口和本地版本记录。',
  feedback: '汇总同事遇到的问题，按工具和版本跟进处理。',
  monitor: '按执行结果跟踪定时程序，查看今日产出与上次成功时间。',
  apps: '按所属工具箱、运行电脑或使用团队查找项目。',
  runs: '查看近 15 天的任务执行结果、耗时与运行详情。',
  alerts: '跟进程序异常、心跳中断和失败任务。',
  connect: '为需要集中监控的本机任务配置心跳与结果上报。',
}
function locationState() {
  const [view, query] = location.hash.slice(1).split('?')
  return {
    view: (Object.hasOwn(viewName, view) ? view : 'overview') as View,
    id: new URLSearchParams(query).get('app') || '',
    seatId: new URLSearchParams(query).get('seat') || '',
  }
}
function Sidebar({
  view,
  go,
  w,
  visible,
  close,
  online,
}: {
  view: View
  go: (v: View) => void
  w: Workspace
  visible: boolean
  close: () => void
  online: boolean
}) {
  const unresolved = w.feedback.filter((a) => a.state !== 'resolved').length
  const maintaining = maintenanceNav.some(([key]) => key === view)
  const link = ([key, Icon]: [View, LucideIcon]) => (
    <button
      key={key}
      className={'nav-link ' + (key === view ? 'active' : '')}
      aria-current={view === key ? 'page' : undefined}
      onClick={() => go(key)}
    >
      <Icon size={18} strokeWidth={1.75} />
      <span>{viewName[key]}</span>
      {key === 'feedback' && unresolved > 0 && <small>{unresolved}</small>}
    </button>
  )
  return (
    <>
      {visible && (
        <button
          className="side-backdrop"
          aria-label="关闭导航"
          onClick={close}
        />
      )}
      <aside className={'sidebar ' + (visible ? 'visible' : '')}>
        <a href="#overview" className="brand" onClick={() => go('overview')}>
          <span className="brand-mark">
            <Layers3 size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>StackPilot</strong>
            <small>开发项目工作台</small>
          </div>
        </a>
        <nav className="nav-block" aria-label="工作台导航">
          <div className="nav-heading">日常工作</div>
          {workNav.map(link)}
          <div className="nav-heading second">发布与反馈</div>
          {deliveryNav.map(link)}
          <details
            className="nav-maintenance"
            key={String(maintaining)}
            open={maintaining}
          >
            <summary>
              运行维护 <ChevronRight size={14} />
            </summary>
            {maintenanceNav.map(link)}
          </details>
        </nav>
        <div className="sidebar-bottom">
          <div className="env-card">
            <div className="env-grid" />
            <span className="local-icon">
              <Monitor size={16} />
            </span>
            <div>
              <strong>本地工作空间</strong>
              <small className={online ? undefined : 'lost'}>
                <i /> {online ? '本地服务在线' : '本地服务断开'}
              </small>
            </div>
          </div>
          <div className="profile">
            <div className="avatar">D</div>
            <div>
              <strong>开发管理员</strong>
              <small>运营部 · 维护者</small>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
function QuickSearch({
  w,
  close,
  go,
  open,
}: {
  w: Workspace
  close: () => void
  go: (v: View, id?: string) => void
  open: (d: CatalogDialog) => void
}) {
  const [q, setQ] = useState(''),
    [selected, setSelected] = useState(0)
  const [threads, setThreads] = useState<
    { threadId: string; title: string; cwd: string }[]
  >([])
  useEffect(() => {
    setThreads([])
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: q.trim(), limit: '4' })
        const response = await fetch('/api/chats?' + params, {
          signal: controller.signal,
        })
        if (response.ok) {
          const result = await response.json()
          if (!controller.signal.aborted) setThreads(result.threads)
        }
      } catch {
        if (!controller.signal.aborted) setThreads([])
      }
    }, 120)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q])
  const matches = w.apps.filter((a) =>
    [
      a.name,
      a.id,
      a.description,
      a.owner,
      a.folder,
      a.project.repo,
      a.project.machine,
      kindName[a.kind],
    ]
      .join(' ')
      .toLowerCase()
      .includes(q.trim().toLowerCase()),
  )
  const views = navItems.filter(([v]) => viewName[v].includes(q.trim()))
  const items = [
    ...matches
      .sort(
        (a, b) =>
          Number(b.name.toLowerCase().includes(q.trim().toLowerCase())) -
            Number(a.name.toLowerCase().includes(q.trim().toLowerCase())) ||
          Number(a.project.source === 'demo') -
            Number(b.project.source === 'demo'),
      )
      .slice(0, 8)
      .map((a) => ({
        key: a.id,
        label: a.name,
        sub: a.id,
        icon: Boxes,
        action: () => open({ type: 'asset', id: a.id }),
      })),
    ...w.chatLinks
      .filter((l) =>
        [l.title, l.machine, l.cwd, w.apps.find((a) => a.id === l.appId)?.name]
          .join(' ')
          .toLowerCase()
          .includes(q.trim().toLowerCase()),
      )
      .slice(0, 5)
      .map((l) => ({
        key: 'linked-' + l.id,
        label: l.title,
        sub: l.location === 'remote' ? l.machine : '本机关联',
        icon: MessagesSquare,
        action: () => {
          if (l.location === 'remote') go('chats', l.appId)
          else {
            rememberChatUse(l, 'open')
            window.location.href = threadUrl(l.threadId)
          }
        },
      })),
    ...threads.map((t) => ({
      key: 'chat-' + t.threadId,
      label: t.title,
      sub: '本机会话',
      icon: MessagesSquare,
      action: () => {
        rememberChatUse({ threadId: t.threadId }, 'open')
        window.location.href = threadUrl(t.threadId)
      },
    })),
    ...views.map(([v, icon]) => ({
      key: v,
      label: viewName[v],
      sub: '导航',
      icon,
      action: () => go(v),
    })),
  ]
  const idx = Math.min(selected, items.length - 1)
  const pick = (i: number) => {
    const item = items[i]
    if (item) {
      close()
      item.action()
    }
  }
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected=true]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [idx])
  return (
    <div
      className="search-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        className="quick-search"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelected(Math.min(items.length - 1, idx + 1))
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelected(Math.max(0, idx - 1))
          }
          if (
            e.key === 'Enter' &&
            e.target instanceof HTMLInputElement &&
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault()
            pick(idx)
          }
          if (e.key === 'Tab') {
            e.preventDefault()
            list.current?.parentElement?.querySelector('input')?.focus()
          }
        }}
      >
        <div className="qs-input">
          <Search size={20} />
          <input
            autoFocus
            placeholder="搜索项目、电脑、会话或页面…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setSelected(0)
            }}
          />
          <button onClick={close}>Esc</button>
        </div>
        <div className="qs-items" ref={list}>
          {items.map((item, i) => (
            <button
              key={item.key}
              className={i === idx ? 'chosen' : ''}
              aria-selected={i === idx}
              onClick={() => pick(i)}
            >
              <item.icon size={16} />
              <strong>{item.label}</strong>
              <small>{item.sub}</small>
            </button>
          ))}
          {!items.length && <Empty title="没有搜索结果" />}
        </div>
      </div>
    </div>
  )
}
function WorkspaceApp() {
  const [w, setW] = useState<Workspace | null>(null),
    [error, setError] = useState(''),
    [loc, setLoc] = useState(locationState),
    [dialog, setDialog] = useState<Dialog>(null),
    [catalog, setCatalog] = useState<CatalogDialog | null>(null),
    [quick, setQuick] = useState(false),
    [mobile, setMobile] = useState(false),
    [message, setMessage] = useState('')
  const requestSeq = useRef(0)
  const refresh = useCallback(async () => {
    const n = ++requestSeq.current
    try {
      const data = await api<Workspace>('workspace')
      if (n === requestSeq.current) {
        setW(data)
        setError('')
      }
    } catch (e) {
      if (n === requestSeq.current) setError((e as Error).message)
    }
  }, [])
  const notify = useCallback((m: string) => {
    setMessage(m)
  }, [])
  useEffect(() => {
    void refresh()
    const t = setInterval(() => {
      if (!document.hidden) void refresh()
    }, 30000)
    return () => clearInterval(t)
  }, [refresh])
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(''), 3500)
    return () => clearTimeout(t)
  }, [message])
  useEffect(() => {
    const f = () => {
      setLoc(locationState())
      setMobile(false)
      setQuick(false)
      setDialog(null)
      setCatalog(null)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (!dialog && !catalog) setQuick((p) => !p)
      }
      if (e.key === 'Escape') setMobile(false)
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [dialog, catalog])
  function go(view: View, id = '') {
    const next = '#' + view + (id ? '?app=' + encodeURIComponent(id) : '')
    setDialog(null)
    setCatalog(null)
    setMobile(false)
    setQuick(false)
    if (location.hash !== next) location.hash = next
  }
  const { view } = loc
  useEffect(() => {
    document.title = viewName[view] + ' · StackPilot'
  }, [view])
  if (!w)
    return (
      <div className="boot">
        <img src="/mark.svg" width="46" />
        <h2>StackPilot</h2>
        <p>{error || '正在载入本地工作空间…'}</p>
        {error && (
          <button className="primary" onClick={() => void refresh()}>
            重新连接
          </button>
        )}
      </div>
    )
  return (
    <>
      <Sidebar
        w={w}
        view={view}
        go={go}
        visible={mobile}
        online={!error}
        close={() => setMobile(false)}
      />
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <PanelLeft className="bread-panel" size={16} />
            <span>工作空间</span>
            <ChevronRight size={12} />
            <b>{viewName[view]}</b>
          </div>
          <div className="top-actions">
            <button className="global-search" onClick={() => setQuick(true)}>
              <Search size={15} />
              <span>快速搜索</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="top-sep" />
            <button
              className="bell-btn"
              aria-label="查看未解决反馈"
              onClick={() => go('feedback')}
            >
              <Bell size={18} />
              {w.feedback.some((a) => a.state === 'open') && <i />}
            </button>
          </div>
        </header>
        <main>
          <div className="page-head">
            <div>
              <div className="title-line">
                <h1>{viewName[view]}</h1>
                {w.apps.some((a) => a.demo === 1) && (
                  <span className="demo-badge">
                    <i />
                    含示例项目
                  </span>
                )}
              </div>
              {descriptions[view] && <p>{descriptions[view]}</p>}
            </div>
            <div className="page-actions">
              <span className="date-label">
                <CalendarDays size={14} />
                {new Date(w.now).toLocaleDateString('zh-CN', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                })}
              </span>
              {(
                [
                  'overview',
                  'apps',
                  'connect',
                  'releases',
                  'feedback',
                ] as View[]
              ).includes(view) && (
                <button
                  className="primary"
                  onClick={() =>
                    view === 'releases'
                      ? setCatalog({ type: 'release-new', id: '' })
                      : view === 'feedback'
                        ? setCatalog({ type: 'feedback-new', id: '' })
                        : setDialog({ type: 'register' })
                  }
                >
                  <Plus size={16} />
                  {view === 'releases'
                    ? '登记本地版本'
                    : view === 'feedback'
                      ? '记录反馈'
                      : '登记项目'}
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="connection-error">
              连接中断，当前显示最近获取的数据。
              <button onClick={() => void refresh()}>重新连接</button>
            </div>
          )}
          {view === 'overview' ? (
            <ManagementHome
              w={w}
              open={setCatalog}
              go={go}
              legacy={setDialog}
            />
          ) : view === 'office' ? (
            <OfficeRoom
              key={loc.id + '-' + loc.seatId}
              seatId={loc.seatId}
              appId={loc.id}
              w={w}
              go={go}
              open={setCatalog}
              legacy={setDialog}
              refresh={refresh}
              notify={notify}
            />
          ) : view === 'chats' ? (
            <ChatHub w={w} appId={loc.id} go={go} refresh={refresh} />
          ) : view === 'apps' || view === 'releases' || view === 'feedback' ? (
            <CatalogPages
              key={view}
              go={go}
              view={view}
              w={w}
              open={setCatalog}
              register={() => setDialog({ type: 'register' })}
            />
          ) : view === 'monitor' ? (
            <KeyTasks w={w} open={setCatalog} go={go} legacy={setDialog} />
          ) : (
            <>
              {view === 'runs' && !loc.id && (
                <div className="runs-trend">
                  <Trend w={w} />
                </div>
              )}
              <Operations
                key={view}
                view={view}
                w={w}
                appId={loc.id}
                setAppId={(id) => go(view, id)}
                open={setDialog}
                go={go}
              />
            </>
          )}
        </main>
      </div>
      <CatalogDialogs
        go={go}
        dialog={catalog}
        setDialog={setCatalog}
        w={w}
        refresh={refresh}
        notify={notify}
        advanced={(d) => {
          setCatalog(null)
          setDialog(d)
        }}
      />
      <Dialogs
        openAsset={(id) => {
          setDialog(null)
          setCatalog({ type: 'asset', id })
        }}
        dialog={dialog}
        setDialog={setDialog}
        w={w}
        refresh={refresh}
        go={go}
        notify={notify}
      />
      {quick && (
        <QuickSearch
          w={w}
          close={() => setQuick(false)}
          go={go}
          open={setCatalog}
        />
      )}
      {message && (
        <div role="status" className="toast">
          <CircleCheck size={17} />
          {message}
          <button onClick={() => setMessage('')} aria-label="关闭提示">
            <X size={13} />
          </button>
        </div>
      )}
    </>
  )
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceApp />
  </React.StrictMode>,
)

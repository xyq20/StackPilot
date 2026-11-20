import { useState } from 'react'
import {
  ArrowRight,
  Armchair,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  Clock3,
  FolderSearch,
  ListTodo,
  Monitor,
  Search,
  TerminalSquare,
  X,
} from 'lucide-react'
import { stamp, type ProjectForm, type View, type Workspace } from './model'
import { Empty, ProgramIcon } from './visuals'
import { formNames } from './project-info'
import type { CatalogDialog } from './catalog-dialogs'
import type { Dialog } from './dialogs'
import { HomeResume } from './home-resume'
import { HomeFollowup } from './home-followup'

type HomeProps = {
  w: Workspace
  open: (dialog: CatalogDialog) => void
  go: (view: View, id?: string) => void
}

function SectionHeading({
  title,
  action,
  onClick,
}: {
  title: string
  action: string
  onClick: () => void
}) {
  return (
    <div className="mh-section-head">
      <h2>{title}</h2>
      <button className="mh-link" onClick={onClick}>
        {action}
        <ArrowRight size={13} />
      </button>
    </div>
  )
}
function ToolFinder({ w, go, open }: HomeProps) {
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<ProjectForm | ''>('')
  const [limit, setLimit] = useState(5)
  const term = query.trim().toLocaleLowerCase()
  const byId = new Map(w.apps.map((app) => [app.id, app]))
  const rows = w.apps
    .filter(
      (app) =>
        app.lifecycle === 'active' && (!form || app.project.form === form),
    )
    .map((app) => {
      const parent = byId.get(app.project.parentId)
      const people = w.officeSeats
        .filter((s) => s.appIds.includes(app.id))
        .flatMap((s) => (s.name ? [s.name, s.id] : [s.id]))
      const stations = w.chatLinks
        .filter((c) => c.appId === app.id && c.location === 'remote')
        .map((c) => c.machine)
      const searchable = [
        app.name,
        app.id,
        app.description,
        app.owner,
        parent?.name,
        app.project.machine,
        app.project.repo,
        ...people,
        ...stations,
      ]
      const location =
        parent?.name || app.project.machine || formNames[app.project.form]
      const matched =
        term &&
        [...people, ...stations].find((s) =>
          s.toLocaleLowerCase().includes(term),
        )
      return {
        app,
        searchable,
        detail: [
          ...new Set([location, app.owner, matched].filter(Boolean)),
        ].join(' · '),
      }
    })
    .filter(
      (row) =>
        !term ||
        row.searchable.some((s) => s?.toLocaleLowerCase().includes(term)),
    )
    .sort(
      (a, b) =>
        Number(b.app.name.toLocaleLowerCase().includes(term)) -
          Number(a.app.name.toLocaleLowerCase().includes(term)) ||
        Number(a.app.project.source === 'demo') -
          Number(b.app.project.source === 'demo') ||
        Number(b.app.project.source === 'manual') -
          Number(a.app.project.source === 'manual'),
    )

  return (
    <section className="finder-panel" aria-labelledby="finder-title">
      <header className="finder-head">
        <h2 id="finder-title">
          <FolderSearch size={20} />
          查找部门工具
        </h2>
        <button className="finder-link" onClick={() => go('apps')}>
          项目台账 <ArrowRight size={14} />
        </button>
      </header>
      <div className="finder-controls">
        <div className="finder-search">
          <Search size={17} />
          <input
            type="text"
            aria-label="搜索部门工具"
            placeholder="搜工具名、同事或电脑"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(5)
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="清空工具搜索"
              onClick={() => {
                setQuery('')
                setLimit(5)
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          aria-label="工具类型"
          value={form}
          onChange={(e) => {
            setForm(e.target.value as ProjectForm | '')
            setLimit(5)
          }}
        >
          <option value="">全部类型</option>
          {Object.entries(formNames).map(([key, name]) => (
            <option key={key} value={key}>
              {key === 'module' ? '工具箱子工具' : name}
            </option>
          ))}
        </select>
      </div>
      <ul className="finder-list">
        {rows.slice(0, limit).map(({ app, detail }) => (
          <li key={app.id}>
            <button
              className="finder-result"
              onClick={() => open({ type: 'asset', id: app.id })}
            >
              <ProgramIcon app={app} />
              <span>
                <strong>
                  {app.name}
                  {app.project.source === 'demo' && <small>示例</small>}
                </strong>
                <span>{detail}</span>
              </span>
              <ChevronRight size={15} />
            </button>
            {app.project.form === 'remote' && app.project.remoteUrl && (
              <a
                className="finder-remote"
                href={app.project.remoteUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={'远控 ' + app.name}
              >
                <Monitor size={14} />
                远控
              </a>
            )}
          </li>
        ))}
      </ul>
      {!rows.length && (
        <Empty
          title={term || form ? '没有找到匹配的工具' : '还没有在用的工具'}
          detail={
            term || form
              ? '换个关键词，或选择其他类型。'
              : '点击「登记项目」添加第一个工具。'
          }
        />
      )}
      <footer className="finder-foot">
        <span role="status">
          {term || form ? '找到 ' : '在用工具 '}
          {rows.length} 个
        </span>
        {rows.length > limit && (
          <button onClick={() => setLimit(limit + 5)}>
            显示更多 <ChevronRight size={12} />
          </button>
        )}
        <button onClick={() => go('office')}>
          <Armchair size={13} />
          按工位找
        </button>
      </footer>
    </section>
  )
}

const homeTasks = [
  { id: 'resume', label: '继续开发', icon: TerminalSquare },
  { id: 'tools', label: '查找工具', icon: FolderSearch },
  { id: 'issues', label: '跟进问题', icon: ListTodo },
] as const

export function ManagementHome({
  w,
  open,
  go,
  legacy,
}: HomeProps & { legacy: (dialog: NonNullable<Dialog>) => void }) {
  const [task, setTask] = useState<(typeof homeTasks)[number]['id']>('resume')
  return (
    <div className="work-home" data-task={task}>
      <div className="home-task-switch" role="group" aria-label="选择首页任务">
        {homeTasks.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={id === task}
            aria-controls={'home-' + id}
            onClick={() => setTask(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      <div id="home-resume">
        <HomeResume w={w} go={go} />
      </div>
      <div className="home-worklist">
        <div id="home-tools">
          <ToolFinder w={w} go={go} open={open} />
        </div>
        <div id="home-issues">
          <HomeFollowup w={w} open={open} legacy={legacy} />
        </div>
      </div>
    </div>
  )
}

export function KeyTasks({
  w,
  go,
  open,
  legacy,
}: {
  w: Workspace
  go: HomeProps['go']
  open: HomeProps['open']
  legacy: (d: NonNullable<Dialog>) => void
}) {
  const start = new Date(w.now)
  start.setHours(0, 0, 0, 0)
  const tasks = w.apps.filter(
    (a) => a.mode === 'scheduled' && a.lifecycle === 'active',
  )
  const rows = tasks.map((a) => {
    const runs = w.runs.filter((r) => r.appId === a.id)
    return {
      app: a,
      latest: runs[0],
      lastSuccess: runs.find((r) => r.status === 'success'),
      today: runs.filter((r) => r.time >= start.getTime()),
    }
  })
  return (
    <section className="mh-panel mh-task-panel">
      <SectionHeading
        title="自动化执行结果"
        action="全部运行记录"
        onClick={() => go('runs')}
      />
      <div className="mh-task-summary">
        <span>
          <CalendarClock size={15} />
          {tasks.length} 个定时程序
        </span>
        <span>
          <CircleCheck size={15} />
          {
            rows.filter((r) => r.today.some((t) => t.status === 'success'))
              .length
          }{' '}
          个今日有成功记录
        </span>
        <span>
          <Clock3 size={15} />
          {rows.filter((r) => !r.today.length).length} 个今日暂无记录
        </span>
      </div>
      <div className="table-scroll">
        <table className="program-table">
          <thead>
            <tr>
              <th>定时任务</th>
              <th>使用团队</th>
              <th>最近执行</th>
              <th>今日执行</th>
              <th>上次成功时间</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ app, latest, lastSuccess, today }) => (
              <tr key={app.id}>
                <td>
                  <button
                    className="program-button"
                    onClick={() => open({ type: 'asset', id: app.id })}
                  >
                    <div className="app-name">
                      <ProgramIcon app={app} />
                      <div>
                        <strong>{app.name}</strong>
                        <small>{app.id}</small>
                      </div>
                    </div>
                  </button>
                </td>
                <td>{app.owner || '—'}</td>
                <td>
                  {latest ? (
                    <button
                      className={
                        'status ' +
                        (latest.status === 'success' ? 'healthy' : 'warning')
                      }
                      onClick={() => legacy({ type: 'run', id: latest.id })}
                    >
                      <i />
                      {latest.status === 'success' ? '成功' : '失败'}
                      <ChevronRight size={10} />
                    </button>
                  ) : (
                    <span>尚无上报</span>
                  )}
                </td>
                <td>{today.length} 次</td>
                <td>{lastSuccess ? stamp(lastSuccess.time) : '暂无记录'}</td>
                <td>
                  <button
                    className="mh-link"
                    onClick={() => go('runs', app.id)}
                  >
                    运行记录 <ArrowRight size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <Empty
          title="还没有定时程序"
          detail="将工具的运行方式设为定时任务，即可在这里跟踪上报结果。"
        />
      )}
    </section>
  )
}

import { useMemo, useState } from 'react'
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  ListTodo,
  MessageSquare,
  Plus,
} from 'lucide-react'
import type { CatalogDialog } from './catalog-dialogs'
import type { Dialog } from './dialogs'
import {
  relative,
  stamp,
  stateName,
  type Feedback,
  type Incident,
  type Workspace,
} from './model'
import './home-followup.css'

type Source = 'feedback' | 'alert'
type Scope = 'all' | Source
type Props = {
  w: Workspace
  open: (dialog: CatalogDialog) => void
  legacy: (dialog: NonNullable<Dialog>) => void
}
type Issue = {
  record: Feedback | Incident
  source: Source
  project: string
  demo: boolean
  critical: boolean
}
const filters: { value: Scope; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'feedback', label: '同事反馈' },
  { value: 'alert', label: '程序告警' },
]
const previewSize = 4
const pageSize = 8

export function HomeFollowup({ w, open, legacy }: Props) {
  const [scope, setScope] = useState<Scope>('all')
  const [expanded, setExpanded] = useState(false)
  const [requestedPage, setPage] = useState(1)
  const issues = useMemo(() => {
    const apps = new Map(w.apps.map((app) => [app.id, app]))
    const rows: Issue[] = []
    function add(
      record: Feedback | Incident,
      source: Source,
      critical: boolean,
    ) {
      if (record.state === 'resolved') return
      const app = apps.get(record.appId)
      rows.push({
        record,
        source,
        critical,
        project: app?.name || record.appId,
        demo: app?.project.source === 'demo' || Boolean(app?.demo),
      })
    }
    for (const f of w.feedback) add(f, 'feedback', false)
    for (const a of w.alerts) add(a, 'alert', a.level === 'error')
    return rows.sort(
      (a, b) =>
        Number(a.demo) - Number(b.demo) ||
        Number(b.critical) - Number(a.critical) ||
        Number(a.record.state === 'ack') - Number(b.record.state === 'ack') ||
        b.record.time - a.record.time,
    )
  }, [w.apps, w.feedback, w.alerts])
  const counts = { all: issues.length, feedback: 0, alert: 0 }
  for (const issue of issues) counts[issue.source]++
  const matches =
    scope === 'all' ? issues : issues.filter((issue) => issue.source === scope)
  const pages = Math.max(1, Math.ceil(matches.length / pageSize))
  const page = Math.min(requestedPage, pages)
  const showingAll = expanded && matches.length > previewSize
  const visible = showingAll
    ? matches.slice((page - 1) * pageSize, page * pageSize)
    : matches.slice(0, previewSize)
  function filter(value: Scope) {
    setScope(value)
    setPage(1)
    setExpanded(false)
  }
  const waiting = matches.filter(
    (issue) => issue.record.state === 'open',
  ).length
  return (
    <section className="followup-panel" aria-labelledby="followup-title">
      <header className="followup-head">
        <h2 id="followup-title">
          <ListTodo size={19} />
          处理待跟进问题
        </h2>
        <button
          type="button"
          className="mh-link"
          onClick={() =>
            open({ type: 'feedback-new', id: '', closeOnSave: true })
          }
        >
          <Plus size={13} />
          记录反馈
        </button>
      </header>
      <div className="followup-filters" role="group" aria-label="问题来源">
        {filters.map(({ value, label }) => (
          <button
            type="button"
            key={value}
            aria-pressed={scope === value}
            onClick={() => filter(value)}
          >
            {label}
            <small>{counts[value]}</small>
          </button>
        ))}
      </div>
      {visible.length ? (
        <ul className="followup-list">
          {visible.map(({ record, source, project, demo, critical }) => {
            const label =
              source === 'feedback' ? '反馈' : critical ? '严重告警' : '告警'
            const Icon =
              source === 'feedback'
                ? MessageSquare
                : critical
                  ? CircleAlert
                  : Bell
            return (
              <li key={source + ':' + record.id}>
                <button
                  type="button"
                  className="followup-row"
                  title={label + ' · ' + record.title}
                  onClick={() =>
                    source === 'feedback'
                      ? open({ type: 'feedback-detail', id: record.id })
                      : legacy({ type: 'incident', id: record.id })
                  }
                >
                  <span
                    className={
                      'followup-icon ' + (critical ? 'critical' : source)
                    }
                  >
                    <Icon size={16} />
                  </span>
                  <span className="followup-copy">
                    <span className="followup-row-title">
                      <strong>{record.title}</strong>
                      {demo && <small className="followup-demo">示例</small>}
                    </span>
                    <span className="followup-meta">
                      <span className="followup-project">
                        {label} · {project}
                      </span>
                      <span
                        className="followup-time"
                        title={stamp(record.time)}
                      >
                        {' '}
                        · {relative(record.time, w.now)}
                      </span>
                    </span>
                  </span>
                  <span className={'followup-state ' + record.state}>
                    {stateName[record.state]}
                  </span>
                  <ChevronRight size={13} className="followup-arrow" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="followup-empty" role="status">
          <CheckCheck size={23} />
          <strong>
            {scope === 'all'
              ? '当前没有待跟进问题'
              : scope === 'feedback'
                ? '暂无未解决的同事反馈'
                : '暂无未解决的程序告警'}
          </strong>
          {scope !== 'all' && counts.all > 0 && (
            <button onClick={() => filter('all')}>
              查看全部来源
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}
      {!!visible.length && (
        <footer className="followup-foot">
          <span role="status">
            {waiting} 待处理 · {matches.length - waiting} 跟进中
          </span>
          {showingAll && pages > 1 && (
            <div className="followup-pager" aria-label="问题列表分页">
              <button
                aria-label="上一页问题"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <span>
                {page}/{pages}
              </span>
              <button
                aria-label="下一页问题"
                disabled={page === pages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          {matches.length > previewSize && (
            <button
              type="button"
              className="followup-expand"
              aria-expanded={showingAll}
              onClick={() => {
                setExpanded(!showingAll)
                setPage(1)
              }}
            >
              {showingAll ? '收起' : '查看全部'}
              {showingAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </footer>
      )}
    </section>
  )
}

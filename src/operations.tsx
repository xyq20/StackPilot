import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  BellRing,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleX,
  Clock3,
  Code2,
  FileClock,
  FolderInput,
  MonitorCheck,
  Radio,
  Search,
  X,
} from 'lucide-react'
import type { Dialog } from './dialogs'
import {
  compact,
  days,
  kindName,
  relative,
  stamp,
  stateName,
  type App,
  type Incident,
  type Run,
  type View,
  type Workspace,
} from './model'
import { AppName, Empty } from './visuals'
import './operations.css'

type Props = {
  view: View
  w: Workspace
  appId: string
  setAppId: (id: string) => void
  open: (d: NonNullable<Dialog>) => void
  go: (v: View, id?: string) => void
}

const pageSize = 10
const normalized = (s: string) => s.toLocaleLowerCase().trim()
function match(q: string, ...parts: string[]) {
  return !q || parts.some((s) => normalized(s).includes(q))
}

function Selector({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="op-select">
      <span className="op-sr">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <ChevronDown size={13} aria-hidden="true" />
    </label>
  )
}

function Query({
  value,
  onChange,
  hint,
}: {
  value: string
  onChange: (v: string) => void
  hint: string
}) {
  return (
    <div className="op-query">
      <Search size={15} aria-hidden="true" />
      <input
        value={value}
        type="text"
        aria-label={hint}
        placeholder={hint}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="清空搜索"
          onClick={() => onChange('')}
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

function Pagination({
  count,
  page,
  setPage,
}: {
  count: number
  page: number
  setPage: (n: number) => void
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  return (
    <div className="op-pagination">
      <span>
        共 <strong>{compact(count)}</strong> 条
        {count > 0 && (
          <span className="op-range">
            {' '}
            · 当前显示 {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, count)} 条
          </span>
        )}
      </span>
      <div>
        <button
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span aria-live="polite">
          {page} / {pages}
        </span>
        <button
          aria-label="下一页"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

function durationText(ms: number) {
  if (ms < 1000) return ms + ' ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + ' 秒'
  return (
    Math.floor(ms / 60000) + ' 分 ' + Math.floor((ms % 60000) / 1000) + ' 秒'
  )
}

function RunRow({
  run,
  app,
  open,
}: {
  run: Run
  app?: App
  open: Props['open']
}) {
  const failed = run.status === 'failed'
  return (
    <tr>
      <td>
        <button
          className="op-name"
          onClick={() => open({ type: 'run', id: run.id })}
        >
          <FileClock size={15} />
          {run.title}
        </button>
      </td>
      <td>
        <button
          className="op-app-link"
          onClick={() => open({ type: 'detail', id: run.appId })}
        >
          {app?.name || run.appId}
        </button>
      </td>
      <td>
        <span className={'op-chip ' + (failed ? 'op-error' : 'op-success')}>
          {failed ? <CircleX /> : <CircleCheck />}
          {failed ? '执行失败' : '执行成功'}
        </span>
      </td>
      <td className="op-num">{durationText(run.duration)}</td>
      <td className="op-num">{stamp(run.time)}</td>
      <td>
        <button
          className="op-link"
          onClick={() => open({ type: 'run', id: run.id })}
        >
          详情
          <ChevronRight size={13} />
        </button>
      </td>
    </tr>
  )
}

function IncidentRow({
  a,
  app,
  open,
}: {
  a: Incident
  app?: App
  open: Props['open']
}) {
  return (
    <tr>
      <td>
        <button
          className="op-name"
          onClick={() => open({ type: 'incident', id: a.id })}
        >
          <BellRing size={15} />
          {a.title}
        </button>
      </td>
      <td>
        <button
          className="op-app-link"
          onClick={() => open({ type: 'detail', id: a.appId })}
        >
          {app?.name || a.appId}
        </button>
      </td>
      <td>
        <span
          className={
            'op-chip ' + (a.level === 'error' ? 'op-error' : 'op-warning')
          }
        >
          <CircleAlert />
          {a.level === 'error' ? '严重' : '警告'}
        </span>
      </td>
      <td>
        <span
          className={
            'op-chip ' +
            { open: 'op-warning', ack: 'op-info', resolved: 'op-neutral' }[
              a.state
            ]
          }
        >
          {a.state === 'resolved' ? (
            <Check />
          ) : a.state === 'open' ? (
            <CircleDot />
          ) : (
            <Clock3 />
          )}
          {stateName[a.state]}
        </span>
      </td>
      <td className="op-num">{stamp(a.time)}</td>
      <td>
        <button
          className="op-link"
          onClick={() => open({ type: 'incident', id: a.id })}
        >
          {a.state === 'resolved' ? '详情' : '跟进'}
          <ChevronRight size={13} />
        </button>
      </td>
    </tr>
  )
}

function ConnectRow({
  a,
  now,
  open,
}: {
  a: App
  now: number
  open: Props['open']
}) {
  const mode = a.demo ? '模拟上报' : a.lastSeen ? '已接入' : '待接入'
  return (
    <tr>
      <td>
        <button
          className="op-app-identity"
          onClick={() => open({ type: 'detail', id: a.id })}
        >
          <AppName app={a} />
        </button>
      </td>
      <td>{kindName[a.kind]}</td>
      <td>
        <span
          className={
            'op-chip ' +
            (a.demo ? 'op-info' : a.lastSeen ? 'op-success' : 'op-neutral')
          }
        >
          <Radio />
          {mode}
        </span>
      </td>
      <td title={a.folder || undefined} className="op-path">
        {a.folder || (a.demo ? '示例程序' : '未登记目录')}
      </td>
      <td className="op-num">{relative(a.lastSeen, now)}</td>
      <td>
        <button
          className="op-link"
          onClick={() => open({ type: a.demo ? 'detail' : 'guide', id: a.id })}
        >
          {a.demo ? '详情' : '接入指引'}
          <ChevronRight size={13} />
        </button>
      </td>
    </tr>
  )
}

function ConnectSteps() {
  return (
    <section className="op-steps panel" aria-label="本机接入流程">
      <div className="op-step">
        <span>
          <FolderInput />
        </span>
        <div>
          <h3>登记定时程序</h3>
          <p>在工具台账登记需要监控的定时任务。</p>
        </div>
      </div>
      <ChevronRight className="op-step-chevron" size={17} />
      <div className="op-step">
        <span>
          <Code2 />
        </span>
        <div>
          <h3>配置上报</h3>
          <p>在运行详情中生成密钥，配置程序定时上报。</p>
        </div>
      </div>
      <ChevronRight className="op-step-chevron" size={17} />
      <div className="op-step">
        <span>
          <MonitorCheck />
        </span>
        <div>
          <h3>查看运行状态</h3>
          <p>在关键任务中查看最近成功时间和执行结果。</p>
        </div>
      </div>
    </section>
  )
}

function OperationsContent({ view, w, appId, setAppId, open }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [period, setPeriod] = useState('15')
  const [level, setLevel] = useState('')
  const [requestedPage, setPage] = useState(1)
  const labelId = useId()
  const runView = view === 'runs'
  const alertView = view === 'alerts'
  const connectView = view === 'connect'
  const apps = useMemo(() => new Map(w.apps.map((a) => [a.id, a])), [w.apps])
  const selectedId = apps.has(appId) ? appId : ''
  const q = normalized(query)
  const rows = useMemo(() => {
    const appMatches = (id: string) => !selectedId || id === selectedId
    if (runView)
      return w.runs.filter(
        (r) =>
          appMatches(r.appId) &&
          (!status || r.status === status) &&
          r.time >= w.now - Number(period) * days &&
          match(
            q,
            r.title,
            r.id,
            r.appId,
            apps.get(r.appId)?.name || '',
            r.message,
          ),
      )
    if (alertView)
      return w.alerts.filter(
        (a) =>
          appMatches(a.appId) &&
          (!status || a.state === status) &&
          (!level || a.level === level) &&
          match(q, a.title, a.detail, a.appId, apps.get(a.appId)?.name || ''),
      )
    return w.apps.filter(
      (a) =>
        (a.mode === 'scheduled' || (!a.demo && a.lastSeen)) &&
        appMatches(a.id) &&
        (!status ||
          (status === 'demo'
            ? a.demo
            : status === 'connected'
              ? !a.demo && a.lastSeen
              : !a.demo && !a.lastSeen)) &&
        match(q, a.id, a.name, a.folder, a.owner),
    )
  }, [w, apps, q, selectedId, runView, alertView, level, period, status])
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(rows.length / pageSize)),
  )
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)
  const change = (setter: (s: string) => void) => (s: string) => {
    setter(s)
    setPage(1)
  }
  const tabItems = runView
    ? [
        ['', '全部记录'],
        ['success', '执行成功'],
        ['failed', '执行失败'],
      ]
    : alertView
      ? [
          ['', '全部告警'],
          ['open', '待处理'],
          ['ack', '跟进中'],
          ['resolved', '已解决'],
        ]
      : [
          ['', '全部程序'],
          ['pending', '待接入'],
          ['connected', '已接入'],
          ['demo', '示例程序'],
        ]
  const columns = runView
    ? ['任务名称', '所属程序', '执行结果', '耗时', '上报时间', '操作']
    : alertView
      ? ['告警事件', '所属程序', '级别', '处理状态', '触发时间', '操作']
      : ['程序名称', '类型', '接入状态', '本机目录', '最近心跳', '操作']
  const heading = runView ? '任务明细' : alertView ? '告警事件' : '程序接入状态'
  return (
    <div className="op-body">
      {connectView && <ConnectSteps />}
      <section className="panel op-panel" aria-labelledby={labelId}>
        <header className="op-panel-header">
          <h2 id={labelId}>{heading}</h2>
          <span className="op-source">
            {runView ? <Clock3 /> : alertView ? <BellRing /> : <Activity />}
            {runView
              ? '最近 15 天'
              : alertView
                ? '全部处理状态'
                : '本机工作空间'}
          </span>
        </header>
        <div className="op-tools">
          <div className="op-tabs" role="group" aria-label="状态筛选">
            {tabItems.map(([value, name]) => (
              <button
                type="button"
                key={value}
                aria-pressed={status === value}
                onClick={() => change(setStatus)(value)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="op-filters">
            <Query
              value={query}
              onChange={change(setQuery)}
              hint={
                runView
                  ? '搜索任务或程序'
                  : alertView
                    ? '搜索告警或程序'
                    : '搜索程序或目录'
              }
            />
            {(!connectView || selectedId) && (
              <Selector
                label="所属程序"
                value={selectedId}
                onChange={change(setAppId)}
              >
                <option value="">全部程序</option>
                {w.apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Selector>
            )}
            {runView && (
              <Selector
                label="时间范围"
                value={period}
                onChange={change(setPeriod)}
              >
                <option value="15">近 15 天</option>
                <option value="7">近 7 天</option>
                <option value="1">近 24 小时</option>
              </Selector>
            )}
            {alertView && (
              <Selector
                label="告警级别"
                value={level}
                onChange={change(setLevel)}
              >
                <option value="">全部级别</option>
                <option value="error">严重</option>
                <option value="warning">警告</option>
              </Selector>
            )}
          </div>
        </div>
        {pageRows.length ? (
          <div className="op-scroll">
            <table className="op-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th scope="col" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((item) =>
                  'duration' in item ? (
                    <RunRow
                      key={item.id}
                      run={item}
                      app={apps.get(item.appId)}
                      open={open}
                    />
                  ) : 'level' in item ? (
                    <IncidentRow
                      key={item.id}
                      a={item}
                      app={apps.get(item.appId)}
                      open={open}
                    />
                  ) : (
                    <ConnectRow
                      key={item.id}
                      a={item}
                      now={w.now}
                      open={open}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              runView
                ? '暂无匹配任务'
                : alertView
                  ? '暂无匹配告警'
                  : '暂无匹配程序'
            }
          />
        )}
        <Pagination count={rows.length} page={page} setPage={setPage} />
      </section>
    </div>
  )
}

export function Operations(props: Props) {
  return <OperationsContent key={props.view} {...props} />
}

import { useMemo, useState, type ReactNode } from 'react'
import {
  Archive,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Flag,
  Globe2,
  ListFilter,
  MessageSquare,
  Monitor,
  PackageOpen,
  Search,
  Tag,
  Timer,
  X,
} from 'lucide-react'
import type { CatalogDialog } from './catalog-dialogs'
import {
  kindName,
  modeName,
  stateName,
  type App,
  type ChatLink,
  type Feedback,
  type Release,
  type Workspace,
  type View,
} from './model'
import { ProgramIcon } from './visuals'
import { formNames, releaseOwner, sourceLabels } from './project-info'
import './catalog-pages.css'

type Page = 'apps' | 'releases' | 'feedback'
type Props = {
  view: Page
  w: Workspace
  open: (d: CatalogDialog) => void
  go: (view: View, id?: string) => void
  register: () => void
}
const modeIcons = { desktop: Monitor, web: Globe2, scheduled: Timer }
const sourceRank = { manual: 0, reference: 1, demo: 2 }
const pageSize = 10
const date = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
function search(term: string, ...fields: string[]) {
  const q = term.trim().toLowerCase()
  return !q || fields.some((field) => field.toLowerCase().includes(q))
}
function Mode({ app }: { app: App }) {
  const Icon = modeIcons[app.mode]
  return (
    <span className="cat-mode">
      <Icon size={14} />
      {modeName[app.mode]}
    </span>
  )
}
function Tool({
  app,
  display,
  open,
}: {
  app: App
  display?: string
  open: Props['open']
}) {
  return (
    <button
      className="cat-tool"
      type="button"
      onClick={() => open({ type: 'asset', id: app.id })}
    >
      <ProgramIcon app={app} />
      <span>
        <strong>{app.name}</strong>
        {display && <small title={display}>{display}</small>}
      </span>
    </button>
  )
}
function SearchInput({
  term,
  change,
  label,
}: {
  term: string
  change: (t: string) => void
  label: string
}) {
  return (
    <div className="cat-search">
      <Search size={15} />
      <input
        aria-label={label}
        placeholder={label}
        value={term}
        onChange={(e) => change(e.target.value)}
      />
      {term && (
        <button aria-label="清空搜索" onClick={() => change('')}>
          <X size={13} />
        </button>
      )}
    </div>
  )
}
function Select({
  label,
  value,
  change,
  children,
}: {
  label: string
  value: string
  change: (v: string) => void
  children: ReactNode
}) {
  return (
    <label className="cat-select">
      <select
        value={value}
        aria-label={label}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">{label}</option>
        {children}
      </select>
      <ChevronDown size={13} aria-hidden="true" />
    </label>
  )
}
function Tabs({
  options,
  selected,
  change,
}: {
  options: { value: string; text: string; count: number }[]
  selected: string
  change: (s: string) => void
}) {
  return (
    <div className="cat-tabs" role="group" aria-label="按状态筛选">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => change(option.value)}
          aria-pressed={selected === option.value}
        >
          {option.text} <small>{option.count.toLocaleString()}</small>
        </button>
      ))}
    </div>
  )
}
function Pages({
  total,
  page,
  setPage,
}: {
  total: number
  page: number
  setPage: (n: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <footer className="cat-page-footer">
      <span>
        共 {total.toLocaleString()} 条
        {total > pageSize && (
          <span>
            {' '}
            · 显示第 {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} 条
          </span>
        )}
      </span>
      <div>
        <button
          onClick={() => setPage(page - 1)}
          disabled={page === 1}
          aria-label="上一页"
        >
          <ChevronLeft size={15} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page >= pages}
          aria-label="下一页"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </footer>
  )
}

function AssetRow({
  app,
  latest,
  parent,
  chats,
  go,
  open,
}: {
  app: App
  parent?: App
  chats: ChatLink[]
  go: Props['go']
  latest?: Release
  open: Props['open']
}) {
  const machines = [
    ...new Set(
      chats.map((l) =>
        l.location === 'local' ? '本机' : l.machine || '来源电脑',
      ),
    ),
  ].join('、')
  return (
    <tr>
      <td>
        <Tool
          app={app}
          open={open}
          display={app.project.machine || app.description || kindName[app.kind]}
        />
      </td>
      <td>
        <span className={'cat-form cat-form-' + app.project.form}>
          {formNames[app.project.form]}
        </span>
        {parent && (
          <button
            className="cat-parent"
            onClick={() => open({ type: 'asset', id: parent.id })}
          >
            {parent.name}
            <ChevronRight size={10} />
          </button>
        )}
      </td>
      <td>{app.owner || '未登记'}</td>
      <td>
        <Mode app={app} />
      </td>
      <td>
        {latest ? (
          <button
            className="cat-version"
            onClick={() => open({ type: 'release-detail', id: latest.id })}
          >
            <Tag size={11} />
            {latest.version}
            {parent && <small>随工具箱</small>}
          </button>
        ) : (
          <span className="cat-muted">暂无版本</span>
        )}
      </td>
      <td>
        <button
          className="cat-chat-target"
          type="button"
          onClick={() => go('chats', app.id)}
          aria-label={'管理 ' + app.name + ' 的开发会话'}
        >
          <MessageSquare size={13} />
          {chats.length ? chats.length + ' 个会话' : '关联会话'}
        </button>
        {machines && (
          <small className="cat-machines" title={machines}>
            {machines}
          </small>
        )}
      </td>
      <td>
        <span className={'cat-pill cat-' + app.lifecycle}>
          <i />
          {app.lifecycle === 'active' ? '在用' : '已归档'}
        </span>
      </td>
      <td>
        <button
          className="cat-link"
          onClick={() => open({ type: 'asset', id: app.id })}
        >
          查看
          <ChevronRight size={13} />
        </button>
      </td>
    </tr>
  )
}
function ReleaseRow({
  release,
  app,
  open,
  latest,
}: {
  release: Release
  app?: App
  open: Props['open']
  latest: boolean
}) {
  return (
    <tr>
      <td>{app && <Tool app={app} open={open} display={app.owner} />}</td>
      <td>
        <button
          onClick={() => open({ type: 'release-detail', id: release.id })}
          className="cat-version"
        >
          <Tag size={11} />
          {release.version}
        </button>
      </td>
      <td>
        <span className={'cat-origin ' + (release.github ? 'official' : '')}>
          {release.github ? 'GitHub 正式版' : '本地记录'}
        </span>
      </td>
      <td>
        <span className="cat-note" title={release.notes}>
          {release.notes || '无更新说明'}
        </span>
      </td>
      <td>
        <span
          className={'cat-pill ' + (latest ? 'cat-active' : 'cat-archived')}
        >
          {latest ? <CircleDot /> : <Archive />}
          {latest ? '当前版本' : '历史版本'}
        </span>
      </td>
      <td className="cat-date">{date.format(release.time)}</td>
      <td>
        <button
          className="cat-link"
          onClick={() => open({ type: 'release-detail', id: release.id })}
        >
          详情
          <ChevronRight size={13} />
        </button>
      </td>
    </tr>
  )
}
function FeedbackRow({
  f,
  app,
  open,
}: {
  f: Feedback
  app?: App
  open: Props['open']
}) {
  return (
    <tr>
      <td>
        <button
          className="cat-text-link"
          onClick={() => open({ type: 'feedback-detail', id: f.id })}
        >
          <strong>{f.title}</strong>
        </button>
      </td>
      <td>
        {app && (
          <button
            className="cat-tool-link"
            onClick={() => open({ type: 'asset', id: app.id })}
          >
            {app.name}
          </button>
        )}
      </td>
      <td>
        <span className="cat-inline-version">{f.version || '未指定'}</span>
      </td>
      <td>{f.reporter || '未登记'}</td>
      <td>
        <span className={'cat-pill cat-' + f.state}>
          {f.state === 'resolved' ? (
            <Check />
          ) : f.state === 'ack' ? (
            <CircleDot />
          ) : (
            <Flag />
          )}
          {stateName[f.state]}
        </span>
      </td>
      <td className="cat-date">{date.format(f.time)}</td>
      <td>
        <button
          className="cat-link"
          onClick={() => open({ type: 'feedback-detail', id: f.id })}
        >
          {f.state === 'resolved' ? '详情' : '跟进'}
          <ChevronRight size={13} />
        </button>
      </td>
    </tr>
  )
}

function PageBody({ w, view, open, register, go }: Props) {
  const [term, setTerm] = useState('')
  const [scope, setScope] = useState('')
  const [kind, setKind] = useState('')
  const [owner, setOwner] = useState('')
  const [mode, setMode] = useState('')
  const [appId, setAppId] = useState('')
  const [form, setForm] = useState(''),
    [parentId, setParentId] = useState(''),
    [source, setSource] = useState('')
  const [requestedPage, setPage] = useState(1)
  const apps = useMemo(() => new Map(w.apps.map((a) => [a.id, a])), [w.apps])
  const linksByApp = useMemo(() => {
    const grouped = new Map<string, ChatLink[]>()
    for (const link of w.chatLinks) {
      const group = grouped.get(link.appId)
      if (group) group.push(link)
      else grouped.set(link.appId, [link])
    }
    return grouped
  }, [w.chatLinks])
  const teams = useMemo(
    () =>
      [...new Set(w.apps.map((a) => a.owner).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'zh-CN'),
      ),
    [w.apps],
  )
  const releases = useMemo(
    () =>
      w.releases
        .filter((r) => apps.get(r.appId)?.project.form !== 'module')
        .sort((a, b) => b.time - a.time),
    [w.releases, apps],
  )
  const latest = useMemo(() => {
    const byApp = new Map<string, Release>()
    for (const r of releases)
      if (!byApp.has(r.appId) || (r.github && !byApp.get(r.appId)?.github))
        byApp.set(r.appId, r)
    return byApp
  }, [releases])
  const feedback = useMemo(
    () => [...w.feedback].sort((a, b) => b.time - a.time),
    [w.feedback],
  )
  const isApps = view === 'apps'
  const isReleases = view === 'releases'
  const assets = w.apps
    .filter(
      (a) =>
        (!kind || a.kind === kind) &&
        (!owner || a.owner === owner) &&
        (!mode || a.mode === mode) &&
        (!form || form === a.project.form) &&
        (!source || source === a.project.source) &&
        (!parentId || a.id === parentId || a.project.parentId === parentId) &&
        search(
          term,
          a.name,
          a.id,
          a.description,
          a.owner,
          a.usage,
          a.project.machine,
          ...(linksByApp.get(a.id) || []).map((l) => l.machine),
          a.project.repo,
          apps.get(a.project.parentId)?.name || '',
        ),
    )
    .sort((a, b) => {
      const groupA = apps.get(releaseOwner(a)) || a,
        groupB = apps.get(releaseOwner(b)) || b
      const rank =
        sourceRank[groupA.project.source] - sourceRank[groupB.project.source]
      if (rank) return rank
      if (groupA.id !== groupB.id)
        return (
          groupA.created - groupB.created || groupA.id.localeCompare(groupB.id)
        )
      return (
        Number(a.project.form === 'module') -
        Number(b.project.form === 'module')
      )
    })
  const versions = releases.filter(
    (r) =>
      (!appId || r.appId === appId) &&
      (!source || (source === 'github') === !!r.github) &&
      search(term, r.version, r.notes, apps.get(r.appId)?.name || ''),
  )
  const items = feedback.filter(
    (f) =>
      (!appId || f.appId === appId) &&
      search(
        term,
        f.title,
        f.detail,
        f.reporter,
        f.version,
        apps.get(f.appId)?.name || '',
      ),
  )
  const options = isApps
    ? [
        { value: '', text: '全部工具', count: assets.length },
        {
          value: 'active',
          text: '在用',
          count: assets.filter((a) => a.lifecycle === 'active').length,
        },
        {
          value: 'archived',
          text: '已归档',
          count: assets.filter((a) => a.lifecycle === 'archived').length,
        },
      ]
    : isReleases
      ? [
          { value: '', text: '全部版本', count: versions.length },
          {
            value: 'latest',
            text: '当前版本',
            count: versions.filter((r) => latest.get(r.appId)?.id === r.id)
              .length,
          },
        ]
      : [
          { value: '', text: '全部反馈', count: items.length },
          ...(['open', 'ack', 'resolved'] as const).map((s) => ({
            value: s,
            text: stateName[s],
            count: items.filter((f) => f.state === s).length,
          })),
        ]
  const filtered = isApps
    ? assets.filter((a) => !scope || scope === a.lifecycle)
    : isReleases
      ? versions.filter((r) => !scope || latest.get(r.appId)?.id === r.id)
      : items.filter((f) => !scope || scope === f.state)
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(filtered.length / pageSize)),
  )
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const change = (update: (s: string) => void) => (s: string) => {
    update(s)
    setPage(1)
  }
  const filtersActive = !!(
    term ||
    scope ||
    owner ||
    mode ||
    kind ||
    appId ||
    form ||
    parentId ||
    source
  )
  function reset() {
    setTerm('')
    setScope('')
    setOwner('')
    setMode('')
    setKind('')
    setAppId('')
    setForm('')
    setParentId('')
    setSource('')
    setPage(1)
  }
  const headers = isApps
    ? [
        '工具名称',
        '项目归属',
        '使用团队',
        '运行方式',
        '最新版本',
        '开发会话',
        '状态',
        '操作',
      ]
    : isReleases
      ? [
          '所属项目',
          '版本号',
          '来源',
          '更新说明',
          '版本状态',
          '记录时间',
          '操作',
        ]
      : [
          '反馈事项',
          '所属工具',
          '关联版本',
          '反馈人',
          '处理状态',
          '反馈时间',
          '操作',
        ]
  return (
    <section
      className="cat-collection"
      aria-label={isApps ? '工具清单' : isReleases ? '发布记录' : '反馈列表'}
    >
      <div className="cat-top">
        <Tabs options={options} selected={scope} change={change(setScope)} />
        <SearchInput
          term={term}
          change={change(setTerm)}
          label={
            isApps
              ? '搜索工具、团队或用途'
              : isReleases
                ? '搜索工具、版本或说明'
                : '搜索反馈、工具或反馈人'
          }
        />
      </div>
      <div className="cat-filters">
        <span className="cat-filters-label">
          <ListFilter size={15} />
          筛选
        </span>
        {isApps ? (
          <>
            <Select label="项目来源" value={source} change={change(setSource)}>
              {Object.entries(sourceLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
            <Select label="项目形态" value={form} change={change(setForm)}>
              {Object.entries(formNames).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            {w.apps.some((a) => a.project.form === 'toolbox') && (
              <Select
                label="所属工具箱"
                value={parentId}
                change={change(setParentId)}
              >
                {w.apps
                  .filter((a) => a.project.form === 'toolbox')
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
            )}
            <Select label="全部业务" value={kind} change={change(setKind)}>
              {Object.entries(kindName).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select label="使用团队" value={owner} change={change(setOwner)}>
              {teams.map((team) => (
                <option key={team}>{team}</option>
              ))}
            </Select>
            <Select label="运行方式" value={mode} change={change(setMode)}>
              {Object.entries(modeName).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </>
        ) : (
          <Select label="全部工具" value={appId} change={change(setAppId)}>
            {w.apps
              .filter((a) => !isReleases || a.project.form !== 'module')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        )}
        {isReleases && (
          <Select label="版本来源" value={source} change={change(setSource)}>
            <option value="github">GitHub 正式版</option>
            <option value="local">本地记录</option>
          </Select>
        )}
        {filtersActive && (
          <button className="cat-reset" onClick={reset}>
            <X size={13} />
            清除筛选
          </button>
        )}
      </div>
      {rows.length > 0 ? (
        <div className="cat-scroll">
          <table className="cat-table">
            <thead>
              <tr>
                {headers.map((text) => (
                  <th key={text} scope="col">
                    {text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item) =>
                'mode' in item ? (
                  <AssetRow
                    key={item.id}
                    app={item}
                    chats={linksByApp.get(item.id) || []}
                    go={go}
                    parent={apps.get(item.project.parentId)}
                    latest={latest.get(releaseOwner(item))}
                    open={open}
                  />
                ) : 'notes' in item ? (
                  <ReleaseRow
                    key={item.id}
                    release={item}
                    app={apps.get(item.appId)}
                    latest={latest.get(item.appId)?.id === item.id}
                    open={open}
                  />
                ) : (
                  <FeedbackRow
                    key={item.id}
                    f={item}
                    app={apps.get(item.appId)}
                    open={open}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cat-empty">
          {isApps ? (
            <PackageOpen />
          ) : isReleases ? (
            <BookOpen />
          ) : (
            <MessageSquare />
          )}
          <strong>
            {filtersActive
              ? '没有符合条件的记录'
              : isApps
                ? '台账中还没有工具'
                : isReleases
                  ? '还没有版本发布'
                  : '还没有反馈记录'}
          </strong>
          {filtersActive ? (
            <button onClick={reset}>
              清除筛选
              <ArrowRight size={13} />
            </button>
          ) : isApps ? (
            <button onClick={register}>
              登记工具
              <ArrowRight size={13} />
            </button>
          ) : null}
        </div>
      )}
      <Pages total={filtered.length} page={page} setPage={setPage} />
    </section>
  )
}
export function CatalogPages(props: Props) {
  return <PageBody key={props.view} {...props} />
}

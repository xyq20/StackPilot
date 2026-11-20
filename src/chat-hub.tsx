import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowUpRight,
  Monitor,
  Download,
  ChevronDown,
  Settings2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Folder,
  Link2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Unlink2,
  X,
} from 'lucide-react'
import {
  api,
  type App,
  type ChatLink,
  type View,
  type Workspace,
} from './model'
import { matchRemoteControl, rememberChatUse, threadUrl } from './chat-links'
import './chat-hub.css'

type Thread = Pick<ChatLink, 'threadId' | 'title' | 'cwd'>
type SearchResult = { threads: Thread[]; total: number; available: boolean }
type Props = {
  w: Workspace
  refresh: () => void | Promise<void>
  appId: string
  go: (view: View, id?: string) => void
}
type Tab = 'local' | 'linked' | 'match'
const pageSize = 12
function hints(app: App | undefined) {
  if (!app) return []
  const basename = (v: string) =>
    v
      .trim()
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/\.git$/i, '') || ''
  return [
    ...new Set([
      app.name,
      app.folder,
      basename(app.folder),
      basename(app.project?.repo || ''),
    ]),
  ].filter((s) => s.length > 1)
}

type Manifest = {
  format: 'stackpilot-chat-links'
  version: 1
  machine: string
  links: { appId: string; threadId: string; title: string; cwd: string }[]
}
type ImportCounts = {
  added: number
  updated: number
  unchanged: number
  total: number
}
function manifestFile(raw: unknown, apps: App[], scope: string): Manifest {
  const m = raw as Partial<Manifest> | null
  if (
    !m ||
    m.format !== 'stackpilot-chat-links' ||
    m.version !== 1 ||
    typeof m.machine !== 'string' ||
    !m.machine.trim() ||
    m.machine.length > 120 ||
    !Array.isArray(m.links) ||
    !m.links.length ||
    m.links.length > 200
  )
    throw Error('请选择助手生成的会话清单，单次支持 1 至 200 条。')
  const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
  const ids = new Set(apps.map((a) => a.id))
  const links = m.links.map((l) => {
    if (!l || !ids.has(l.appId))
      throw Error('清单中包含尚未登记的项目，请重新下载本工作台的助手。')
    if (scope && scope !== l.appId)
      throw Error('清单包含其他项目，请从全部项目的对话入口导入。')
    if (
      !uuid.test(l.threadId) ||
      typeof l.title !== 'string' ||
      !l.title.trim() ||
      l.title.length > 160 ||
      typeof l.cwd !== 'string' ||
      l.cwd.length > 2048
    )
      throw Error('清单内的对话记录不完整或超出长度限制。')
    return { appId: l.appId, threadId: l.threadId, title: l.title, cwd: l.cwd }
  })
  return { machine: m.machine.trim(), format: m.format, version: 1, links }
}
function StationField({
  value,
  change,
}: {
  value: string
  change: (value: string) => void
}) {
  return (
    <label className="ch-field">
      来源电脑远控入口（选填）
      <input
        value={value}
        maxLength={2048}
        onChange={(e) => change(e.target.value)}
        placeholder="RustDesk、AnyDesk 或 HTTPS 链接"
      />
    </label>
  )
}
function TransferPanel({
  scope,
  apps,
  saved,
  remoteManual,
}: {
  scope: string
  apps: App[]
  saved: (msg: string) => Promise<void>
  remoteManual: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false),
    [data, setData] = useState<Manifest | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [station, setStation] = useState('')
  const request = useRef(0),
    lock = useRef(false),
    fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const sync = () => {
      if (
        new URLSearchParams(window.location.hash.split('?')[1] || '').get(
          'transfer',
        ) === '1'
      ) {
        setOpen(true)
        requestAnimationFrame(() =>
          panel.current?.scrollIntoView({ block: 'start' }),
        )
      }
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  async function preview(file?: File) {
    const seq = ++request.current
    setData(null)
    setError('')
    setStation('')
    if (!file) return
    try {
      if (file.size > 2 * 1024 * 1024)
        throw Error('清单文件超过 2 MB，请分批导出。')
      const parsed = manifestFile(JSON.parse(await file.text()), apps, scope)
      if (seq === request.current) setData(parsed)
    } catch (e) {
      if (seq === request.current)
        setError(
          e instanceof SyntaxError
            ? '请选择有效的 JSON 文件。'
            : e instanceof Error
              ? e.message
              : '读取文件失败',
        )
    }
  }
  async function confirm() {
    if (!data || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const r = await api<ImportCounts>('chat-links/import', {
        ...data,
        stationUrl: station.trim(),
      })
      setData(null)
      setStation('')
      if (fileRef.current) fileRef.current.value = ''
      await saved(
        '已导入 ' +
          data.machine +
          ' 的会话。新增 ' +
          r.added +
          ' 条，更新 ' +
          r.updated +
          ' 条，已有 ' +
          r.unchanged +
          ' 条。',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入未完成')
    } finally {
      setBusy(false)
      lock.current = false
    }
  }
  const projectCounts = new Map<string, number>()
  for (const l of data?.links || [])
    projectCounts.set(l.appId, (projectCounts.get(l.appId) || 0) + 1)
  return (
    <div className="ch-transfer" ref={panel}>
      <button
        type="button"
        className="ch-transfer-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="ch-device-icon">
          <Monitor size={19} />
        </span>
        <span>
          <strong>在另一台电脑上关联</strong>
          <small>从开发电脑带回项目与 Codex 对话的关联清单。</small>
        </span>
        <ChevronDown
          size={16}
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open && (
        <div className="ch-transfer-body">
          <ol>
            <li>
              将助手复制到保存 Codex 对话的电脑。
              <a
                className="ch-text-link"
                download
                href={
                  '/api/chat-station/helper.py' +
                  (scope ? '?app=' + encodeURIComponent(scope) : '')
                }
              >
                <Download size={14} />
                下载{scope ? '此项目的' : ''}助手
              </a>
            </li>
            <li>
              在那台电脑用 Python 3 运行 <code>StackPilot-Chat-Link.py</code>
              。在自动打开的本机页面填写电脑别名，勾选对话，点击“下载关联清单”。
            </li>
            <li>
              将 <code>StackPilot-Chat-Links.json</code>{' '}
              带回这台电脑，预览后导入。
            </li>
          </ol>
          <div className="ch-file-controls">
            <label className="ch-file-label">
              选择会话清单
              <input
                type="file"
                ref={fileRef}
                disabled={busy}
                accept=".json,application/json"
                onChange={(e) => void preview(e.target.files?.[0])}
              />
            </label>
            <button className="ch-btn" onClick={remoteManual}>
              <Plus size={14} />
              手动登记一条
            </button>
          </div>
          {data && (
            <div className="ch-preview">
              <div>
                <strong>导入预览</strong>
                <span>{data.links.length} 条关联</span>
              </div>
              <p>
                来源电脑 <b>{data.machine}</b>
              </p>
              <p>
                目标项目{' '}
                {Array.from(projectCounts, ([id, count]) => (
                  <span key={id}>
                    {apps.find((a) => a.id === id)?.name}（{count}）{' '}
                  </span>
                ))}
              </p>
              <details>
                <summary>查看会话清单</summary>
                <ul>
                  {data.links.map((l, i) => (
                    <li key={i}>
                      {l.title}
                      <small>{l.cwd || l.threadId}</small>
                    </li>
                  ))}
                </ul>
              </details>
              <StationField value={station} change={setStation} />
              <button
                className="ch-btn ch-primary"
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy ? '正在导入…' : '确认导入'}
              </button>
            </div>
          )}
          {error && (
            <p className="ch-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
function StationForm({
  link,
  close,
  saved,
}: {
  link: ChatLink
  close: () => void
  saved: (message: string) => Promise<void>
}) {
  const ref = useRef<HTMLDialogElement>(null),
    lock = useRef(false)
  const [url, setUrl] = useState(link.stationUrl),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    const node = ref.current
    node?.showModal()
    return () => node?.close()
  }, [])
  async function save(e: FormEvent) {
    e.preventDefault()
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await api('chat-stations', { machine: link.machine, url })
      await saved('已更新 ' + link.machine + ' 的远控入口')
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
      lock.current = false
    }
  }
  return (
    <dialog
      ref={ref}
      className="ch-modal"
      aria-labelledby="ch-station-label"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) close()
      }}
    >
      <header>
        <h2 id="ch-station-label">设置来源电脑入口</h2>
        <button
          className="ch-icon"
          disabled={busy}
          onClick={close}
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </header>
      <form onSubmit={save}>
        <p className="ch-selected">
          <Monitor size={16} />
          {link.machine}
        </p>
        <p className="ch-note">这台电脑的所有会话共用该入口。</p>
        <StationField value={url} change={setUrl} />
        {error && (
          <p className="ch-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="ch-btn"
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          <button className="ch-btn ch-primary" disabled={busy}>
            保存入口
          </button>
        </footer>
      </form>
    </dialog>
  )
}

function BindingForm({
  thread,
  initialRemote,
  scope,
  apps,
  links,
  close,
  saved,
}: {
  thread: Thread | null
  initialRemote: boolean
  scope: string
  apps: App[]
  links: ChatLink[]
  close: () => void
  saved: () => void | Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const lock = useRef(false)
  const [where, setWhere] = useState<'local' | 'remote'>(
    initialRemote ? 'remote' : 'local',
  )
  const [station, setStation] = useState('')
  const available = apps.filter(
    (a) =>
      !thread ||
      !links.some(
        (l) =>
          l.location === 'local' &&
          l.appId === a.id &&
          l.threadId === thread.threadId,
      ),
  )
  const [appId, setAppId] = useState(scope || available[0]?.id || '')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [])
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (lock.current) return
    const form = new FormData(e.currentTarget)
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await api('chat-links', {
        appId,
        location: where,
        machine: form.get('machine') || '',
        stationUrl: station,
        threadId: thread?.threadId || form.get('reference'),
        title: thread?.title || form.get('title') || '',
      })
      await saved()
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : '关联失败，请重试')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="ch-modal"
      aria-labelledby="ch-modal-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) close()
      }}
    >
      <header>
        <h2 id="ch-modal-title">{thread ? '关联对话' : '添加对话链接'}</h2>
        <button
          className="ch-icon"
          aria-label="关闭"
          disabled={busy}
          onClick={close}
        >
          <X size={16} />
        </button>
      </header>
      <form onSubmit={submit}>
        {thread ? (
          <p className="ch-selected">
            <MessageSquare size={17} />
            {thread.title}
          </p>
        ) : (
          <>
            <label>
              对话所在位置
              <select
                value={where}
                onChange={(e) => setWhere(e.target.value as 'local' | 'remote')}
              >
                <option value="remote">其他电脑</option>
                <option value="local">本机</option>
              </select>
            </label>
            {where === 'remote' && (
              <>
                <label>
                  来源电脑别名
                  <input
                    name="machine"
                    required
                    maxLength={120}
                    placeholder="例如：开发笔记本"
                  />
                </label>
                <StationField value={station} change={setStation} />
              </>
            )}
            <label>
              Codex 对话链接或 ID
              <input
                name="reference"
                required
                maxLength={160}
                placeholder="codex://threads/…"
                autoFocus
              />
            </label>
            <label>
              显示名称（选填）
              <input
                name="title"
                maxLength={160}
                placeholder={
                  where === 'remote'
                    ? '例如：商品定价开发讨论'
                    : '本机对话将使用索引中的标题'
                }
              />
            </label>
          </>
        )}
        <label>
          关联项目
          <select
            required
            value={appId}
            disabled={!!scope}
            onChange={(e) => setAppId(e.target.value)}
          >
            {available.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
        </label>
        {available.length === 0 && (
          <p className="ch-note">当前没有可关联的项目。</p>
        )}
        {error && (
          <p className="ch-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            className="ch-btn"
            type="button"
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          <button
            className="ch-btn ch-primary"
            disabled={busy || !appId || !available.length}
            type="submit"
          >
            {busy ? '保存中…' : '保存关联'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}

function Hub({ w, appId, refresh, go }: Props) {
  const app = w.apps.find((a) => a.id === appId)
  const scope = app?.id || ''
  const bound = (w.chatLinks || []).filter((l) => !scope || l.appId === scope)
  const terms = hints(app).join('\n')
  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab') ===
    'local'
      ? 'local'
      : 'linked',
  )
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [rev, setRev] = useState(0)
  const [res, setRes] = useState<SearchResult>({
    threads: [],
    total: 0,
    available: true,
  })
  const [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  const [binding, setBinding] = useState<Thread | null | undefined>()
  const [initialRemote, setInitialRemote] = useState(false),
    [editingStation, setEditingStation] = useState<ChatLink | null>(null)
  const [copyFallback, setCopyFallback] = useState('')
  const mutation = useRef(false)
  useEffect(() => {
    if (tab === 'linked') return
    let active = true
    setLoading(true)
    setLoadError('')
    const q = new URLSearchParams({
      q: query,
      limit: String(pageSize),
      offset: String(page * pageSize),
    })
    if (tab === 'match')
      terms
        .split('\n')
        .filter(Boolean)
        .forEach((h) => q.append('hint', h))
    const timer = setTimeout(() => {
      api<SearchResult>('chats?' + q)
        .then((data) => {
          if (active) {
            setRes(data)
            setLoading(false)
          }
        })
        .catch((e) => {
          if (active) {
            setLoadError(e.message)
            setLoading(false)
          }
        })
    }, 120)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [terms, tab, query, page, rev])
  const projectName = (id: string) =>
    w.apps.find((a) => a.id === id)?.name || id
  const needle = query.trim().toLocaleLowerCase()
  const links = bound.filter((l) =>
    [
      l.title,
      l.cwd,
      l.threadId,
      l.machine || '本机',
      projectName(l.appId),
    ].some((s) => s.toLocaleLowerCase().includes(needle)),
  )
  const total = tab === 'linked' ? links.length : res.total
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pages - 1)
  const rows: (Thread | ChatLink)[] =
    tab === 'linked'
      ? links.slice(current * pageSize, (current + 1) * pageSize)
      : res.threads
  function pick(t: Tab) {
    setTab(t)
    setPage(0)
    setMessage('')
    setCopyFallback('')
  }
  async function mutate(path: string, data: unknown, note: string) {
    if (mutation.current) return
    mutation.current = true
    setBusy(true)
    setMessage('')
    try {
      await api(path, data)
      await refresh()
      setMessage(note)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      setBusy(false)
      mutation.current = false
    }
  }
  async function copy(target: Thread | ChatLink) {
    const machine =
      'location' in target && target.location === 'remote' ? target.machine : ''
    const url = threadUrl(target.threadId)
    try {
      await navigator.clipboard.writeText(url)
      rememberChatUse(target, 'copy')
      setCopyFallback('')
      setMessage(
        machine
          ? '已复制对话链接，请在 ' + machine + ' 上打开'
          : '已复制对话链接',
      )
    } catch {
      setCopyFallback(url)
      setMessage('请复制下方的对话链接')
    }
  }
  const saved = async (note: string) => {
    await refresh()
    setMessage(note)
    setTab('linked')
    setQuery('')
    setPage(0)
  }
  function bindLocal(row: Thread) {
    setInitialRemote(false)
    setBinding(row)
  }
  function manual(remote: boolean) {
    setInitialRemote(remote)
    setBinding(null)
  }
  const isLoading = tab !== 'linked' && loading
  return (
    <section className="ch-hub">
      {app && (
        <div className="ch-scope">
          <Folder size={16} />
          <strong>{app.name}</strong>
          <button onClick={() => go('chats')}>
            全部项目 <ChevronRight size={13} />
          </button>
        </div>
      )}
      <TransferPanel
        scope={scope}
        apps={w.apps}
        saved={saved}
        remoteManual={() => manual(true)}
      />
      <div className="ch-bar">
        <nav aria-label="对话范围">
          {(
            [
              ['linked', scope ? '项目已关联' : '已关联'],
              ...(app ? [['match', '本机候选']] : []),
              ['local', '本机对话'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={key === tab ? 'ch-active' : ''}
              onClick={() => pick(key)}
              aria-pressed={key === tab}
            >
              {label}
              {key === 'linked' && <small>{bound.length}</small>}
            </button>
          ))}
        </nav>
        <button className="ch-btn ch-primary" onClick={() => manual(true)}>
          <Plus size={15} />
          添加链接
        </button>
      </div>
      <div className="ch-tools">
        <label className="ch-search">
          <Search size={16} />
          <input
            aria-label="搜索对话"
            placeholder={
              tab === 'linked'
                ? '搜索对话、电脑、目录或项目'
                : '搜索对话标题、目录或 ID'
            }
            value={query}
            maxLength={160}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </label>
        <button
          className="ch-btn"
          onClick={() => {
            setRev((r) => r + 1)
            void refresh()
          }}
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>
      {tab === 'match' && (
        <p className="ch-note">
          按项目名称、仓库名和本机目录匹配，点击“关联”保存到该项目。
        </p>
      )}
      {message && (
        <div className="ch-status" role="status">
          <Check size={15} />
          {message}
        </div>
      )}
      {copyFallback && (
        <input
          className="ch-fallback"
          aria-label="可复制的对话链接"
          value={copyFallback}
          readOnly
          onFocus={(e) => e.target.select()}
        />
      )}
      {tab !== 'linked' && loadError ? (
        <p className="ch-error" role="alert">
          {loadError}
        </p>
      ) : !isLoading && tab !== 'linked' && !res.available ? (
        <div className="ch-blank">
          <MessageSquare />
          <strong>未读取到本机 Codex 索引</strong>
          <span>可通过“添加链接”粘贴对话链接或 ID，保存到项目。</span>
        </div>
      ) : (
        <>
          <div className="ch-label">
            <span>对话 / 工作目录</span>
            <span>{tab === 'linked' ? '关联项目' : '项目关联'}</span>
            <span>操作</span>
          </div>
          {isLoading ? (
            <div className="ch-blank">正在读取本机索引…</div>
          ) : rows.length === 0 ? (
            <div className="ch-blank">
              <MessageSquare />
              <strong>
                {query
                  ? '未找到匹配的对话'
                  : tab === 'match'
                    ? '暂无匹配此项目的候选'
                    : tab === 'linked'
                      ? '还没有关联对话'
                      : '未找到本机会话'}
              </strong>
              {tab !== 'local' && (
                <button className="ch-btn" onClick={() => pick('local')}>
                  浏览本机对话
                </button>
              )}
            </div>
          ) : (
            rows.map((row) => {
              const link = 'id' in row ? row : null
              const remote = link?.location === 'remote'
              const deviceLink = remote
                ? matchRemoteControl(
                    link,
                    w.apps.find((a) => a.id === link.appId),
                  )
                : null
              const linked = (w.chatLinks || []).filter(
                (l) => l.location === 'local' && l.threadId === row.threadId,
              )
              const inScope = linked.find((l) => l.appId === scope)
              return (
                <div className="ch-row" key={link?.id || row.threadId}>
                  <div className="ch-ident">
                    <span className="ch-glyph">
                      <MessageSquare size={16} />
                    </span>
                    <div>
                      {remote ? (
                        <strong className="ch-remote-title" title={row.title}>
                          {row.title}
                        </strong>
                      ) : (
                        <a
                          title={row.title}
                          href={threadUrl(row.threadId)}
                          onClick={() =>
                            rememberChatUse(link || inScope || row, 'open')
                          }
                        >
                          {row.title}
                          <ArrowUpRight size={13} />
                        </a>
                      )}
                      <span
                        className={remote ? 'ch-source ch-away' : 'ch-source'}
                      >
                        {remote ? '异机 · ' + link.machine : '本机'}
                      </span>
                      <small title={row.cwd || row.threadId}>
                        {row.cwd || row.threadId}
                      </small>
                    </div>
                  </div>
                  <span
                    className={
                      'ch-project ' + (link || linked.length ? 'ch-bound' : '')
                    }
                  >
                    {link
                      ? projectName(link.appId)
                      : linked.length
                        ? linked.map((l) => projectName(l.appId)).join('、')
                        : '未关联'}
                  </span>
                  <div className="ch-row-actions">
                    {remote && (
                      <>
                        {deviceLink && (
                          <a
                            className="ch-btn"
                            href={deviceLink}
                            onClick={() => rememberChatUse(link, 'remote')}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Monitor size={13} />
                            远控
                          </a>
                        )}
                        <button
                          className="ch-icon"
                          aria-label={'设置 ' + link.machine + ' 远控入口'}
                          title="设置来源电脑远控入口"
                          onClick={() => setEditingStation(link)}
                        >
                          <Settings2 size={14} />
                        </button>
                      </>
                    )}
                    <button
                      className="ch-icon"
                      aria-label={'复制链接 ' + row.title}
                      title={
                        remote
                          ? '复制到 ' + link.machine + ' 打开'
                          : '复制对话链接'
                      }
                      onClick={() => void copy(link || inScope || row)}
                    >
                      <Copy size={15} />
                      {remote && <span>复制到异机</span>}
                    </button>
                    {link || inScope ? (
                      <button
                        className="ch-btn"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            'chat-links/' + (link || inScope)!.id + '/unlink',
                            {},
                            '已解除项目关联',
                          )
                        }
                      >
                        <Unlink2 size={13} />
                        解除
                      </button>
                    ) : (
                      <button
                        className="ch-btn"
                        disabled={busy || !w.apps.length}
                        onClick={() =>
                          scope
                            ? void mutate(
                                'chat-links',
                                { threadId: row.threadId, appId: scope },
                                '已关联到 ' + app?.name,
                              )
                            : bindLocal(row)
                        }
                      >
                        <Link2 size={13} />
                        关联
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
          {!isLoading && (
            <footer className="ch-pages">
              <span>
                共 {total} {tab === 'linked' ? '条关联' : '个对话'}
              </span>
              <div>
                <button
                  className="ch-icon"
                  disabled={current === 0}
                  aria-label="上一页对话"
                  onClick={() => setPage(current - 1)}
                >
                  <ChevronLeft size={15} />
                </button>
                {current + 1} / {pages}
                <button
                  className="ch-icon"
                  aria-label="下一页对话"
                  disabled={current + 1 >= pages}
                  onClick={() => setPage(current + 1)}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </footer>
          )}
        </>
      )}
      {editingStation && (
        <StationForm
          link={editingStation}
          close={() => setEditingStation(null)}
          saved={saved}
        />
      )}
      {binding !== undefined && (
        <BindingForm
          thread={binding}
          initialRemote={initialRemote}
          scope={scope}
          apps={w.apps}
          links={w.chatLinks || []}
          close={() => setBinding(undefined)}
          saved={async () => {
            await refresh()
            setMessage('已保存项目关联')
            setTab('linked')
            setQuery('')
            setPage(0)
          }}
        />
      )}
    </section>
  )
}
export function ChatHub(props: Props) {
  return <Hub key={props.appId} {...props} />
}

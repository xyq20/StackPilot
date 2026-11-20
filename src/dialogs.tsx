import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  ClipboardCopy,
  Clock3,
  ExternalLink,
  FileText,
  KeyRound,
  ListChecks,
  Pencil,
  Plug,
  X,
} from 'lucide-react'
import {
  api,
  compact,
  days,
  kindName,
  relative,
  stamp,
  stateName,
  type App,
  type Kind,
  type View,
  type Workspace,
} from './model'
import { ProgramIcon, Status } from './visuals'
import './dialogs.css'

export type Dialog =
  | { type: 'register' }
  | { type: 'edit' | 'detail' | 'guide' | 'rotate'; id: string }
  | { type: 'secret'; id: string; token: string }
  | { type: 'incident' | 'run'; id: string }
  | null

export type DialogProps = {
  dialog: Dialog
  openAsset: (id: string) => void
  setDialog: (value: Dialog) => void
  w: Workspace
  refresh: () => void | Promise<void>
  go: (view: View, appId?: string) => void
  notify: (message: string) => void
}

function Shell({
  title,
  drawer,
  close,
  locked,
  children,
}: {
  title: string
  drawer?: boolean
  close: () => void
  locked: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = ref.current
    node?.showModal()
    const prior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      node?.close()
      document.body.style.overflow = prior
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={'sd-shell' + (drawer ? ' sd-drawer' : '')}
      aria-labelledby="sd-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!locked) close()
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || locked) return
        const bounds = e.currentTarget.getBoundingClientRect()
        if (
          e.clientX < bounds.left ||
          e.clientX > bounds.right ||
          e.clientY < bounds.top ||
          e.clientY > bounds.bottom
        )
          close()
      }}
    >
      <header className="sd-head">
        <h2 id="sd-title">{title}</h2>
        <button
          className="sd-icon"
          aria-label="关闭窗口"
          disabled={locked}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  )
}

function Meta({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="sd-meta">
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function AppForm({
  app,
  apps,
  busy,
  onSave,
  cancel,
}: {
  app?: App
  apps: App[]
  busy: boolean
  onSave: (data: Record<string, unknown>) => void
  cancel: () => void
}) {
  const [kind, setKind] = useState<Kind>(app?.kind || 'tool')
  const [formType, setFormType] = useState('other')
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    onSave({
      ...Object.fromEntries(form),
      kind,
      ...(!app && {
        project: {
          form: formType,
          parentId: String(form.get('parentId') || ''),
          repo: String(form.get('repo') || ''),
          machine: String(form.get('machine') || ''),
          remoteUrl: String(form.get('remoteUrl') || ''),
          remoteNote: String(form.get('remoteNote') || ''),
          releaseUrl: String(form.get('releaseUrl') || ''),
        },
      }),
      timeout: Number(form.get('timeout') || 15),
    })
  }
  return (
    <form onSubmit={submit}>
      <div className="sd-body sd-fields">
        <label>
          项目名称 <b>*</b>
          <input
            name="name"
            defaultValue={app?.name}
            required
            maxLength={60}
            pattern=".*\S.*"
            placeholder="例如，店铺订单同步"
            autoFocus
          />
        </label>
        {!app && (
          <>
            <label>
              项目形态
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                <option value="other">普通工具</option>
                <option value="toolbox">工具箱</option>
                <option
                  value="module"
                  disabled={!apps.some((a) => a.project.form === 'toolbox')}
                >
                  工具箱子项目
                </option>
                <option value="remote">独立电脑项目</option>
              </select>
            </label>
            {formType === 'module' ? (
              <label>
                所属工具箱
                <select name="parentId" required defaultValue="">
                  <option value="" disabled>
                    选择工具箱
                  </option>
                  {apps
                    .filter((a) => a.project.form === 'toolbox')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <label>
                源码仓库（选填）
                <input
                  name="repo"
                  maxLength={2048}
                  placeholder="例如 xyq20/ZSZ-Tools"
                />
              </label>
            )}
            {formType === 'remote' && (
              <>
                <label>
                  运行电脑
                  <input
                    name="machine"
                    maxLength={160}
                    placeholder="例如 仓库 Windows 主机"
                  />
                </label>
                <label>
                  远程入口（选填）
                  <input
                    name="remoteUrl"
                    maxLength={2048}
                    placeholder="远控网址或客户端链接"
                  />
                </label>
                <label>
                  连接说明（选填）
                  <textarea
                    name="remoteNote"
                    rows={2}
                    maxLength={2000}
                    placeholder="使用的远控软件、电脑别名或值班说明"
                  />
                </label>
              </>
            )}
          </>
        )}
        <fieldset>
          <legend>业务分类</legend>
          <div className="sd-types">
            {(['commerce', 'tool'] as const).map((k) => (
              <label className={kind === k ? 'sd-active' : ''} key={k}>
                <input
                  type="radio"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                {kindName[k]}
                {kind === k && <Check size={14} />}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sd-pair">
          <label>
            使用团队
            <input
              name="owner"
              placeholder="例如，店铺运营组"
              maxLength={60}
              defaultValue={app?.owner}
            />
          </label>
          {app ? (
            <label>
              心跳超时（分钟）
              <input
                name="timeout"
                type="number"
                required
                min="1"
                max="1440"
                defaultValue={app?.timeout ?? 15}
              />
            </label>
          ) : (
            <label>
              运行方式
              <select name="mode" defaultValue="desktop">
                <option value="desktop">桌面工具</option>
                <option value="web">网页工具</option>
                <option value="scheduled">定时任务</option>
              </select>
            </label>
          )}
        </div>
        {app && (
          <label>
            本机项目目录
            <input
              name="folder"
              maxLength={1024}
              defaultValue={app?.folder}
              placeholder="项目路径（选填）"
            />
          </label>
        )}
        <label>
          工作台或工具网址（选填）
          <input
            type="url"
            name="url"
            maxLength={2048}
            defaultValue={app?.url}
            placeholder="http://127.0.0.1:8000"
          />
        </label>
        <label>
          工具简介
          <textarea
            name="description"
            rows={2}
            maxLength={500}
            defaultValue={app?.description}
            placeholder="这个程序负责什么？"
          />
        </label>
        {!app && (
          <label>
            使用说明
            <textarea
              name="usage"
              rows={2}
              maxLength={4000}
              placeholder="例如，打开工具，导入店铺导出的订单文件。"
            />
          </label>
        )}
      </div>
      <footer className="sd-foot">
        <button
          type="button"
          className="sd-btn"
          disabled={busy}
          onClick={cancel}
        >
          取消
        </button>
        <button className="sd-btn sd-primary" disabled={busy}>
          {busy ? '正在保存…' : app ? '保存修改' : '登记项目'}
        </button>
      </footer>
    </form>
  )
}

function CopyButton({
  value,
  notify,
}: {
  value: string
  notify: (msg: string) => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="sd-btn sd-small"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          notify('已复制到剪贴板')
        } catch {
          notify('请选中文本后复制')
        }
      }}
    >
      {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}{' '}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

function Guide({
  app,
  notify,
  register,
}: {
  app: App
  notify: (msg: string) => void
  register: () => void
}) {
  const [endpoint, setEndpoint] = useState<'heartbeat' | 'runs'>('heartbeat')
  const endpointUrl =
    window.location.origin + '/api/ingest/' + app.id + '/' + endpoint
  const sample =
    endpoint === 'heartbeat'
      ? { status: 'healthy' }
      : {
          eventId: 'job-001',
          title: '同步订单',
          status: 'success',
          duration: 1250,
          message: '同步完成',
        }
  const example = [
    'curl -X POST "' + endpointUrl + '"',
    '  -H "Authorization: Bearer $STACKPILOT_TOKEN"',
    '  -H "Content-Type: application/json"',
    "  -d '" + JSON.stringify(sample) + "'",
  ].join(' ' + String.fromCharCode(92) + '\n')
  return (
    <div className="sd-body">
      <div className="sd-app-title">
        <ProgramIcon app={app} />
        <div>
          <h3>{app.name}</h3>
          <code>{app.id}</code>
        </div>
      </div>
      {app.demo === 1 && (
        <div className="sd-note">
          此示例程序用于演示。
          <button className="sd-link" onClick={register}>
            登记自己的程序 <ArrowRight size={13} />
          </button>
        </div>
      )}
      <p className="sd-copy">
        程序在本机运行时，将接入密钥保存为环境变量 <code>STACKPILOT_TOKEN</code>
        。在程序运行期间定时发送心跳，在任务结束时上报结果。
      </p>
      <div className="sd-tabs" role="group" aria-label="上报示例">
        {(['heartbeat', 'runs'] as const).map((k) => (
          <button
            key={k}
            className={k === endpoint ? 'sd-active' : ''}
            onClick={() => setEndpoint(k)}
          >
            {k === 'heartbeat' ? '心跳上报' : '任务结果'}
          </button>
        ))}
      </div>
      <div className="sd-code">
        <div>
          <span>Shell</span>
          <CopyButton key={endpoint} value={example} notify={notify} />
        </div>
        <pre>{example}</pre>
      </div>
      <p className="sd-copy">
        {endpoint === 'heartbeat'
          ? '建议每 ' +
            Math.max(10, Math.round((app.timeout * 60) / 3)) +
            ' 秒上报一次。超过 ' +
            app.timeout +
            ' 分钟没有心跳，工作台会标记离线并生成告警。状态支持 healthy、warning。'
          : '每次执行使用唯一 eventId，同一任务重试上报时复用该值。duration 以毫秒计，status 可填 success 或 failed。失败结果会生成告警。'}
      </p>
    </div>
  )
}

function Body({
  dialog: d,
  openAsset,
  w,
  setDialog,
  go,
  refresh,
  notify,
}: DialogProps & { dialog: NonNullable<Dialog> }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const guard = useRef(false)
  const id = 'id' in d ? d.id : ''
  const app = w.apps.find((a) => a.id === id)
  const close = () => setDialog(null)
  const jump = (view: View, appId?: string) => {
    close()
    go(view, appId)
  }
  async function act(fn: () => Promise<void>) {
    if (guard.current) return
    guard.current = true
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未完成，请重试')
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  const refreshAfter = async () => {
    try {
      await refresh()
    } catch {
      notify('操作已保存，请刷新工作台更新数据')
    }
  }
  const cancel = () => {
    if (d.type === 'edit') openAsset(id)
    else if (d.type === 'rotate') setDialog({ type: 'detail', id })
    else close()
  }
  let content: ReactNode
  const titles: Record<NonNullable<Dialog>['type'], string> = {
    register: '登记项目',
    edit: '编辑基本信息',
    detail: '程序详情',
    guide: '接入指引',
    rotate: '重置接入密钥',
    secret: '保存接入密钥',
    incident: '告警详情',
    run: '运行详情',
  }
  if (d.type === 'register' || (d.type === 'edit' && app)) {
    content = (
      <AppForm
        apps={w.apps}
        app={d.type === 'edit' ? app : undefined}
        busy={busy}
        cancel={cancel}
        onSave={(data) =>
          void act(async () => {
            if (d.type === 'edit') {
              await api('apps/' + id, data)
              await refreshAfter()
              notify('工具信息已更新')
              openAsset(id)
            } else {
              const result = await api<{ id: string; token: string }>(
                'apps',
                data,
              )
              await refreshAfter()
              notify('工具已登记')
              openAsset(result.id)
            }
          })
        }
      />
    )
  } else if (d.type === 'secret') {
    content = (
      <>
        <div className="sd-body">
          <div className="sd-large-icon">
            <KeyRound size={25} />
          </div>
          <h3>接入密钥已生成</h3>
          <p className="sd-copy">
            此密钥仅显示一次，请保存到该程序的本机配置中。
          </p>
          <div className="sd-token">
            <div>
              <strong>接入密钥</strong>
              <CopyButton value={d.token} notify={notify} />
            </div>
            <code>{d.token}</code>
          </div>
          <Meta items={[['程序 ID', <code>{id}</code>]]} />
        </div>
        <footer className="sd-foot">
          <button
            className="sd-btn sd-primary"
            onClick={() => setDialog({ type: 'guide', id })}
          >
            已保存，查看接入指引 <ArrowRight size={15} />
          </button>
        </footer>
      </>
    )
  } else if (d.type === 'rotate' && app) {
    content = (
      <>
        <div className="sd-body">
          <p>
            为「{app.name}
            」生成新密钥？旧密钥立即失效，需要同步更新程序的本机配置。
          </p>
        </div>
        <footer className="sd-foot">
          <button className="sd-btn" disabled={busy} onClick={cancel}>
            取消
          </button>
          <button
            className="sd-btn sd-primary"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const result = await api<{ id: string; token: string }>(
                  'apps/' + id + '/rotate',
                  {},
                )
                setDialog({ type: 'secret', ...result })
              })
            }
          >
            确认重置
          </button>
        </footer>
      </>
    )
  } else if (d.type === 'guide' && app) {
    content = (
      <Guide
        app={app}
        notify={notify}
        register={() => setDialog({ type: 'register' })}
      />
    )
  } else if (d.type === 'detail' && app) {
    const runs = w.runs.filter((r) => r.appId === id),
      alerts = w.alerts.filter((a) => a.appId === id && a.state !== 'resolved')
    content = (
      <div className="sd-body">
        <div className="sd-detail-title">
          <div className="sd-app-title">
            <ProgramIcon app={app} />
            <div>
              <h3>{app.name}</h3>
              <code>{app.id}</code>
            </div>
          </div>
          <Status value={app.health} />
        </div>
        {app.description && <p className="sd-copy">{app.description}</p>}
        <div className="sd-actions">
          {app.url && (
            <a
              className="sd-btn sd-primary"
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              打开工作台 <ExternalLink size={14} />
            </a>
          )}
          {!app.demo && (
            <button
              className="sd-btn"
              onClick={() => setDialog({ type: 'edit', id })}
            >
              <Pencil size={14} />
              编辑程序
            </button>
          )}
          <button
            className="sd-btn"
            onClick={() => setDialog({ type: 'guide', id })}
          >
            <Plug size={14} />
            接入指引
          </button>
        </div>
        <div className="sd-section">
          <h4>基础信息</h4>
          <Meta
            items={[
              ['程序类型', kindName[app.kind]],
              ['使用团队', app.owner || '未填写'],
              ['数据来源', app.demo ? '测试数据' : '手动登记'],
              [
                '最近心跳',
                app.lastSeen
                  ? stamp(app.lastSeen) + ' · ' + relative(app.lastSeen, w.now)
                  : '等待首次上报',
              ],
              ['心跳阈值', app.timeout + ' 分钟'],
              ['本机目录', app.folder || '未登记'],
              [
                '工作台地址',
                app.url ? (
                  <a href={app.url} target="_blank" rel="noopener noreferrer">
                    {app.url}
                  </a>
                ) : (
                  '未登记'
                ),
              ],
            ]}
          />
        </div>
        <div className="sd-section">
          <h4>运行动态</h4>
          <div className="sd-navrows">
            <button onClick={() => jump('runs', id)}>
              <Activity size={17} />
              <span>
                运行记录
                <small>
                  近 24 小时执行{' '}
                  {compact(runs.filter((r) => r.time > w.now - days).length)} 次
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => jump('alerts', id)}>
              <Bell size={17} />
              <span>
                关联告警<small>{alerts.length} 条尚未解决</small>
              </span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        {!app.demo && (
          <div className="sd-section">
            <button
              className="sd-btn"
              onClick={() => setDialog({ type: 'rotate', id })}
            >
              <KeyRound size={14} />
              重置接入密钥
            </button>
          </div>
        )}
      </div>
    )
  } else if (d.type === 'incident') {
    const incident = w.alerts.find((a) => a.id === id),
      source = w.apps.find((a) => a.id === incident?.appId)
    if (incident && source) {
      const related = incident.cause.startsWith('run:')
        ? w.runs.find((r) => r.id === incident.cause.slice(4))
        : undefined
      const update = (state: 'ack' | 'resolved') =>
        void act(async () => {
          await api('alerts/' + id, { state })
          await refreshAfter()
          notify('告警已' + (state === 'ack' ? '开始跟进' : '标记解决'))
          close()
        })
      content = (
        <>
          <div className="sd-body">
            <div
              className={
                'sd-large-icon ' +
                (incident.level === 'error' ? 'sd-red' : 'sd-amber')
              }
            >
              <Bell size={25} />
            </div>
            <h3>{incident.title}</h3>
            <p className="sd-copy">{incident.detail}</p>
            <Meta
              items={[
                ['处理状态', stateName[incident.state]],
                ['告警级别', incident.level === 'error' ? '严重' : '警告'],
                ['发生时间', stamp(incident.time)],
                [
                  '所属程序',
                  <button
                    className="sd-link"
                    onClick={() => setDialog({ type: 'detail', id: source.id })}
                  >
                    {source.name}
                    <ChevronRight size={14} />
                  </button>,
                ],
              ]}
            />
            <div className="sd-section">
              <button
                className="sd-btn"
                onClick={() =>
                  related
                    ? setDialog({ type: 'run', id: related.id })
                    : jump('runs', source.id)
                }
              >
                <FileText size={14} />
                {related ? '查看关联任务' : '查看程序运行记录'}
              </button>
            </div>
          </div>
          {incident.state !== 'resolved' && (
            <footer className="sd-foot">
              {incident.state === 'open' && (
                <button
                  className="sd-btn"
                  disabled={busy}
                  onClick={() => update('ack')}
                >
                  开始跟进
                </button>
              )}
              <button
                className="sd-btn sd-primary"
                disabled={busy}
                onClick={() => update('resolved')}
              >
                <Check size={15} />
                标记已解决
              </button>
            </footer>
          )}
        </>
      )
    }
  } else if (d.type === 'run') {
    const run = w.runs.find((r) => r.id === id),
      source = w.apps.find((a) => a.id === run?.appId)
    if (run && source) {
      const alert = w.alerts.find((a) => a.cause === 'run:' + id)
      content = (
        <div className="sd-body">
          <div
            className={
              'sd-large-icon ' +
              (run.status === 'success' ? 'sd-green' : 'sd-red')
            }
          >
            <ListChecks size={25} />
          </div>
          <h3>{run.title}</h3>
          <Meta
            items={[
              ['执行结果', run.status === 'success' ? '成功' : '失败'],
              ['上报时间', stamp(run.time)],
              [
                '执行耗时',
                (run.duration / 1000).toLocaleString('zh-CN', {
                  maximumFractionDigits: 3,
                }) + ' 秒',
              ],
              [
                '所属程序',
                <button
                  className="sd-link"
                  onClick={() => setDialog({ type: 'detail', id: run.appId })}
                >
                  {source.name}
                  <ChevronRight size={14} />
                </button>,
              ],
              ['记录 ID', <code>{run.id}</code>],
            ]}
          />
          <div className="sd-section">
            <h4>执行消息</h4>
            <div className="sd-message">
              {run.message || '程序未附带执行消息。'}
            </div>
          </div>
          {alert && (
            <div className="sd-section">
              <button
                className="sd-btn"
                onClick={() => setDialog({ type: 'incident', id: alert.id })}
              >
                <Bell size={14} />
                查看关联告警
              </button>
            </div>
          )}
        </div>
      )
    }
  }
  return (
    <Shell
      title={titles[d.type]}
      drawer={d.type === 'detail'}
      locked={busy}
      close={close}
    >
      {error && (
        <div className="sd-error" role="alert">
          {error}
        </div>
      )}
      {content ?? (
        <div className="sd-body sd-copy">
          <Clock3 size={16} /> 暂未找到这条记录。
        </div>
      )}
    </Shell>
  )
}

export function Dialogs(props: DialogProps) {
  if (!props.dialog) return null
  return (
    <Body
      key={props.dialog.type + ('id' in props.dialog ? props.dialog.id : '')}
      {...props}
      dialog={props.dialog}
    />
  )
}

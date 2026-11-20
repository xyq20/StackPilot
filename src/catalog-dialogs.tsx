import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  Armchair,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Files,
  MessageSquare,
  Pencil,
  Plus,
  Settings2,
  Tag,
  X,
} from 'lucide-react'
import {
  api,
  kindName,
  modeName,
  stamp,
  stateName,
  type App,
  type Workspace,
  type View,
} from './model'
import { ProgramIcon } from './visuals'
import type { Dialog } from './dialogs'
import {
  currentRelease,
  distributionUrl,
  ProjectEditor,
  ProjectInfo,
  releaseOwner,
} from './project-info'
import './catalog-dialogs.css'

export type CatalogDialog = {
  type:
    | 'asset'
    | 'project-edit'
    | 'catalog-edit'
    | 'release-new'
    | 'feedback-new'
    | 'feedback-detail'
    | 'release-detail'
  id: string
  closeOnSave?: boolean
}
export type CatalogDialogProps = {
  dialog: CatalogDialog | null
  setDialog: (dialog: CatalogDialog | null) => void
  w: Workspace
  refresh: () => void | Promise<void>
  notify: (message: string) => void
  go: (view: View, id?: string) => void
  advanced: (dialog: NonNullable<Dialog>) => void
}

const titles = {
  asset: '工具档案',
  'catalog-edit': '编辑维护资料',
  'project-edit': '编辑项目配置',
  'release-new': '登记本地版本',
  'feedback-new': '登记反馈',
  'feedback-detail': '反馈详情',
  'release-detail': '版本详情',
}

function DialogFrame({
  title,
  close,
  busy,
  drawer,
  children,
}: {
  title: string
  close: () => void
  busy: boolean
  drawer: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useId()
  useEffect(() => {
    const node = ref.current
    node?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      node?.close()
      document.body.style.overflow = overflow
    }
  }, [])
  return (
    <dialog
      className={'cd-dialog' + (drawer ? ' cd-drawer' : '')}
      ref={ref}
      aria-labelledby={heading}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) close()
      }}
      onClick={(e) => {
        if (busy || e.target !== e.currentTarget) return
        const box = e.currentTarget.getBoundingClientRect()
        if (
          e.clientY < box.top ||
          e.clientY > box.bottom ||
          e.clientX < box.left ||
          e.clientX > box.right
        )
          close()
      }}
    >
      <header className="cd-head">
        <h2 id={heading}>{title}</h2>
        <button
          className="cd-icon"
          type="button"
          aria-label="关闭窗口"
          disabled={busy}
          onClick={close}
        >
          <X size={17} />
        </button>
      </header>
      {children}
    </dialog>
  )
}

function ToolIdentity({ app }: { app: App }) {
  return (
    <div className="cd-identity">
      <ProgramIcon app={app} />
      <div>
        <h3>{app.name}</h3>
        <small>{app.id}</small>
      </div>
    </div>
  )
}

function Facts({ entries }: { entries: [string, ReactNode][] }) {
  return (
    <dl className="cd-facts">
      {entries.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function FormFooter({
  busy,
  cancel,
  action,
}: {
  busy: boolean
  cancel: () => void
  action: string
}) {
  return (
    <footer className="cd-footer">
      <button type="button" disabled={busy} onClick={cancel} className="cd-btn">
        取消
      </button>
      <button type="submit" disabled={busy} className="cd-btn cd-main">
        {busy ? '正在保存…' : action}
      </button>
    </footer>
  )
}

function External({ url, children }: { url: string; children: ReactNode }) {
  if (!/^https?:\/\//i.test(url) && !/^\/demo\/[\w./-]+$/.test(url)) return null
  return (
    <a href={url} className="cd-btn" target="_blank" rel="noopener noreferrer">
      {children}
      <ExternalLink size={14} />
    </a>
  )
}

function Asset({
  app,
  w,
  setDialog,
  advanced,
  go,
  sync,
  busy,
}: {
  app: App
  w: Workspace
  setDialog: CatalogDialogProps['setDialog']
  advanced: CatalogDialogProps['advanced']
  go: CatalogDialogProps['go']
  sync: () => void
  busy: boolean
}) {
  const [tab, setTab] = useState<'info' | 'versions' | 'feedback'>('info')
  const releases = w.releases
    .filter((item) => item.appId === releaseOwner(app))
    .sort((a, b) => b.time - a.time)
  const feedback = w.feedback
    .filter((item) => item.appId === app.id)
    .sort((a, b) => b.time - a.time)
  const current = currentRelease(app, releases)
  const parent = w.apps.find((a) => a.id === app.project.parentId)
  const publisher = app.project.form === 'module' ? parent : app
  const distribution = distributionUrl(publisher)
  const open = (type: CatalogDialog['type'], id = app.id) =>
    setDialog({ type, id })
  const openAdvanced = (type: 'detail' | 'edit') => {
    setDialog(null)
    advanced({ type, id: app.id })
  }
  return (
    <div className="cd-body">
      <div className="cd-summary">
        <ToolIdentity app={app} />
        <span
          className={
            'cd-badge ' + (app.lifecycle === 'archived' ? 'cd-quiet' : '')
          }
        >
          {app.lifecycle === 'archived' ? '已归档' : '在用'}
        </span>
      </div>
      {app.description && <p className="cd-description">{app.description}</p>}
      <div className="cd-actions">
        {distribution && (
          <External url={distribution}>
            {parent ? '工具箱分发入口' : '打开分发入口'}
          </External>
        )}
        {app.project.form !== 'module' && (
          <button
            className="cd-btn cd-main"
            onClick={() => open('release-new')}
          >
            <Plus size={14} />
            登记本地版本
          </button>
        )}
        <button className="cd-btn" onClick={() => open('feedback-new')}>
          <MessageSquare size={14} />
          登记反馈
        </button>
        {app.url ? (
          <External url={app.url}>打开工作台</External>
        ) : current?.url && !distribution ? (
          <External url={current.url}>打开当前版本</External>
        ) : null}
      </div>
      {w.officeSeats.some((s) => s.appIds.includes(app.id)) && (
        <div className="office-return">
          <Armchair size={14} />
          <span>工作间定位</span>
          {w.officeSeats
            .filter((s) => s.appIds.includes(app.id))
            .map((s) => (
              <a
                key={s.id}
                className="cd-text"
                href={'#office?seat=' + s.id}
                onClick={() => setDialog(null)}
              >
                {s.id}
                {s.name ? ' · ' + s.name : ''}
                <ChevronRight size={12} />
              </a>
            ))}
        </div>
      )}
      <div className="cd-tabs" role="group" aria-label="档案内容">
        {(
          [
            ['info', '维护资料'],
            ['versions', '版本记录'],
            ['feedback', '反馈记录'],
          ] as const
        ).map(([key, label]) => (
          <button
            className={tab === key ? 'cd-on' : ''}
            aria-pressed={tab === key}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
            {key !== 'info' && (
              <small>
                {key === 'versions' ? releases.length : feedback.length}
              </small>
            )}
          </button>
        ))}
      </div>
      {tab === 'info' && (
        <>
          <ProjectInfo
            app={app}
            w={w}
            asset={(id) => open('asset', id)}
            edit={() => open('project-edit')}
            busy={busy}
            sync={sync}
            chats={() => {
              setDialog(null)
              go('chats', app.id)
            }}
          />
          <div className="cd-section-title">
            <h4>基本资料</h4>
            <button className="cd-text" onClick={() => openAdvanced('edit')}>
              <Pencil size={13} />
              编辑基本信息
            </button>
          </div>
          <Facts
            entries={[
              ['使用团队', app.owner || '尚未填写'],
              ['工具类别', kindName[app.kind]],
              ['运行方式', modeName[app.mode]],
              [
                parent ? '工具箱版本' : '当前版本',
                current ? (
                  <button
                    className="cd-text"
                    onClick={() => open('release-detail', current.id)}
                  >
                    {current.version}
                    <ChevronRight size={13} />
                  </button>
                ) : (
                  '暂无版本记录'
                ),
              ],
              ['本机目录', app.folder || '尚未登记'],
              ['工作台地址', app.url || '尚未登记'],
            ]}
          />
          <div className="cd-section-title">
            <h4>使用说明与维护状态</h4>
            <button className="cd-text" onClick={() => open('catalog-edit')}>
              <Pencil size={13} />
              编辑维护资料
            </button>
          </div>
          <p className={'cd-prose' + (app.usage ? '' : ' cd-muted')}>
            {app.usage || '可在维护资料中补充使用场景、操作步骤和注意事项。'}
          </p>
          <div className="cd-section-title">
            <h4>接入配置</h4>
          </div>
          <div className="cd-actions">
            <button className="cd-btn" onClick={() => openAdvanced('detail')}>
              <Settings2 size={14} />
              查看接入与运行详情
            </button>
          </div>
        </>
      )}
      {tab === 'versions' && (
        <div className="cd-list">
          {parent && <p className="prj-muted">以下为 {parent.name} 的版本。</p>}
          {releases.map((r) => (
            <button key={r.id} onClick={() => open('release-detail', r.id)}>
              <span className="cd-listicon">
                <Tag size={16} />
              </span>
              <span className="cd-listtext">
                <strong>
                  {r.version}
                  {r.id === current?.id && <em>当前版本</em>}{' '}
                  <em>{r.github ? 'GitHub 正式版' : '本地记录'}</em>
                </strong>
                <small>
                  {stamp(r.time)} · {r.notes || '无更新说明'}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!releases.length && (
            <div className="cd-empty">
              <Files size={22} />
              尚无版本记录
            </div>
          )}
        </div>
      )}
      {tab === 'feedback' && (
        <div className="cd-list">
          {feedback.map((f) => (
            <button key={f.id} onClick={() => open('feedback-detail', f.id)}>
              <span className="cd-listicon">
                <MessageSquare size={16} />
              </span>
              <span className="cd-listtext">
                <strong>{f.title}</strong>
                <small>
                  {stateName[f.state]} · {f.reporter || '未填写反馈人'} ·{' '}
                  {stamp(f.time)}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
          {!feedback.length && (
            <div className="cd-empty">
              <ClipboardList size={22} />
              尚无反馈记录
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type Data = Record<string, string>
function dataFrom(e: FormEvent<HTMLFormElement>): Data {
  e.preventDefault()
  return Object.fromEntries(
    Array.from(new FormData(e.currentTarget), ([key, value]) => [
      key,
      String(value).trim(),
    ]),
  )
}

function EntryForm({
  mode,
  id,
  w,
  busy,
  submit,
  cancel,
  register,
}: {
  mode: 'release-new' | 'feedback-new'
  id: string
  w: Workspace
  busy: boolean
  submit: (data: Data) => void
  cancel: () => void
  register: () => void
}) {
  const release = mode === 'release-new'
  const eligible = release
    ? w.apps.filter((a) => a.project.form !== 'module')
    : w.apps
  const [appId, setAppId] = useState(
    eligible.find((a) => a.id === id)?.id || eligible[0]?.id || '',
  )
  const [version, setVersion] = useState('')
  const optionsId = useId()
  const chosen = w.apps.find((a) => a.id === appId)
  const versions = w.releases.filter(
    (r) => r.appId === (chosen ? releaseOwner(chosen) : appId),
  )
  if (!eligible.length)
    return (
      <div className="cd-body">
        <p className="cd-description">先登记一个工具，再添加版本和反馈。</p>
        <button className="cd-btn cd-main" onClick={register}>
          登记工具
        </button>
      </div>
    )
  return (
    <form onSubmit={(e) => submit(dataFrom(e))}>
      <div className="cd-body cd-fields">
        {release && (
          <p className="prj-muted">
            记录将保存到本机台账。正式分发请在 GitHub Releases 完成。
          </p>
        )}
        <label>
          所属工具
          <select
            name="appId"
            required
            value={appId}
            onChange={(e) => {
              setAppId(e.target.value)
              setVersion('')
            }}
          >
            {eligible.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          {release ? '版本号' : '涉及版本（选填）'}
          <input
            name="version"
            required={release}
            placeholder={release ? '例如 v1.2.0' : '选择或填写版本号'}
            maxLength={64}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            list={release ? undefined : optionsId}
          />
          {!release && (
            <datalist id={optionsId}>
              {versions.map((r) => (
                <option key={r.id} value={r.version} />
              ))}
            </datalist>
          )}
        </label>
        {release ? (
          <>
            <label>
              更新说明
              <textarea
                name="notes"
                required
                maxLength={4000}
                rows={4}
                placeholder="记录此次更新和需要同事留意的变化"
              />
            </label>
            <label>
              下载或使用地址（选填）
              <input
                name="url"
                inputMode="url"
                maxLength={2048}
                placeholder="https://… 或 /demo/ 下的工具地址"
              />
            </label>
          </>
        ) : (
          <>
            <label>
              反馈标题
              <input
                name="title"
                required
                maxLength={120}
                placeholder="简要描述问题或建议"
              />
            </label>
            <label>
              反馈人（选填）
              <input name="reporter" maxLength={60} placeholder="姓名或团队" />
            </label>
            <label>
              反馈内容（选填）
              <textarea
                name="detail"
                maxLength={4000}
                rows={4}
                placeholder="记录使用场景、操作步骤或期望结果"
              />
            </label>
          </>
        )}
      </div>
      <FormFooter
        cancel={cancel}
        busy={busy}
        action={release ? '保存本地记录' : '保存反馈'}
      />
    </form>
  )
}

function Content({
  go,
  dialog,
  setDialog,
  advanced,
  w,
  refresh,
  notify,
}: CatalogDialogProps & { dialog: CatalogDialog }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const { id, type } = dialog
  const record =
    type === 'release-detail' ? w.releases.find((r) => r.id === id) : undefined
  const feedback =
    type === 'feedback-detail' ? w.feedback.find((f) => f.id === id) : undefined
  const appId = record?.appId || feedback?.appId || id
  const app = w.apps.find((a) => a.id === appId)
  const close = () => setDialog(null)
  const back = () => setDialog(app ? { type: 'asset', id: app.id } : null)
  async function save(
    path: string,
    data: unknown,
    message: string,
    next: CatalogDialog | null,
  ) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await api(path, data)
      try {
        await refresh()
        notify(message)
      } catch {
        notify(message + '，请刷新页面查看最新记录')
      }
      setDialog(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  let content: ReactNode
  if (type === 'asset' && app) {
    content = (
      <Asset
        app={app}
        w={w}
        setDialog={setDialog}
        advanced={advanced}
        go={go}
        busy={busy}
        sync={() =>
          void save(
            'apps/' + id + '/github-sync',
            {},
            '已读取 GitHub 最新正式版',
            dialog,
          )
        }
      />
    )
  } else if (type === 'project-edit' && app) {
    content = (
      <ProjectEditor
        app={app}
        apps={w.apps}
        busy={busy}
        cancel={back}
        save={(data) =>
          void save('apps/' + id + '/project', data, '项目配置已保存', {
            type: 'asset',
            id,
          })
        }
      />
    )
  } else if (type === 'catalog-edit' && app) {
    content = (
      <form
        onSubmit={(e) => {
          const data = dataFrom(e)
          void save('apps/' + id + '/catalog', data, '维护资料已更新', {
            type: 'asset',
            id,
          })
        }}
      >
        <div className="cd-body cd-fields">
          <ToolIdentity app={app} />
          <div className="cd-pair">
            <label>
              运行方式
              <select name="mode" defaultValue={app.mode}>
                {Object.entries(modeName).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              维护状态
              <select name="lifecycle" defaultValue={app.lifecycle}>
                <option value="active">在用</option>
                <option value="archived">已归档</option>
              </select>
            </label>
          </div>
          <label>
            使用说明
            <textarea
              name="usage"
              rows={6}
              defaultValue={app.usage}
              maxLength={4000}
              placeholder="适用场景、运行步骤与维护注意事项"
            />
          </label>
        </div>
        <FormFooter busy={busy} cancel={back} action="保存资料" />
      </form>
    )
  } else if (type === 'release-new' || type === 'feedback-new') {
    content = (
      <EntryForm
        mode={type}
        id={id}
        w={w}
        busy={busy}
        cancel={back}
        register={() => {
          close()
          advanced({ type: 'register' })
        }}
        submit={(data) => {
          const isRelease = type === 'release-new'
          void save(
            isRelease ? 'releases' : 'feedback',
            data,
            isRelease ? '本地版本已登记' : '反馈已登记',
            dialog.closeOnSave ? null : { type: 'asset', id: data.appId },
          )
        }}
      />
    )
  } else if (record && app) {
    content = (
      <div className="cd-body">
        <ToolIdentity app={app} />
        <div className="cd-section-title">
          <h3>{record.version}</h3>
        </div>
        <Facts
          entries={[
            ['版本来源', record.github ? 'GitHub 正式版' : '本地记录'],
            [record.github ? '发布时间' : '登记时间', stamp(record.time)],
          ]}
        />
        <div className="cd-section-title">
          <h4>更新说明</h4>
        </div>
        <p className="cd-prose">{record.notes || '此版本未附更新说明。'}</p>
        <div className="cd-actions">
          {record.url && <External url={record.url}>打开版本地址</External>}
          <button className="cd-text" onClick={back}>
            <ArrowLeft size={14} />
            返回工具档案
          </button>
        </div>
      </div>
    )
  } else if (feedback && app) {
    content = (
      <>
        <div className="cd-body">
          <ToolIdentity app={app} />
          <div className="cd-section-title">
            <h3>{feedback.title}</h3>
          </div>
          <Facts
            entries={[
              ['处理状态', stateName[feedback.state]],
              ['反馈人', feedback.reporter || '未填写'],
              ['涉及版本', feedback.version || '未指定'],
              ['登记时间', stamp(feedback.time)],
            ]}
          />
          <div className="cd-section-title">
            <h4>反馈内容</h4>
          </div>
          <p className="cd-prose">{feedback.detail || '未补充详细描述。'}</p>
          <button className="cd-text" onClick={back}>
            <ArrowLeft size={14} />
            返回工具档案
          </button>
        </div>
        {feedback.state !== 'resolved' && (
          <footer className="cd-footer">
            {feedback.state === 'open' && (
              <button
                className="cd-btn"
                disabled={busy}
                onClick={() =>
                  void save(
                    'feedback/' + id,
                    { state: 'ack' },
                    '反馈已开始跟进',
                    dialog,
                  )
                }
              >
                开始跟进
              </button>
            )}
            <button
              className="cd-btn cd-main"
              disabled={busy}
              onClick={() =>
                void save(
                  'feedback/' + id,
                  { state: 'resolved' },
                  '反馈已解决',
                  dialog,
                )
              }
            >
              标记已解决
            </button>
          </footer>
        )}
      </>
    )
  }
  return (
    <DialogFrame
      title={titles[type]}
      drawer={type === 'asset'}
      busy={busy}
      close={close}
    >
      {error && (
        <div className="cd-error" role="alert">
          {error}
        </div>
      )}
      {content ?? (
        <div className="cd-body">
          <p className="cd-description">当前记录已经不可用。</p>
          <button className="cd-btn" onClick={close}>
            返回 <ArrowRight size={13} />
          </button>
        </div>
      )}
    </DialogFrame>
  )
}

export function CatalogDialogs(props: CatalogDialogProps) {
  return props.dialog ? (
    <Content
      key={props.dialog.type + ':' + props.dialog.id}
      {...props}
      dialog={props.dialog}
    />
  ) : null
}

import { useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Copy,
  ChevronRight,
  ExternalLink,
  FolderTree,
  Github,
  MessagesSquare,
  Monitor,
  Pencil,
  RefreshCw,
} from 'lucide-react'
import { type App, type ChatLink, type Release, type Workspace } from './model'
import { matchRemoteControl, rememberChatUse, threadUrl } from './chat-links'

export const formNames = {
  toolbox: '工具箱',
  module: '子工具',
  remote: '独立电脑',
  other: '独立项目',
}
export const sourceLabels = {
  manual: '自建项目',
  reference: '仓库参考',
  demo: '示例',
}
export const releaseOwner = (app: App) =>
  app.project.form === 'module' ? app.project.parentId : app.id
export function distributionUrl(app?: App) {
  if (!app) return ''
  return (
    app.project.releaseUrl ||
    (/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i.test(app.project.repo)
      ? app.project.repo.replace(/\/$/, '') + '/releases'
      : '')
  )
}
export function currentRelease(app: App, releases: Release[]) {
  const candidates = releases.filter((r) => r.appId === releaseOwner(app))
  // When official releases are synchronized, the GitHub channel is authoritative.
  return candidates.find((r) => r.github) || candidates[0]
}

type ProjectData = Omit<App['project'], 'source'>
export function ProjectEditor({
  app,
  apps,
  busy,
  save,
  cancel,
}: {
  app: App
  apps: App[]
  busy: boolean
  save: (data: ProjectData) => void
  cancel: () => void
}) {
  const [form, setForm] = useState(app.project.form)
  const parents = apps.filter(
    (a) => a.id !== app.id && a.project.form === 'toolbox',
  )
  const children = apps.some((a) => a.project.parentId === app.id)
  const [parentId, setParent] = useState(app.project.parentId)
  const selectedParent = parents.find((a) => a.id === parentId)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        const text = (key: string) => String(data.get(key) ?? '').trim()
        save({
          form,
          parentId: form === 'module' ? parentId : '',
          repo: text('repo'),
          releaseUrl: text('releaseUrl'),
          machine: text('machine'),
          remoteUrl: text('remoteUrl'),
          remoteNote: text('remoteNote'),
        })
      }}
    >
      <div className="cd-body cd-fields">
        <h3>{app.name}</h3>
        <label>
          项目形态
          <select
            value={form}
            onChange={(e) => setForm(e.target.value as ProjectData['form'])}
          >
            {Object.entries(formNames).map(([key, label]) => (
              <option
                key={key}
                value={key}
                disabled={
                  (children && key !== 'toolbox') ||
                  (!parents.length && key === 'module')
                }
              >
                {label}
              </option>
            ))}
          </select>
        </label>
        {form === 'module' && (
          <label>
            所属工具箱
            <select
              value={parentId}
              onChange={(e) => setParent(e.target.value)}
              required
            >
              <option value="">选择工具箱</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {form === 'module' ? (
          <div className="prj-inherit">
            <FolderTree size={16} />
            <span>
              源码、正式版本和分发入口随{selectedParent?.name || '所属工具箱'}
              维护。
            </span>
          </div>
        ) : (
          <>
            <label>
              源码仓库
              <input
                name="repo"
                defaultValue={
                  app.project.form === 'module' ? '' : app.project.repo
                }
                maxLength={2048}
                placeholder="GitHub owner/repo 或仓库网址"
              />
            </label>
            <label>
              版本分发入口
              <input
                name="releaseUrl"
                type="url"
                defaultValue={
                  app.project.form === 'module' ? '' : app.project.releaseUrl
                }
                maxLength={2048}
                placeholder="https://github.com/owner/repo/releases"
              />
            </label>
          </>
        )}
        <label>
          运行电脑别名
          <input
            name="machine"
            maxLength={160}
            defaultValue={app.project.machine}
            placeholder="例如 仓储组电脑"
          />
        </label>
        <label>
          远程入口
          <input
            name="remoteUrl"
            maxLength={2048}
            defaultValue={app.project.remoteUrl}
            placeholder="HTTPS 地址或 RustDesk、AnyDesk 连接链接"
          />
        </label>
        <label>
          远程使用说明
          <textarea
            name="remoteNote"
            rows={3}
            maxLength={2000}
            defaultValue={app.project.remoteNote}
            placeholder="连接方式、值班联系人和运行注意事项"
          />
        </label>
      </div>
      <footer className="cd-footer">
        <button
          type="button"
          className="cd-btn"
          disabled={busy}
          onClick={cancel}
        >
          取消
        </button>
        <button className="cd-btn cd-main" disabled={busy} type="submit">
          {busy ? '正在保存…' : '保存项目配置'}
        </button>
      </footer>
    </form>
  )
}
function ProjectChat({ link, app }: { link: ChatLink; app: App }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>(
    'idle',
  )
  const local = link.location === 'local'
  const machine = local ? '本机' : link.machine || '来源电脑'
  const title = link.title || 'Codex 会话'
  const url = threadUrl(link.threadId)
  const remoteUrl = local ? null : matchRemoteControl(link, app)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      rememberChatUse(link, 'copy')
      setCopyState('copied')
    } catch {
      setCopyState('manual')
    }
  }
  return (
    <article className="prj-chat-card">
      <div className="prj-chat-line">
        <MessagesSquare size={16} aria-hidden="true" />
        <div className="prj-chat-name">
          {local ? (
            <a href={url} title={'在本机打开 ' + title} onClick={()=>rememberChatUse(link,'open')}>
              {title}
              <ArrowUpRight size={12} />
            </a>
          ) : (
            <strong>{title}</strong>
          )}
          {link.cwd && <small title={link.cwd}>{link.cwd}</small>}
        </div>
        <span
          className={'prj-device' + (local ? '' : ' remote')}
          title={machine}
        >
          <Monitor size={11} />
          <span>{machine}</span>
        </span>
      </div>
      {!local && (
        <>
          <div className="prj-chat-actions">
            <button
              className="cd-text"
              type="button"
              onClick={() => void copy()}
            >
              {copyState === 'copied' ? (
                <Check size={13} />
              ) : (
                <Copy size={13} />
              )}
              <span aria-live="polite">
                {copyState === 'copied' ? '已复制链接' : '复制会话链接'}
              </span>
            </button>
            {remoteUrl && (
              <a
                className="cd-text"
                href={remoteUrl}
                onClick={()=>rememberChatUse(link,'remote')}
                target="_blank"
                rel="noopener noreferrer"
              >
                远控 {machine}
                <ArrowUpRight size={12} />
              </a>
            )}
          </div>
          <p className="prj-remote-hint">
            {remoteUrl ? '连接后在' : '请在'}「{machine}」打开复制的会话链接。
          </p>
          {copyState === 'manual' && (
            <label className="prj-copy-fallback">
              复制下方链接
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                autoFocus
              />
            </label>
          )}
        </>
      )}
    </article>
  )
}

export function ProjectInfo({
  app,
  w,
  edit,
  asset,
  chats,
  sync,
  busy,
}: {
  app: App
  w: Workspace
  edit: () => void
  asset: (id: string) => void
  chats: () => void
  sync: () => void
  busy: boolean
}) {
  const p = app.project,
    parent = w.apps.find((a) => a.id === p.parentId),
    members = w.apps.filter((a) => a.project.parentId === app.id)
  const publisher = p.form === 'module' ? parent : app
  const repo = publisher?.project.repo,
    distribute = distributionUrl(publisher)
  const links = w.chatLinks.filter((l) => l.appId === app.id)
  const github = repo && /^https:\/\/github\.com\//i.test(repo)
  return (
    <>
      <div className="cd-section-title">
        <h4>项目配置</h4>
        <button className="cd-text" onClick={edit}>
          <Pencil size={13} />
          编辑项目配置
        </button>
      </div>
      <dl className="cd-facts">
        <div>
          <dt>项目形态</dt>
          <dd>
            {formNames[p.form]} · {sourceLabels[p.source]}
          </dd>
        </div>
        {parent && (
          <div>
            <dt>所属工具箱</dt>
            <dd>
              <button className="cd-text" onClick={() => asset(parent.id)}>
                {parent.name}
                <ChevronRight size={13} />
              </button>
            </dd>
          </div>
        )}
        {p.form === 'toolbox' && (
          <div>
            <dt>子工具</dt>
            <dd className="prj-members">
              {members.length
                ? members.map((a) => (
                    <button
                      className="cd-text"
                      key={a.id}
                      onClick={() => asset(a.id)}
                    >
                      <FolderTree size={13} />
                      {a.name}
                    </button>
                  ))
                : '尚未关联'}
            </dd>
          </div>
        )}
        {(p.form === 'remote' || p.machine) && (
          <div>
            <dt>运行电脑</dt>
            <dd>{p.machine || '尚未填写'}</dd>
          </div>
        )}
        {(p.form === 'remote' || p.remoteUrl) && (
          <div>
            <dt>远程入口</dt>
            <dd>
              {p.remoteUrl ? (
                <a
                  className="cd-text"
                  href={p.remoteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Monitor size={14} />
                  打开远程连接
                  <ArrowUpRight size={13} />
                </a>
              ) : (
                '尚未配置'
              )}
            </dd>
          </div>
        )}
      </dl>
      {p.remoteNote && <p className="cd-prose">{p.remoteNote}</p>}
      <div className="cd-section-title">
        <h4>源码与分发</h4>
        {github && p.form !== 'module' && (
          <button className="cd-text" onClick={sync} disabled={busy}>
            <RefreshCw size={13} />
            {busy ? '正在读取…' : '同步正式版'}
          </button>
        )}
      </div>
      {parent && (
        <div className="prj-inherit">
          <FolderTree size={15} />
          使用 {parent.name} 的版本和分发入口。
        </div>
      )}
      <div className="prj-linkrow">
        {repo && (
          <a
            className="cd-btn"
            href={repo}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github size={14} />
            源码仓库
            <ExternalLink size={12} />
          </a>
        )}
        {distribute && (
          <a
            className="cd-btn"
            href={distribute}
            target="_blank"
            rel="noopener noreferrer"
          >
            {distribute.startsWith('https://github.com/') &&
            /\/releases(?:\/|$)/.test(distribute)
              ? 'GitHub Releases'
              : '版本分发'}
            <ExternalLink size={12} />
          </a>
        )}
        {!repo && !distribute && (
          <span className="cd-muted">尚未配置源码或分发入口。</span>
        )}
      </div>
      <div className="cd-section-title">
        <h4>
          Codex 会话 <small>{links.length}</small>
        </h4>
        <button className="cd-text" onClick={chats}>
          <MessagesSquare size={14} />
          在其他电脑关联
          <ChevronRight size={13} />
        </button>
      </div>
      {links.length ? (
        <div className="prj-chats">
          {links.map((l) => (
            <ProjectChat key={l.id} link={l} app={app} />
          ))}
        </div>
      ) : (
        <p className="prj-muted">尚未关联会话</p>
      )}
    </>
  )
}

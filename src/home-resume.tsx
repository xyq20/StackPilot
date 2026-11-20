import { useEffect, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Download,
  Folder,
  Link2,
  MessagesSquare,
  Monitor,
  TerminalSquare,
} from 'lucide-react'
import { api, stamp, type ChatLink, type View, type Workspace } from './model'
import {
  chatUses,
  lastChatUse,
  matchRemoteControl,
  observeChatUses,
  rememberChatUse,
  threadUrl,
  type ChatUse,
} from './chat-links'
import './home-resume.css'
import { ToolboxArt } from './toolbox-art'

type Props = { w: Workspace; go: (view: View, id?: string) => void }
type Thread = Pick<ChatLink, 'threadId' | 'title' | 'cwd'>
type LocalIndex = { threads: Thread[]; available: boolean; total: number }
type Entry = { thread: Thread; link?: ChatLink; detail: string; use?: ChatUse }
const actionLabels = { open: '请求打开', copy: '复制链接', remote: '发起远控' }

export function HomeResume({ w, go }: Props) {
  const [tab, setTab] = useState<'projects' | 'local'>('projects')
  const [history, setHistory] = useState(chatUses)
  const [index, setIndex] = useState<LocalIndex | null>(null),
    [failed, setFailed] = useState(false),
    [retry, refresh] = useState(0)
  const [notice, setNotice] = useState(''),
    [manual, setManual] = useState('')
  useEffect(() => observeChatUses(() => setHistory(chatUses())), [])
  useEffect(() => {
    if (tab !== 'local') return
    let live = true
    setIndex(null)
    setFailed(false)
    api<LocalIndex>('chats?limit=3')
      .then(async (value) => {
        if (!live) return
        const previous = chatUses().find((item) => item.location === 'local')
        if (
          value.available &&
          previous &&
          !value.threads.some((t) => t.threadId === previous.threadId)
        ) {
          const found = await api<LocalIndex>(
            'chats?limit=1&q=' + encodeURIComponent(previous.threadId),
          ).catch(() => null)
          const match = found?.threads.find(
            (t) => t.threadId === previous.threadId,
          )
          if (match)
            value = { ...value, threads: [match, ...value.threads].slice(0, 3) }
        }
        if (live) setIndex(value)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [tab, retry])
  const linked = w.chatLinks
    .map((link) => ({
      thread: link,
      link,
      detail:
        (w.apps.find((a) => a.id === link.appId)?.name || '关联项目') +
        ' · ' +
        (link.location === 'remote' ? link.machine : '本机'),
      use: lastChatUse(history, link),
    }))
    .sort(
      (a, b) =>
        (b.use?.at || 0) - (a.use?.at || 0) ||
        a.detail.localeCompare(b.detail, 'zh-CN') ||
        a.thread.title.localeCompare(b.thread.title, 'zh-CN'),
    )
  const entries: Entry[] =
    tab === 'projects'
      ? linked.slice(0, 3)
      : (index?.threads ?? [])
          .map((thread) => ({
            thread,
            detail:
              thread.cwd.split(/[\\/]/).filter(Boolean).at(-1) || '本机 Codex',
            use: lastChatUse(history, thread),
          }))
          .sort((a, b) => (b.use?.at || 0) - (a.use?.at || 0))
  const projectCount = new Set(w.chatLinks.map((link) => link.appId)).size
  function select(next: typeof tab) {
    setTab(next)
    setManual('')
    setNotice('')
  }
  async function copy(link: ChatLink) {
    const url = threadUrl(link.threadId)
    try {
      await navigator.clipboard.writeText(url)
      rememberChatUse(link, 'copy')
      setManual('')
      setNotice('链接已复制，请在「' + link.machine + '」打开。')
    } catch {
      setNotice('请复制此链接，在「' + link.machine + '」打开。')
      setManual(url)
    }
  }
  // This shortcut needs only the technical ID. Unassociated chat titles stay
  // private until the local tab is explicitly selected.
  const recent = history.find(
    (item) =>
      item.location === 'local' ||
      w.chatLinks.some(
        (link) =>
          link.id === item.linkId &&
          link.threadId === item.threadId &&
          link.location === 'remote',
      ),
  )
  const resume = tab === 'projects' ? recent : undefined
  const resumeLink =
    resume &&
    (w.chatLinks.find(
      (l) =>
        l.id === resume.linkId &&
        l.location === resume.location &&
        l.threadId === resume.threadId,
    ) ||
      (resume.location === 'local'
        ? w.chatLinks.find(
            (l) => l.location === 'local' && l.threadId === resume.threadId,
          )
        : undefined))
  const device =
    resumeLink &&
    matchRemoteControl(
      resumeLink,
      w.apps.find((a) => a.id === resumeLink.appId),
    )
  return (
    <section className="hr-resume" aria-labelledby="hr-title">
      <ToolboxArt />
      <div className="hr-intro">
        <div className="hr-heading">
          <span className="hr-terminal">
            <TerminalSquare size={20} strokeWidth={1.7} />
          </span>
          <h2 id="hr-title">继续上次开发</h2>
        </div>
        <p>
          {resumeLink ? (
            <span title={resumeLink.title}>
              {resumeLink.title} ·{' '}
              {resumeLink.location === 'remote' ? resumeLink.machine : '本机'}
            </span>
          ) : resume ? (
            '上次使用本机会话 · ' + stamp(resume.at)
          ) : projectCount ? (
            projectCount +
            ' 个项目已关联 ' +
            w.chatLinks.length +
            ' 条开发会话。'
          ) : (
            '从其他电脑带回开发会话，按项目继续跟进。'
          )}
        </p>
        <div className="hr-actions">
          {resume?.location === 'local' ? (
            <a
              className="hr-primary"
              href={threadUrl(resume.threadId)}
              onClick={() =>
                rememberChatUse(
                  resumeLink || { threadId: resume.threadId },
                  'open',
                )
              }
            >
              继续上次本机会话 <ArrowUpRight size={15} />
            </a>
          ) : resumeLink?.location === 'remote' ? (
            <button
              className="hr-primary"
              onClick={() => void copy(resumeLink)}
            >
              复制上次会话链接 <Copy size={14} />
            </button>
          ) : tab === 'projects' ? (
            <a className="hr-primary" href="#chats?transfer=1">
              <Link2 size={14} />
              关联另一台电脑 <ChevronRight size={13} />
            </a>
          ) : (
            <a className="hr-primary" href="#chats?tab=local">
              <Monitor size={14} />
              浏览本机会话 <ChevronRight size={13} />
            </a>
          )}
          {device && resumeLink ? (
            <a
              className="hr-minor"
              href={device}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => rememberChatUse(resumeLink, 'remote')}
              aria-label={'远控 ' + resumeLink.machine}
            >
              <Monitor size={13} />
              远控来源电脑 <ArrowUpRight size={13} />
            </a>
          ) : resume && !projectCount ? (
            <a className="hr-minor" href="#chats?transfer=1">
              关联另一台电脑 <ArrowRight size={13} />
            </a>
          ) : (
            <button className="hr-minor" onClick={() => go('chats')}>
              会话管理 <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="hr-index">
        <div className="hr-tabs" role="group" aria-label="首页会话来源">
          <button
            aria-pressed={tab === 'projects'}
            onClick={() => select('projects')}
          >
            <Folder size={13} />
            项目会话 <span>{w.chatLinks.length}</span>
          </button>
          <button
            aria-pressed={tab === 'local'}
            onClick={() => select('local')}
          >
            <Monitor size={13} />
            本机最近
          </button>
        </div>
        {entries.length > 0 ? (
          <div className="hr-entries">
            {entries.map(({ thread, link, detail, use }, i) => {
              const remote = link?.location === 'remote'
              const remoteUrl =
                link &&
                matchRemoteControl(
                  link,
                  w.apps.find((a) => a.id === link.appId),
                )
              const href = threadUrl(thread.threadId)
              return (
                <div key={link?.id || thread.threadId} className="hr-row">
                  <span
                    className={'hr-glyph ' + (remote ? 'away' : '')}
                    aria-hidden="true"
                  >
                    {remote ? (
                      <Monitor size={15} />
                    ) : (
                      <MessagesSquare size={15} />
                    )}
                  </span>
                  <div className="hr-name">
                    <strong title={thread.title}>{thread.title}</strong>
                    <small
                      title={
                        detail +
                        (use
                          ? ' · ' +
                            actionLabels[use.action] +
                            ' ' +
                            stamp(use.at)
                          : '')
                      }
                    >
                      {detail}
                      {use && (
                        <span>
                          {' '}
                          · {actionLabels[use.action]} {stamp(use.at)}
                        </span>
                      )}
                    </small>
                  </div>
                  {link && link.id === resumeLink?.id ? (
                    <button
                      className="hr-open"
                      onClick={() => go('chats', link.appId)}
                      title="查看这个项目的会话关联"
                    >
                      管理 <ChevronRight size={13} />
                    </button>
                  ) : remote ? (
                    <div className="hr-row-actions">
                      <button
                        onClick={() => void copy(link)}
                        aria-label={'复制会话链接 ' + thread.title}
                        title={'复制到 ' + link.machine + ' 打开'}
                      >
                        <Copy size={13} />
                        <span>复制</span>
                      </button>
                      {remoteUrl && (
                        <a
                          href={remoteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={'远控 ' + link.machine}
                          onClick={() => rememberChatUse(link, 'remote')}
                        >
                          <Monitor size={13} />
                          <span>远控</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <a
                      className="hr-open"
                      href={href}
                      onClick={() => rememberChatUse(link || thread, 'open')}
                      aria-label={'打开 ' + thread.title}
                    >
                      {i === 0 && use ? '继续' : '打开'}{' '}
                      <ArrowUpRight size={13} />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        ) : tab === 'projects' ? (
          <div className="hr-empty">
            <div className="hr-device" aria-hidden="true">
              <Monitor size={23} />
            </div>
            <div>
              <strong>还没有关联的项目会话</strong>
              <p>在来源电脑选择对话，再将关联文件导入这里。</p>
              <div className="hr-empty-actions">
                <a href="/api/chat-station/helper.py" download>
                  <Download size={13} />
                  下载异机关联助手
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="hr-local-state">
            <strong>
              {failed
                ? '本机索引读取失败'
                : index === null
                  ? '正在读取本机对话…'
                  : index.available
                    ? '本机索引暂时没有对话'
                    : '未找到本机 Codex 索引'}
            </strong>
            {failed ? (
              <button onClick={() => refresh((n) => n + 1)}>重试</button>
            ) : (
              index && (
                <a href="#chats?transfer=1">
                  导入异机会话 <ArrowRight size={12} />
                </a>
              )
            )}
          </div>
        )}
        {notice && (
          <div className="hr-notice" role="status">
            <Check size={13} />
            {notice}
          </div>
        )}
        {manual && (
          <input
            aria-label="待复制的异机会话链接"
            className="hr-fallback"
            value={manual}
            readOnly
            onFocus={(e) => e.target.select()}
          />
        )}
      </div>
    </section>
  )
}

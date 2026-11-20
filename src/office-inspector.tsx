import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowLeftRight,
  ArrowUpLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Folder,
  MessageSquare,
  Monitor,
  Pencil,
  Search,
  Tag,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { matchRemoteControl, rememberChatUse, threadUrl } from './chat-links'
import {
  relative,
  stateName,
  type App,
  type OfficeSeat,
  type OfficeAction,
  type View,
  type Workspace,
} from './model'
import { getSeatDetails } from './office-state'
import type { CatalogDialog } from './catalog-dialogs'
import type { Dialog } from './dialogs'
import {
  CharacterCard,
  CharacterFields,
  SwapSeat,
} from './office-character-panel'
import './office-inspector.css'

type Props = {
  onBackToScene?: () => void
  seat: OfficeSeat
  lifeText: string
  onAction: (action: OfficeAction, partnerId?: string) => Promise<void>
  w: Workspace
  refresh: () => void | Promise<void>
  open: (d: CatalogDialog) => void
  legacy: (d: NonNullable<Dialog>) => void
  go: (view: View, id?: string) => void
  notify: (message: string) => void
}
type EditorProps = Pick<
  Props,
  'seat' | 'w' | 'refresh' | 'notify' | 'onBackToScene'
> & {
  close: () => void
}
type Draft = {
  name: string
  character: OfficeSeat['character']
  selected: Set<string>
  base: OfficeSeat
}
function initial(seat: OfficeSeat): Draft {
  return {
    name: seat.name,
    character: seat.character,
    selected: new Set(seat.appIds),
    base: seat,
  }
}

function Editor({
  seat,
  w,
  refresh,
  notify,
  close,
  onBackToScene,
}: EditorProps) {
  const [draft, setDraft] = useState(() => initial(seat))
  const [q, search] = useState('')
  const [limit, setLimit] = useState(35)
  const [onlySelected, setOnlySelected] = useState(false)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState('')
  const nameId = useId()
  const changed = seat.revision !== draft.base.revision
  const query = q.trim().toLocaleLowerCase()
  const options = useMemo(
    () =>
      w.apps.filter(
        (a) =>
          (!onlySelected || draft.selected.has(a.id)) &&
          (!query ||
            [a.name, a.id, a.owner, a.project.machine].some((v) =>
              v.toLocaleLowerCase().includes(query),
            )),
      ),
    [w.apps, onlySelected, draft.selected, query],
  )
  function toggle(id: string) {
    setDraft((current) => {
      const selected = new Set(current.selected)
      if (selected.has(id)) selected.delete(id)
      else selected.add(id)
      return { ...current, selected }
    })
  }
  function merge() {
    // Apply this editor's delta on top of the current row, preserving independent changes.
    const before = new Set(draft.base.appIds)
    const merged = new Set(seat.appIds)
    for (const id of before) if (!draft.selected.has(id)) merged.delete(id)
    for (const id of draft.selected) if (!before.has(id)) merged.add(id)
    const original = draft.base.character,
      local = draft.character
    const outfitEdited =
      local.look !== original.look || local.gender !== original.gender
    setDraft({
      character: {
        ...seat.character,
        ...(outfitEdited ? { look: local.look, gender: local.gender } : {}),
        accent:
          local.accent !== original.accent
            ? local.accent
            : seat.character.accent,
        habit:
          local.habit !== original.habit ? local.habit : seat.character.habit,
      },
      name: draft.name === draft.base.name ? seat.name : draft.name,
      selected: merged,
      base: seat,
    })
    setConflict(false)
    setError('')
  }
  async function reload() {
    try {
      await refresh()
    } catch {
      setError('获取最新配置失败。当前草稿已保留，请重试。')
    }
  }
  async function save() {
    if (saving || changed || conflict) return
    setSaving(true)
    setError('')
    try {
      const result = await fetch(
        '/api/office/seats/' + encodeURIComponent(seat.id),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name.trim(),
            appIds: [...draft.selected],
            character: draft.character,
            revision: draft.base.revision,
          }),
        },
      )
      if (result.status === 409) {
        setConflict(true)
        await reload()
        return
      }
      const body = await result.json()
      if (!result.ok) throw Error(body.error || '工位配置未保存')
      try {
        await refresh()
        notify('工位 ' + seat.id + ' 已保存')
      } catch {
        notify('工位 ' + seat.id + ' 已保存，请刷新查看最新配置')
      }
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      className="oi-editor"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="oi-form-top">
        <div className="oi-heading-left">
          {onBackToScene && <BackToScene onClick={onBackToScene} />}
          <h3>配置工位 {seat.id}</h3>
        </div>
        <button
          type="button"
          className="oi-icon"
          aria-label="取消编辑"
          onClick={close}
          disabled={saving}
        >
          <X size={15} />
        </button>
      </div>
      {(changed || conflict) && (
        <div role="status" className="oi-conflict">
          <strong>工位配置已变更，草稿已保留</strong>
          {changed ? (
            <>
              <p>
                最新姓名为「{seat.name || '未填写'}」，已绑定{' '}
                {seat.appIds.length} 个项目。合并后可检查并保存。
              </p>
              <button type="button" onClick={merge}>
                {draft.base.character.id === seat.character.id
                  ? '合并最新配置'
                  : '将草稿应用到新人物'}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void reload()}>
              重新获取最新配置
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="oi-error" role="alert">
          {error}
        </p>
      )}
      <label className="oi-input-label" htmlFor={nameId}>
        工位姓名
      </label>
      <input
        id={nameId}
        className="oi-name-input"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        maxLength={60}
        disabled={saving}
        placeholder="输入姓名即可入场"
      />
      <CharacterFields
        person={draft.character}
        change={(character) =>
          setDraft((current) => ({ ...current, character }))
        }
        disabled={saving}
      />
      <div className="oi-select-head">
        <strong>绑定项目</strong>
        <button
          type="button"
          aria-pressed={onlySelected}
          onClick={() => {
            setOnlySelected(!onlySelected)
            setLimit(35)
          }}
        >
          {onlySelected ? '显示全部' : '只看已选'} · {draft.selected.size}
        </button>
      </div>
      <label className="oi-search">
        <Search size={14} />
        <input
          value={q}
          onChange={(e) => {
            search(e.target.value)
            setLimit(35)
          }}
          placeholder="搜索项目、团队或电脑"
          aria-label="搜索可绑定项目"
        />
      </label>
      <div className="oi-checklist">
        {options.slice(0, limit).map((a) => (
          <label className="oi-check" key={a.id}>
            <input
              type="checkbox"
              disabled={saving}
              checked={draft.selected.has(a.id)}
              onChange={() => toggle(a.id)}
            />
            <span>
              <strong>{a.name}</strong>
              <small>
                {a.owner || a.id}
                {a.lifecycle === 'archived' ? ' · 已归档' : ''}
              </small>
            </span>
          </label>
        ))}
        {!options.length && (
          <p>
            {onlySelected && !draft.selected.size
              ? '还没有选择项目'
              : '没有匹配的项目'}
          </p>
        )}
        {options.length > limit && (
          <button
            type="button"
            className="oi-more"
            onClick={() => setLimit(limit + 35)}
          >
            显示更多项目
            <ChevronDown size={13} />
          </button>
        )}
      </div>
      <footer>
        <button
          type="button"
          className="oi-plain"
          disabled={saving}
          onClick={close}
        >
          取消
        </button>
        <button
          type="submit"
          className="oi-primary"
          disabled={saving || changed || conflict}
        >
          <Check size={14} />
          {saving ? '正在保存…' : '保存工位'}
        </button>
      </footer>
    </form>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="oi-section">
      <h3>
        {title}
        {count != null && <small>{count}</small>}
      </h3>
      {children}
    </section>
  )
}
function Limited<T>({
  rows,
  render,
  initialCount = 3,
}: {
  rows: T[]
  render: (row: T) => ReactNode
  initialCount?: number
}) {
  const [limit, setLimit] = useState(initialCount)
  return (
    <>
      {rows.slice(0, limit).map(render)}
      {rows.length > limit && (
        <button className="oi-more" onClick={() => setLimit((n) => n + 10)}>
          再显示 {Math.min(10, rows.length - limit)} 条<ChevronDown size={12} />
        </button>
      )}
    </>
  )
}
function Action({
  icon: Icon,
  title,
  meta,
  onClick,
  tone = '',
}: {
  icon: LucideIcon
  title: string
  meta: string
  onClick: () => void
  tone?: string
}) {
  return (
    <button className="oi-action" type="button" onClick={onClick}>
      <span className={'oi-symbol ' + tone}>
        <Icon size={14} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{meta}</small>
      </span>
      <ChevronRight size={13} />
    </button>
  )
}
function BackToScene({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="or-scene-link"
      onClick={onClick}
      aria-label="返回工位现场"
    >
      <ArrowUpLeft size={14} />
      返回现场
    </button>
  )
}
function InspectorContent({
  onBackToScene,
  seat,
  w,
  refresh,
  open,
  legacy,
  go,
  notify,
  lifeText,
  onAction,
}: Props) {
  const [editing, setEditing] = useState(false),
    [swapping, setSwapping] = useState(false)
  const { apps, appById, activity, feedback, alerts, runs, releases, chats } =
    getSeatDetails(seat, w)
  const name = (id: string) => appById.get(id)?.name || id
  if (editing)
    return (
      <aside
        className="office-inspector"
        aria-label={'工位 ' + seat.id + ' 配置'}
      >
        <Editor
          {...{ seat, w, refresh, notify, onBackToScene }}
          close={() => setEditing(false)}
        />
      </aside>
    )
  return (
    <aside
      className="office-inspector"
      aria-label={'工位 ' + seat.id + ' 详情'}
    >
      <header className="oi-heading">
        <div className="oi-heading-left">
          {onBackToScene && <BackToScene onClick={onBackToScene} />}
          <span className="oi-seat">
            <UserRound size={13} />
            {seat.name ? '工位 ' + seat.id : '工位档案'}
          </span>
        </div>
        <div className="oc-header-actions">
          <button
            className="oi-text"
            onClick={() => {
              setSwapping(false)
              setEditing(true)
            }}
          >
            <Pencil size={13} />
            配置工位
          </button>
          <button
            className="oi-text"
            aria-expanded={swapping}
            onClick={() => setSwapping(!swapping)}
          >
            <ArrowLeftRight size={13} />
            换座
          </button>
        </div>
      </header>
      {swapping && (
        <SwapSeat
          seat={seat}
          all={w.officeSeats}
          refresh={refresh}
          notify={notify}
          close={() => setSwapping(false)}
        />
      )}
      <CharacterCard
        key={seat.character.id}
        seat={seat}
        all={w.officeSeats}
        lifeText={lifeText}
        onAction={onAction}
        edit={() => {
          setSwapping(false)
          setEditing(true)
        }}
      />
      <div className={'oi-activity oi-' + activity.kind}>
        <h3 className="oc-business-label">项目状态</h3>
        <strong>
          <i />
          {activity.label}
        </strong>
        <p>{activity.detail}</p>
      </div>
      {apps.length > 0 && (
        <Section title="绑定项目" count={apps.length}>
          <Limited
            rows={apps}
            render={(a: App) => (
              <div className="oi-project" key={a.id}>
                <button
                  className="oi-project-name"
                  onClick={() => open({ type: 'asset', id: a.id })}
                >
                  <Folder size={13} />
                  <span>{a.name}</span>
                  {a.lifecycle === 'archived' && <small>归档</small>}
                </button>
                <button
                  className="oi-text"
                  onClick={() => go('chats', a.id)}
                  aria-label={'查看 ' + a.name + ' 的开发会话'}
                >
                  <MessageSquare size={13} />
                </button>
              </div>
            )}
          />
        </Section>
      )}
      {alerts.length > 0 && (
        <Section title="未解决告警" count={alerts.length}>
          <Limited
            rows={alerts}
            render={(a) => (
              <Action
                key={a.id}
                icon={Bell}
                tone={a.level === 'error' ? 'red' : 'amber'}
                title={a.title}
                meta={name(a.appId) + ' · ' + stateName[a.state]}
                onClick={() => legacy({ type: 'incident', id: a.id })}
              />
            )}
          />
        </Section>
      )}
      {feedback.length > 0 && (
        <Section title="待跟进反馈" count={feedback.length}>
          <Limited
            rows={feedback}
            render={(f) => (
              <Action
                key={f.id}
                icon={MessageSquare}
                tone="amber"
                title={f.title}
                meta={name(f.appId) + ' · ' + stateName[f.state]}
                onClick={() => open({ type: 'feedback-detail', id: f.id })}
              />
            )}
          />
        </Section>
      )}
      {releases.length > 0 && (
        <Section title="最新版本">
          <Limited
            initialCount={1}
            rows={releases}
            render={(r) => (
              <Action
                key={r.id}
                icon={Tag}
                title={name(r.appId) + ' · ' + r.version}
                meta={
                  (r.github ? 'GitHub 正式版' : '本地版本记录') +
                  ' · ' +
                  relative(r.time, w.now)
                }
                onClick={() => open({ type: 'release-detail', id: r.id })}
              />
            )}
          />
        </Section>
      )}
      {runs.length > 0 && (
        <Section title="最近任务">
          {runs.map((r) => (
            <Action
              key={r.id}
              icon={r.status === 'failed' ? AlertCircle : Activity}
              tone={r.status === 'failed' ? 'red' : 'green'}
              title={r.title}
              meta={
                name(r.appId) +
                ' · ' +
                (r.status === 'failed' ? '失败' : '成功') +
                ' · ' +
                relative(r.time, w.now)
              }
              onClick={() => legacy({ type: 'run', id: r.id })}
            />
          ))}
        </Section>
      )}
      {chats.length > 0 && (
        <Section title="开发会话" count={chats.length}>
          <Limited
            rows={chats}
            render={(link) => {
              const local = link.location === 'local',
                remote = matchRemoteControl(link, appById.get(link.appId))
              const primary = (
                <span>
                  <strong>{link.title}</strong>
                  <small>
                    {name(link.appId)} ·{' '}
                    {local ? '本机' : link.machine || '来源电脑'}
                  </small>
                </span>
              )
              return (
                <div className="oi-chat" key={link.id}>
                  {local ? (
                    <a href={threadUrl(link.threadId)} onClick={()=>rememberChatUse(link,'open')}>
                      {primary}
                      <ArrowUpRight size={13} />
                    </a>
                  ) : (
                    <>
                      <button onClick={() => go('chats', link.appId)}>
                        {primary}
                        <ChevronRight size={13} />
                      </button>
                      {remote && (
                        <a
                          className="oi-remote"
                          href={remote}
                          onClick={()=>rememberChatUse(link,'remote')}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Monitor size={12} />
                          远控
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </>
                  )}
                </div>
              )
            }}
          />
        </Section>
      )}
    </aside>
  )
}

export function OfficeInspector(props: Props) {
  return <InspectorContent key={props.seat.id} {...props} />
}

import { useId, useRef, useState, type CSSProperties } from 'react'
import {
  Armchair,
  ArrowLeftRight,
  Check,
  ClipboardList,
  Coffee,
  MessageSquare,
  PersonStanding,
  Sparkles,
  Toilet,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { type OfficeAction, type OfficeSeat } from './model'
import { looks, lookSrc } from './office-looks'

type Character = OfficeSeat['character']
const accentNames = {
  violet: '紫罗兰',
  teal: '青绿',
  amber: '琥珀',
  blue: '湖蓝',
  rose: '玫瑰',
  sage: '鼠尾草',
}
const accentColors = {
  violet: '#7662b9',
  teal: '#33867d',
  amber: '#ac7b33',
  blue: '#4b79ab',
  rose: '#b26883',
  sage: '#708756',
}
const genderNames = { male: '男', female: '女', unset: '未设置' }
const habitNames = {
  balanced: '均衡',
  focused: '专注',
  social: '爱社交',
  relaxed: '悠闲',
}
const activityOptions: [OfficeAction, string, LucideIcon][] = [
  ['work', '工作', ClipboardList],
  ['drink', '喝水', Coffee],
  ['restroom', '上厕所', Toilet],
  ['slack', '摸鱼', Armchair],
  ['stretch', '伸懒腰', PersonStanding],
  ['chat', '找同事聊天', MessageSquare],
]
const present = (s: OfficeSeat) => !!s.name.trim() || s.appIds.length > 0
const colorVars = (color: Character['accent']) =>
  ({ '--oc-color': accentColors[color] }) as CSSProperties

export function CharacterFields({
  person,
  change,
  disabled,
}: {
  person: Character
  change: (c: Character) => void
  disabled: boolean
}) {
  const [gallery, openGallery] = useState(false)
  const uid = useId()
  const choices = looks.filter(
    (l) => person.gender === 'unset' || l.gender === person.gender,
  )
  const selected = looks.find((l) => l.id === person.look)
  function gender(value: Character['gender']) {
    const keep = value === 'unset' || selected?.gender === value
    const match =
      looks.find(
        (l) => l.gender === value && l.id.slice(1) === person.look.slice(1),
      ) || looks.find((l) => l.gender === value)
    change({
      ...person,
      gender: value,
      look: keep ? person.look : match?.id || person.look,
    })
  }
  return (
    <fieldset
      className="oc-fields"
      disabled={disabled}
      style={colorVars(person.accent)}
    >
      <legend>人物设定</legend>
      <div className="oc-preview">
        <span className="oc-avatar">
          <img src={lookSrc(person.look, 'front')} alt="当前人物造型" />
        </span>
        <span className="oc-preview-name">
          <strong>{selected?.label || person.look}</strong>
          <small>
            {accentNames[person.accent]} · {habitNames[person.habit]}
          </small>
        </span>
        <button
          className="oi-text"
          type="button"
          aria-expanded={gallery}
          onClick={() => openGallery(!gallery)}
        >
          {gallery ? '收起造型' : '更换造型'}
        </button>
      </div>
      <div className="oc-row">
        <span id={uid + '-gender'}>性别</span>
        <div
          className="oc-segment"
          role="group"
          aria-labelledby={uid + '-gender'}
        >
          {(['male', 'female', 'unset'] as const).map((g) => (
            <button
              type="button"
              key={g}
              aria-pressed={person.gender === g}
              onClick={() => gender(g)}
            >
              {genderNames[g]}
            </button>
          ))}
        </div>
      </div>
      {gallery && (
        <div className="oc-looks" role="group" aria-label="人物造型">
          {choices.map((l) => (
            <button
              type="button"
              key={l.id}
              onClick={() => change({ ...person, look: l.id })}
              aria-pressed={person.look === l.id}
              title={l.label}
            >
              <img src={lookSrc(l.id, 'front')} alt="" />
              <span>{l.label}</span>
              {person.look === l.id && <Check size={11} />}
            </button>
          ))}
        </div>
      )}
      <div className="oc-row">
        <span id={uid + '-accent'}>主题色</span>
        <div
          className="oc-colors"
          role="group"
          aria-labelledby={uid + '-accent'}
        >
          {(Object.keys(accentNames) as Character['accent'][]).map((a) => (
            <button
              key={a}
              type="button"
              aria-label={accentNames[a]}
              aria-pressed={a === person.accent}
              title={accentNames[a]}
              style={colorVars(a)}
              onClick={() => change({ ...person, accent: a })}
            >
              {a === person.accent && <Check size={12} />}
            </button>
          ))}
        </div>
      </div>
      <label className="oc-row">
        生活偏好
        <select
          value={person.habit}
          onChange={(e) =>
            change({ ...person, habit: e.target.value as Character['habit'] })
          }
        >
          {(Object.keys(habitNames) as Character['habit'][]).map((h) => (
            <option key={h} value={h}>
              {habitNames[h]}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  )
}

export function CharacterCard({
  seat,
  lifeText,
  onAction,
  all,
  edit,
}: {
  seat: OfficeSeat
  lifeText: string
  onAction: (action: OfficeAction, partnerId?: string) => Promise<void>
  all: OfficeSeat[]
  edit: () => void
}) {
  const [choosing, choose] = useState(false),
    [partner, setPartner] = useState(''),
    [working, setWorking] = useState(false),
    [error, setError] = useState('')
  const inFlight = useRef(false)
  const partners = all.filter((s) => s.id !== seat.id && present(s))
  const buddy = partners.find((s) => s.id === partner)
  async function perform(action: OfficeAction, id?: string) {
    if (inFlight.current) return
    inFlight.current = true
    setWorking(true)
    setError('')
    try {
      await onAction(action, id)
      choose(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '动作未完成，请重试')
    } finally {
      inFlight.current = false
      setWorking(false)
    }
  }
  if (!present(seat))
    return (
      <div className="oc-empty">
        <UserRound size={20} />
        <span>
          <strong>空工位</strong>
          <small>填写姓名即可让人物入场。</small>
        </span>
        <button className="oi-text" onClick={edit}>
          添加人物
        </button>
      </div>
    )
  const person = seat.character
  return (
    <section
      className="oc-card"
      style={colorVars(person.accent)}
      aria-label="人物动态"
    >
      <div className="oc-head">
        <span className="oc-avatar">
          <img
            src={lookSrc(person.look, 'front')}
            alt={seat.name ? seat.name + ' 的形象' : '工位人物形象'}
          />
        </span>
        <div className="oc-identity">
          <div className="oi-person">
            <h2>{seat.name || seat.id + ' 工位'}</h2>
            {seat.example && <span>示例</span>}
          </div>
          <small>
            {person.gender !== 'unset' && genderNames[person.gender] + ' · '}
            {habitNames[person.habit]} · {accentNames[person.accent]}
          </small>
        </div>
      </div>
      <div className="oc-living">
        <strong>
          <Sparkles size={12} />
          人物动态
        </strong>
        <span>{lifeText || '等待场景更新'}</span>
      </div>
      <div className="oc-action-grid" role="group" aria-label="人物动作">
        {activityOptions.map(([kind, title, Icon]) => (
          <button
            key={kind}
            disabled={working}
            aria-expanded={kind === 'chat' ? choosing : undefined}
            onClick={() => {
              if (kind === 'chat') {
                choose(!choosing)
                setError('')
              } else void perform(kind)
            }}
          >
            <Icon size={13} />
            {title}
          </button>
        ))}
      </div>
      {choosing && (
        <div className="oc-partner">
          {partners.length ? (
            <>
              <label>
                聊天对象
                <select
                  value={buddy?.id || ''}
                  onChange={(e) => setPartner(e.target.value)}
                  disabled={working}
                >
                  <option value="">选择另一工位的人物</option>
                  {partners.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.id} · {p.name || '工位人物'}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="oi-primary"
                disabled={!buddy || working}
                onClick={() => {
                  if (buddy) void perform('chat', buddy.id)
                }}
              >
                开始聊天
              </button>
            </>
          ) : (
            <p>其他工位有了人物，就可以邀请聊天。</p>
          )}
        </div>
      )}
      {error && (
        <p className="oi-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

export function SwapSeat({
  seat,
  all,
  refresh,
  notify,
  close,
}: {
  seat: OfficeSeat
  all: OfficeSeat[]
  refresh: () => Promise<void> | void
  notify: (s: string) => void
  close: () => void
}) {
  const [from, setFrom] = useState(seat),
    [to, setTo] = useState<OfficeSeat | null>(null)
  const [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false),
    [error, setError] = useState('')
  const options = all.filter(
    (s) => s.id !== seat.id && (present(seat) || present(s)),
  )
  const target = options.find((s) => s.id === to?.id)
  const changed =
    !!to &&
    (from.revision !== seat.revision || target?.revision !== to.revision)
  const confirm = async () => {
    if (!target || !to || busy || changed || conflict) return
    setBusy(true)
    setError('')
    try {
      const r = await fetch(
        '/api/office/seats/' + encodeURIComponent(seat.id) + '/swap',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetId: to.id,
            revision: from.revision,
            targetRevision: to.revision,
          }),
        },
      )
      if (r.status === 409) {
        setConflict(true)
        await refresh()
        return
      }
      if (!r.ok) {
        const b = await r.json()
        throw Error(b.error || '换座未完成')
      }
      try {
        await refresh()
        notify(from.id + ' 与 ' + to.id + ' 已交换位置')
      } catch {
        notify('换座已保存，刷新后可查看')
      }
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : '换座未完成，请重试')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="oc-swap" aria-label="交换工位">
      <div className="oi-form-top">
        <h3>
          <ArrowLeftRight size={14} />
          交换工位
        </h3>
        <button
          className="oi-icon"
          aria-label="关闭换座"
          onClick={close}
          disabled={busy}
        >
          <X size={13} />
        </button>
      </div>
      <label>
        目标工位
        <select
          aria-label="目标工位"
          disabled={busy}
          value={to?.id || ''}
          onChange={(e) => {
            setTo(options.find((s) => s.id === e.target.value) || null)
            setFrom(seat)
            setConflict(false)
            setError('')
          }}
        >
          <option value="">
            {options.length ? '选择工位' : '暂无可交换的工位'}
          </option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {present(s) ? s.name || '工位人物' : '空位'}
            </option>
          ))}
        </select>
      </label>
      <p>两席的人物、造型和绑定项目一起交换。</p>
      {(conflict || changed) && (
        <div className="oi-conflict" role="status">
          工位资料已变更。
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await refresh()
                setFrom(seat)
                setTo(null)
                setConflict(false)
              } catch {
                setError('刷新未完成，请重试')
              } finally {
                setBusy(false)
              }
            }}
          >
            重新选择目标
          </button>
        </div>
      )}
      {error && (
        <p className="oi-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="oi-primary"
        disabled={!target || busy || !!changed || conflict}
        onClick={() => void confirm()}
      >
        {busy ? '交换中…' : '确认换座'}
      </button>
    </section>
  )
}

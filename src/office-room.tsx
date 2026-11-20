import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Activity,
  ChevronRight,
  Armchair,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Coffee,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { api, type OfficeSeat, type Workspace, type View } from './model'
import { OfficeCast } from './office-cast'
import { occupied } from './office-life'
import type { OfficeAction } from './model'
import { positions, at } from './office-geometry'
import { OfficeInspector } from './office-inspector'
import { getSeatDetails, type SeatActivity } from './office-state'
import { exportOfficeScene } from './office-export'
import type { CatalogDialog } from './catalog-dialogs'
import type { Dialog } from './dialogs'
import './office-room.css'

const colors: Record<SeatActivity['kind'], string> = {
  alert: '#bd514e',
  failed: '#c46935',
  feedback: '#a16b16',
  released: '#7354b7',
  success: '#337e65',
  linked: '#4d7598',
  empty: '#737983',
}
const short: Record<SeatActivity['kind'], string> = {
  alert: '告警',
  failed: '失败',
  feedback: '反馈',
  released: '发布',
  success: '成功',
  linked: '关联',
  empty: '待绑定',
}
const attention = (k: SeatActivity['kind']) =>
  ['alert', 'failed', 'feedback'].includes(k)
type Props = {
  w: Workspace
  appId: string
  seatId: string
  refresh: () => Promise<void>
  open: (d: CatalogDialog) => void
  legacy: (d: NonNullable<Dialog>) => void
  go: (view: View, id?: string) => void
  notify: (msg: string) => void
}

function useLiveRoom(refresh: Props['refresh']) {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!('EventSource' in window)) return
    let active = true,
      pending = false,
      busy = false,
      timer: ReturnType<typeof setTimeout> | undefined
    const update = async () => {
      if (!active || document.hidden || busy) return
      pending = false
      busy = true
      try {
        await refresh()
      } finally {
        busy = false
        if (pending && active) queue()
      }
    }
    function queue() {
      pending = true
      if (!timer && !busy && !document.hidden) {
        timer = setTimeout(() => {
          timer = undefined
          void update()
        }, 180)
      }
    }
    const source = new EventSource('/api/office/events')
    source.onmessage = () => {
      setConnected(true)
      queue()
    }
    source.onerror = () => setConnected(false)
    const visible = () => {
      if (!document.hidden) queue()
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      source.close()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refresh])
  return connected
}

function useLegacyNames(refresh: Props['refresh'], notify: Props['notify']) {
  useEffect(() => {
    const key = 'stackpilot.office.seating.v1',
      marker = 'stackpilot.office.migrated.v1'
    let live = true
    async function migrate() {
      try {
        const raw = localStorage.getItem(key)
        if (!raw || localStorage.getItem(marker) === raw) return
        const previous = JSON.parse(raw)
        const names = Object.fromEntries(
          Object.keys(positions)
            .filter(
              (id) => typeof previous?.[id] === 'string' && previous[id].trim(),
            )
            .map((id) => [id, previous[id].trim().slice(0, 60)]),
        )
        if (!Object.keys(names).length) return
        const { imported } = await api<{ imported: number }>(
          'office/import-names',
          { names },
        )
        localStorage.setItem(marker, raw)
        if (live) {
          await refresh()
          if (imported) notify('已保留旧座位图中的 ' + imported + ' 个姓名')
        }
      } catch {
        /* Storage may be unavailable in a private window; the original names remain untouched. */
      }
    }
    void migrate()
    return () => {
      live = false
    }
  }, [refresh, notify])
}
function seatChange(prev: Workspace, now: Workspace, seat: OfficeSeat) {
  const old = prev.officeSeats.find((s) => s.id === seat.id)
  if (!old) return ''
  if (old.revision !== seat.revision) return '工位配置已更新'
  const before = getSeatDetails(old, prev),
    after = getSeatDetails(seat, now)
  if (before.active.some((a) => !after.active.some((b) => a.id === b.id)))
    return '项目已归档'
  if (after.active.some((a) => !before.active.some((b) => a.id === b.id)))
    return '项目已恢复'
  if (after.alerts.length < before.alerts.length) return '告警已处理'
  if (after.feedback.length < before.feedback.length) return '反馈已解决'
  if (after.alerts[0]?.id && after.alerts[0]?.id !== before.alerts[0]?.id)
    return '收到新告警'
  if (after.feedback[0]?.id && after.feedback[0]?.id !== before.feedback[0]?.id)
    return '收到新反馈'
  if (after.feedback[0]?.state !== before.feedback[0]?.state)
    return '反馈进度更新'
  if (after.releases[0]?.id !== before.releases[0]?.id) return '版本记录更新'
  if (after.runs[0]?.id !== before.runs[0]?.id)
    return after.runs[0]?.status === 'failed' ? '任务执行失败' : '任务结果更新'
  return ''
}
function useSceneChanges(w: Workspace) {
  const previous = useRef(w)
  const [notice, setNotice] = useState<{
    seats: string[]
    text: string
    key: number
  } | null>(null)
  useEffect(() => {
    const prev = previous.current
    previous.current = w
    if (prev === w) return
    const changes = w.officeSeats
      .map((s) => ({ id: s.id, change: seatChange(prev, w, s) }))
      .filter((s) => s.change)
    if (changes.length)
      setNotice({
        seats: changes.map((s) => s.id),
        text:
          changes[0].id +
          ' · ' +
          changes[0].change +
          (changes.length > 1 ? '，共 ' + changes.length + ' 个工位更新' : ''),
        key: Date.now(),
      })
  }, [w])
  useEffect(() => {
    if (!notice?.seats.length) return
    const timer = setTimeout(
      () =>
        setNotice((last) =>
          last?.key === notice.key ? { ...last, seats: [] } : last,
        ),
      1700,
    )
    return () => clearTimeout(timer)
  }, [notice])
  return notice
}
function Desk({
  seat,
  w,
  selected,
  choose,
  labels,
  muted,
  eventKey,
}: {
  seat: OfficeSeat
  w: Workspace
  selected: boolean
  choose: () => void
  labels: boolean
  muted: boolean
  eventKey: number
}) {
  const p = positions[seat.id]
  if (!p) return null
  const { activity, active, alerts, feedback } = getSeatDetails(seat, w)
  const embodied = active.length > 0
  const color = colors[activity.kind],
    side = p.facing === 'east' || p.facing === 'west'
  const status =
    activity.kind === 'alert'
      ? '告警 ' + alerts.length
      : activity.kind === 'feedback'
        ? '反馈 ' + feedback.length
        : short[activity.kind]
  const caption =
    seat.name ||
    (!embodied
      ? ''
      : active.length === 1
        ? active[0].name
        : active.length + ' 个项目')
  const tooltip =
    seat.id +
    (seat.name ? ' · ' + seat.name : '') +
    '｜' +
    activity.label +
    '｜' +
    activity.detail
  const statusId = 'seat-' + seat.id
  // Anchor the tag to the rim of its own monitor; stagger opposite rows to keep them distinct.
  const marker: [number, number] = side
    ? [p.screen[0] + (p.facing === 'east' ? -16 : 16), p.screen[1] - 41]
    : p.facing === 'south'
      ? [p.screen[0] - 38, p.screen[1] - 12]
      : [p.screen[0] + 34, p.screen[1] - 16]
  const detailed = labels && embodied && (attention(activity.kind) || selected)

  return (
    <div
      className={'or-desk ' + (muted ? 'or-muted' : '')}
      data-kind={activity.kind}
      style={{ '--seat-tone': color } as CSSProperties}
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="or-chair-hit"
        title={tooltip}
        style={at(p.chair)}
        onClick={choose}
      />
      {embodied && (
        <>
          <span
            data-office-screen
            className={
              'or-screen ' +
              (side ? 'side' : p.facing === 'south' ? 'monitor-back' : '')
            }
            style={{
              ...at(
                p.facing === 'south'
                  ? [p.screen[0] + 35, p.screen[1] + 6]
                  : p.screen,
              ),
              backgroundColor: p.facing === 'south' ? color : color + '77',
            }}
          />
        </>
      )}
      <button
        id={statusId}
        data-seat={seat.id}
        data-office-label
        aria-label={tooltip}
        aria-pressed={selected}
        onClick={choose}
        title={tooltip}
        style={at(marker)}
        className={
          'or-nameplate ' +
          (eventKey ? 'or-event ' : '') +
          (selected ? 'chosen ' : '') +
          (!labels ? 'compact ' : '') +
          (embodied ? 'assigned' : 'vacant')
        }
      >
        <i data-office-dot />
        <b data-office-text>{seat.id}</b>
        {detailed && (
          <span className="or-chip-state" data-office-text>
            {status.replace(' ', '')}
          </span>
        )}
        {labels && attention(activity.kind) && (
          <span className="or-mini-state" data-office-text>
            {activity.kind === 'feedback'
              ? '待' + feedback.length
              : activity.kind === 'alert'
                ? '!' + alerts.length
                : '×'}
          </span>
        )}
      </button>
      <span className="or-sr">{caption}</span>
    </div>
  )
}

export function OfficeRoom({
  seatId,
  w,
  appId,
  refresh,
  open,
  legacy,
  go,
  notify,
}: Props) {
  const seats = w.officeSeats,
    matching = seats.filter((s) => s.appIds.includes(appId))
  const [selected, setSelected] = useState(
    () =>
      seats.find((s) => s.id === seatId)?.id ||
      matching[0]?.id ||
      seats.find((s) => s.appIds.length)?.id ||
      'A1',
  )
  const [labels, setLabels] = useState(true),
    [scope, setScope] = useState<'all' | 'issues' | 'unbound'>('all'),
    [zoom, setZoom] = useState(false),
    [saving, setSaving] = useState(false)
  const [auto, setAuto] = useState(() => {
    try {
      return localStorage.getItem('stackpilot.office.auto') !== 'off'
    } catch {
      return true
    }
  })
  const [currentLife, setCurrentLife] = useState(''),
    [watching, setWatching] = useState('')
  const roomPanel = useRef<HTMLDivElement>(null),
    detailPanel = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null)
  const narrow = () => window.matchMedia('(max-width:970px)').matches
  function jump(el: HTMLElement | null) {
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'start', behavior: 'instant' })
  }
  function inspect() {
    if (zoom) setZoom(false)
    requestAnimationFrame(() => jump(detailPanel.current))
  }
  function centerSeat(id: string) {
    const view = viewport.current
    const marker = view?.querySelector<HTMLElement>('[data-seat="' + id + '"]')
    if (!view || !marker || view.scrollWidth <= view.clientWidth) return
    const box = marker.getBoundingClientRect()
    view.scrollLeft +=
      box.left +
      box.width / 2 -
      view.getBoundingClientRect().left -
      view.clientWidth / 2
  }
  function toggleAuto() {
    setAuto(!auto)
    try {
      localStorage.setItem('stackpilot.office.auto', auto ? 'off' : 'on')
    } catch {}
  }
  async function act(action: OfficeAction, partnerId?: string) {
    await api('office/seats/' + encodeURIComponent(selected) + '/life', {
      action,
      partnerId,
    })
    setWatching(selected)
    if (narrow() && !zoom) jump(roomPanel.current)
    await refresh()
  }
  const stage = useRef<HTMLDivElement>(null),
    zoomClose = useRef<HTMLButtonElement>(null)
  const connected = useLiveRoom(refresh),
    notice = useSceneChanges(w)
  useLegacyNames(refresh, notify)
  const seat = seats.find((s) => s.id === selected) || seats[0]
  const issues = seats.filter((s) =>
      attention(getSeatDetails(s, w).activity.kind),
    ).length,
    assigned = seats.filter((s) => s.appIds.length).length
  useEffect(() => {
    const panel = roomPanel.current
    if (!zoom || !panel) return
    const root = document.getElementById('root')
    const inertSiblings: HTMLElement[] = []
    for (
      let el: HTMLElement = panel;
      el.parentElement && el !== root;
      el = el.parentElement
    ) {
      for (const sibling of el.parentElement.children) {
        if (
          sibling !== el &&
          sibling instanceof HTMLElement &&
          !sibling.inert
        ) {
          sibling.inert = true
          inertSiblings.push(sibling)
        }
      }
    }
    function keydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setZoom(false)
        return
      }
      if (e.key !== 'Tab') return
      const buttons = Array.from(
        panel!.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]),select:not([disabled])',
        ),
      ).filter((el) => el.getClientRects().length)
      const first = buttons[0],
        last = buttons.at(-1)
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', keydown, true)
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    zoomClose.current?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', keydown, true)
      document.body.style.overflow = old
      for (const el of inertSiblings) el.inert = false
      zoomClose.current?.focus({ preventScroll: true })
    }
  }, [zoom])
  useEffect(() => {
    if (!zoom) return
    const id = requestAnimationFrame(() => centerSeat(selected))
    return () => cancelAnimationFrame(id)
  }, [zoom, selected])
  function select(id: string) {
    setSelected(id)
    setWatching('')
    // Keep browser Back and copied links pointing at the selected seat without adding a history entry for every tap.
    const query = new URLSearchParams(location.hash.split('?')[1])
    query.set('seat', id)
    history.replaceState(history.state, '', '#office?' + query.toString())
    if (narrow() && !zoom) inspect()
  }
  const download = async () => {
    if (!stage.current || saving) return
    setSaving(true)
    try {
      await exportOfficeScene(stage.current)
      notify('当前工作间已导出为 PNG')
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="or-layout">
      <div
        ref={roomPanel}
        tabIndex={-1}
        role={zoom ? 'dialog' : 'region'}
        aria-modal={zoom || undefined}
        aria-label={zoom ? '放大的工位现场' : '工位现场'}
        className={'or-room-panel panel ' + (zoom ? 'or-enlarged' : '')}
      >
        <div className="or-room-title">
          <div>
            <Armchair size={17} />
            <h2>工位现场</h2>
            <small>{seats.length} 席</small>
          </div>
          <span className={'or-live ' + (connected ? 'online' : '')}>
            <i />
            {connected ? '实时联动' : '定时刷新'}
          </span>
        </div>
        <div className="or-controls">
          <div className="or-segments" role="group" aria-label="突出显示的工位">
            {(
              [
                ['all', '全部', seats.length],
                ['issues', '待处理', issues],
                ['unbound', '未绑定', seats.length - assigned],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
              >
                {label}
                <small>{count}</small>
              </button>
            ))}
          </div>
          <div className="or-map-actions">
            <button
              className="or-live-toggle"
              aria-pressed={auto}
              aria-label="自动生活"
              title={auto ? '关闭自主生活动作' : '开启自主生活动作'}
              onClick={toggleAuto}
            >
              <Coffee size={12} />
              自动生活
            </button>
            <button
              title={labels ? '精简标签' : '显示标签'}
              aria-label={labels ? '精简标签' : '显示标签'}
              onClick={() => setLabels(!labels)}
            >
              {labels ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button
              ref={zoomClose}
              className={zoom ? 'or-exit-zoom' : undefined}
              aria-label={zoom ? '退出放大' : '放大场景'}
              title={zoom ? '退出放大' : '放大场景'}
              onClick={() => setZoom(!zoom)}
            >
              {zoom ? (
                <>
                  <Minimize2 size={14} />
                  <span>收起</span>
                </>
              ) : (
                <Maximize2 size={15} />
              )}
            </button>
            <button
              aria-label="导出工作间 PNG"
              title="导出当前场景"
              disabled={saving}
              onClick={download}
            >
              <Download size={15} />
            </button>
          </div>
        </div>
        <div className="or-scroll" ref={viewport}>
          <div className="or-stage" ref={stage}>
            <img
              className="or-base"
              data-office-background
              src="/office/room-workstations.png"
              alt="19 个工位的 Q 版工作间，中央走道，右下方入口"
            />
            {seats.map((s) => {
              const kind = getSeatDetails(s, w).activity.kind
              return (
                <Desk
                  key={s.id}
                  seat={s}
                  w={w}
                  selected={selected === s.id}
                  choose={() => select(s.id)}
                  labels={labels}
                  muted={
                    (scope === 'issues' && !attention(kind)) ||
                    (scope === 'unbound' && s.appIds.length > 0)
                  }
                  eventKey={notice?.seats.includes(s.id) ? notice.key : 0}
                />
              )
            })}
            <OfficeCast
              projectNames={new Map(w.apps.map((app) => [app.id, app.name]))}
              seats={seats}
              auto={auto}
              selected={selected}
              onSelect={select}
              labels={labels}
              muted={
                new Set(
                  seats
                    .filter((s) =>
                      scope === 'unbound'
                        ? s.appIds.length > 0
                        : scope === 'issues' &&
                          !attention(getSeatDetails(s, w).activity.kind),
                    )
                    .map((s) => s.id),
                )
              }
              onDescription={setCurrentLife}
              onWater={() => {
                if (seat && occupied(seat))
                  void act('drink').catch((e) => notify(e.message))
              }}
            />
          </div>
        </div>
        {zoom && <span className="or-pan-note">左右滑动查看其他工位</span>}
        <div className="or-legend">
          {(
            ['alert', 'feedback', 'released', 'success', 'linked'] as const
          ).map((k) => (
            <span key={k}>
              <i style={{ background: colors[k] }} />
              {
                {
                  alert: '告警 / 失败',
                  feedback: '待跟进',
                  released: '新版本',
                  success: '任务成功',
                  linked: '已关联',
                }[k]
              }
            </span>
          ))}
        </div>
        <div className="or-line">
          <Activity size={14} />
          <span role="status">
            {watching === selected && currentLife
              ? selected + ' · ' + currentLife
              : notice
                ? notice.text
                : assigned +
                  ' 个工位已绑定项目' +
                  (seats.some((s) => s.example) ? ' · 含示例绑定' : '')}
          </span>
          <label>
            <select
              aria-label="定位工位"
              value={selected}
              onChange={(e) => select(e.target.value)}
            >
              {seats.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.id}
                  {s.name ? ' · ' + s.name : ' 工位'}
                </option>
              ))}
            </select>
            <ChevronDown size={12} />
          </label>
          <button
            className="or-inspect-link"
            onClick={inspect}
            aria-label={'查看 ' + selected + ' 工位档案'}
          >
            查看档案
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
      {seat && (
        <div
          className="or-detail-panel"
          role="region"
          aria-label={'当前工位 ' + seat.id}
          ref={detailPanel}
          tabIndex={-1}
        >
          <OfficeInspector
            key={seat.id}
            onBackToScene={() => jump(roomPanel.current)}
            lifeText={currentLife}
            onAction={act}
            seat={seat}
            w={w}
            refresh={refresh}
            open={open}
            legacy={legacy}
            go={go}
            notify={notify}
          />
        </div>
      )}
    </div>
  )
}

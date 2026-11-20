import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { at, positions } from './office-geometry'
import {
  cooler,
  occupied,
  OfficeLifeScene,
  type LifeFrame,
  type Point,
} from './office-life'
import { looks } from './office-looks'
import type { OfficeSeat } from './model'
import {
  DeskEquipment,
  deskSilhouette,
  workstationFor,
  WorkDisplay,
  ChairBacks,
} from './office-furniture'
import { WorkingFigure } from './office-working-figure'
import { MotionFigure } from './office-motion-figure'
import './office-cast.css'

const tones = {
  violet: '#7663ac',
  teal: '#3c847e',
  amber: '#a77638',
  blue: '#537fab',
  rose: '#b16884',
  sage: '#66855c',
}
const chargingShelf: Point = [765, 194]

type PersonProps = {
  seat: OfficeSeat
  frame: LifeFrame
  selected: boolean
  muted: boolean
  labels: boolean
  onSelect: (id: string) => void
  partner: string
}
const Person = memo(
  function Person({
    seat,
    frame,
    selected,
    muted,
    labels,
    onSelect,
    partner,
  }: PersonProps) {
    const originId = frame.blendSeatId || seat.id
    const desk = workstationFor(
      originId === seat.id ? seat : { ...seat, id: originId },
    )
    const home = positions[originId],
      blend = frame.seatBlend
    const isTyping = frame.pose === 'typing'
    const mix = (a: number, b: number) => a + (b - a) * blend
    const name = seat.name || seat.id
    const appearance =
      looks.find((l) => l.id === seat.character.look)?.label || '角色'
    const walking = frame.phase === 'moving' || frame.phase === 'returning'
    const statusLabel = frame.talk || frame.label
    const showActivity =
      labels &&
      !frame.crossing &&
      (frame.action !== 'chat' || (selected && frame.pose !== 'listen'))
    const speech =
      frame.phase !== 'away' &&
      (frame.talk ||
        ((!frame.atDesk || frame.action !== 'work') && showActivity))
    const foot: Point = [
      frame.p[0] + (desk.foot[0] - home.stand[0]) * blend,
      frame.p[1] + (desk.foot[1] - home.stand[1]) * blend,
    ]
    const width = mix(109, desk.size),
      height = mix(164, desk.size)
    const outline =
      frame.atDesk && !isTyping
        ? deskSilhouette(originId, foot, width, height)
        : undefined
    const mask =
      outline &&
      'polygon(' + outline.map(([x, y]) => x + '% ' + y + '%').join(',') + ')'
    const style = {
      ...at(foot),
      width: (width / 1509) * 100 + '%',
      height: (height / 1042) * 100 + '%',
      '--person-tone': tones[seat.character.accent],
      opacity: frame.crossing
        ? (muted ? 0.24 : 1) *
          Math.min(
            1,
            (frame.crossing === 'in' ? frame.progress : 1 - frame.progress) *
              1.8,
          )
        : undefined,
      zIndex: 100 + Math.round(mix(frame.p[1], home.chair[1] - 5)),
    } as CSSProperties
    const title =
      name +
      ' · ' +
      appearance +
      ' · ' +
      frame.label +
      (frame.action === 'chat' && partner ? ' · ' + partner : '')
    if (frame.phase === 'away')
      return (
        <button
          className="ol-away"
          style={at([1343, 930])}
          onClick={() => onSelect(seat.id)}
          title={title}
          aria-label={title}
          data-person={seat.id}
          data-phase="away"
          data-action={frame.action}
          data-office-label
        >
          <span data-office-text>{name} · 暂离</span>
        </button>
      )
    return (
      <button
        type="button"
        className={
          'ol-person ' +
          (frame.atDesk ? 'seated ' : 'standing ') +
          (walking ? 'walking ' : '') +
          (muted ? 'dim ' : '') +
          (selected ? 'current ' : '')
        }
        data-person={seat.id}
        data-character={seat.character.id}
        data-facing={frame.facing}
        data-pose={frame.pose}
        data-phase={frame.phase}
        data-action={frame.action}
        title={title}
        aria-label={title}
        onClick={() => onSelect(seat.id)}
        style={style}
      >
        <span className="ol-shadow" aria-hidden="true" />
        <span
          className="ol-pose"
          data-office-clip={outline?.flat().join(',')}
          style={mask ? { clipPath: mask } : undefined}
        >
          {isTyping ? (
            <WorkingFigure
              src={desk.src}
              view={desk.view}
              mirror={desk.mirrored}
              typing
              edge={desk.edge}
            />
          ) : (
            <MotionFigure seat={seat} frame={frame} />
          )}
        </span>
        {speech && (
          <span className="ol-speech" data-office-label>
            <i data-office-dot />
            <span data-office-text>
              {frame.talk || (!frame.atDesk ? name + ' · ' : '') + statusLabel}
            </span>
          </span>
        )}
      </button>
    )
  },
  (a, b) =>
    a.frame.pose === 'typing' &&
    b.frame.pose === 'typing' &&
    a.seat === b.seat &&
    a.selected === b.selected &&
    a.muted === b.muted &&
    a.labels === b.labels &&
    a.onSelect === b.onSelect &&
    a.partner === b.partner,
)

type Props = {
  seats: OfficeSeat[]
  selected: string
  auto: boolean
  labels: boolean
  muted: Set<string>
  onSelect: (id: string) => void
  onDescription: (value: string) => void
  projectNames: Map<string, string>
  onWater: () => void
}
export function OfficeCast({
  seats,
  selected,
  auto,
  labels,
  muted,
  onSelect,
  onDescription,
  onWater,
  projectNames,
}: Props) {
  const scene = useRef<OfficeLifeScene | null>(null)
  const [frames, setFrames] = useState<Map<string, LifeFrame>>(() => new Map())
  useEffect(() => {
    scene.current ??= new OfficeLifeScene()
    let animation = 0,
      idleTimer = 0,
      last = 0
    const cancel = () => {
      cancelAnimationFrame(animation)
      clearTimeout(idleTimer)
    }
    const animate = (now: number) => {
      if (now - last >= 15) update()
      else animation = requestAnimationFrame(animate)
    }
    const update = () => {
      cancel()
      if (document.hidden) return
      last = performance.now()
      const next = scene.current!.frames(seats, Date.now(), auto)
      const poses = Array.from(next.values(), (frame) => frame.pose)
      const quiet = poses.every((pose) => pose === 'typing')
      // The working figure animates its own fingers. Keep a quiet office out
      // of React's render loop while continuing to check scheduled departures.
      setFrames((previous) => {
        if (
          quiet &&
          previous.size === next.size &&
          Array.from(next).every(
            ([id, f]) =>
              f.pose === 'typing' && previous.get(id)?.pose === 'typing',
          )
        )
          return previous
        return next
      })
      // Sample the floor position and its desk mask on the same paint.
      if (poses.some((pose) => ['walk', 'rise', 'sit', 'door'].includes(pose)))
        animation = requestAnimationFrame(animate)
      else idleTimer = window.setTimeout(update, quiet ? 500 : 60)
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => {
      cancel()
      document.removeEventListener('visibilitychange', update)
    }
  }, [seats, auto])
  const current = frames.get(selected)
  const partnerName = (id?: string) =>
    id ? seats.find((s) => s.id === id)?.name || id : ''
  const text = current
    ? current.label +
      (current.action === 'chat' && current.partnerId
        ? ' · ' + partnerName(current.partnerId)
        : '')
    : '尚无人入场'
  useEffect(() => onDescription(text), [text, onDescription])
  return (
    <>
      <DeskEquipment />
      <ChairBacks />
      <img
        alt=""
        data-office-prop
        src="/office/furniture/open-door.png"
        className="ol-door-leaf"
      />
      {seats.map((s) => {
        const f = frames.get(s.id)
        return (
          positions[s.id]?.facing === 'north' &&
          f?.atDesk &&
          f.action === 'work' && (
            <WorkDisplay
              key={s.id}
              seat={s}
              projectName={projectNames.get(s.appIds[0]) || '工作台'}
            />
          )
        )
      })}
      <img
        className="ol-charging-shelf"
        data-office-prop
        src="/office/furniture/charging-shelf.webp"
        alt="开口朝向 A3 的深木色手机充电柜"
        style={{ ...at(chargingShelf), zIndex: 100 + chargingShelf[1] }}
      />
      <button
        className="ol-cooler"
        type="button"
        title="让选中的角色去接水"
        disabled={!seats.some((s) => s.id === selected && occupied(s))}
        onClick={onWater}
        aria-label="让选中的角色去接水"
        style={{ ...at(cooler), zIndex: 100 + cooler[1] }}
      >
        <img
          data-office-prop
          src="/office/furniture/bottled-water-cooler.webp"
          alt="出水口朝下方通道的白色桶装饮水机"
        />
      </button>
      {seats.map((s) => {
        const frame = frames.get(s.id)
        return (
          frame && (
            <Person
              key={s.character.id}
              seat={s}
              frame={frame}
              labels={labels}
              selected={selected === s.id}
              onSelect={onSelect}
              muted={muted.has(s.id)}
              partner={partnerName(frame.partnerId)}
            />
          )
        )
      })}
    </>
  )
}

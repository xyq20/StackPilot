import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { OfficeSeat } from './model'
import { cooler, type LifeFrame, type Point } from './office-life'
import { positions } from './office-geometry'
import { lookSrc } from './office-looks'
import './office-motion-figure.css'

type Pack = 'steps' | 'desk' | 'rise' | 'social'
type Frame = { pack: Pack; row: number; column: number; mirror: boolean }
type Props = { seat: OfficeSeat; frame: LifeFrame }
const cellWidth = 192
const viewRow = { south: 0, north: 1, east: 2, west: 2 }
const clamp = (x: number) => Math.min(1, Math.max(0, x))
const loaded = new Map<string, Promise<HTMLImageElement>>()

// Keep recently used atlases decoded; projects with a large cast only pay for
// the looks and activities that have actually appeared.
function loadPack(url: string) {
  const existing = loaded.get(url)
  if (existing) {
    loaded.delete(url)
    loaded.set(url, existing)
    return existing
  }
  const img = new Image()
  img.src = url
  const result = img
    .decode()
    .then(() => img)
    .catch((error) => {
      loaded.delete(url)
      throw error
    })
  loaded.set(url, result)
  if (loaded.size > 12) loaded.delete(loaded.keys().next().value!)
  return result
}

function observeMotion(change: () => void) {
  const preference = matchMedia('(prefers-reduced-motion: reduce)')
  preference.addEventListener('change', change)
  document.addEventListener('visibilitychange', change)
  return () => {
    preference.removeEventListener('change', change)
    document.removeEventListener('visibilitychange', change)
  }
}
const reduceMotion = () =>
  document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches

function spriteFrame(
  seat: OfficeSeat,
  state: LifeFrame,
  stride: number,
  reduced: boolean,
): Frame {
  const face = state.atDesk ? positions[state.blendSeatId || seat.id].facing : state.facing
  const mirror = face === 'west'
  const row = viewRow[face]
  const pg = clamp(state.progress)
  const step = (pack: Pack, column: number, r = row): Frame => ({
    pack,
    row: r,
    column,
    mirror,
  })
  const alternate = (cycles: number) =>
    !reduced && Math.sin(pg * Math.PI * 2 * cycles) > 0.32
  if (state.pose === 'rise' || state.pose === 'sit') {
    return step('rise', Math.round(3 * (1 - clamp(state.seatBlend))))
  }
  if (state.pose === 'walk') {
    const direction = state.carryingCup ? 3 : row
    if (reduced || state.speed < 35) return step('steps', 8, direction)
    if (state.speed < 104)
      return step('steps', stride < 0.5 ? 9 : 10, direction)
    return step('steps', Math.floor(stride * 8 + 0.5) % 8, direction)
  }
  if (state.atDesk) {
    if (state.action === 'slack') {
      if (state.pose === 'reach')
        return step('desk', reduced ? 2 : Math.round(pg * 2))
      if (state.pose === 'pocket')
        return step('desk', reduced ? 0 : Math.round((1 - pg) * 2))
      return step('desk', alternate(4) ? 5 : 2)
    }
    if (state.action === 'stretch') {
      const amount = state.pose === 'relax' ? 1 - pg : Math.min(1, pg * 3.3)
      const col = amount < 0.2 ? 0 : amount < 0.7 ? 3 : alternate(1.3) ? 6 : 4
      return step('desk', reduced ? 4 : col)
    }
    return step('desk', 0)
  }
  switch (state.pose) {
    case 'reach':
      return step('social', reduced ? 2 : Math.round(pg * 2), 0)
    case 'fill':
      return step('social', alternate(1) ? 7 : 2, 0)
    case 'sip':
      return step(
        'social',
        !reduced && pg < 0.12 ? 3 : alternate(1.4) ? 8 : 4,
        0,
      )
    case 'relax':
      return step('social', reduced ? 2 : Math.round(4 - pg * 2), 0)
    case 'speak':
    case 'door':
      return step(
        'social',
        !reduced && (pg < 0.18 || pg > 0.9) ? 5 : alternate(1.6) ? 9 : 6,
        0,
      )
    case 'listen':
      return step('social', alternate(1) ? 10 : 0, 0)
    default:
      return step('steps', 8)
  }
}

// Measured rims on the 192 × 256 outstretched-cup drawings. The water stream
// is attached to that glass instead of floating beside the character.
const cupRims: Record<string, [number, number]> = {
  m01:[172,117],m02:[173,116],m03:[173,117],m04:[175,117],m05:[174,116],
  m06:[164,121],m07:[162,121],m08:[166,121],m09:[170,123],m10:[170,122],
  f01:[175,116],f02:[175,116],f03:[174,115],f04:[175,115],f05:[174,116],
  f06:[172,122],f07:[164,122],f08:[172,121],f09:[161,123],f10:[172,122],
}
function drawWater(ctx: CanvasRenderingContext2D, look: string, feet: Point, phase: number) {
  // The blue spout is 9 scene pixels right and 67 above the dispenser base.
  // Convert it to the same sprite coordinates as the actor's measured cup rim.
  const scale = 164 / 256
  const tapX = 96 + (cooler[0] + 9 - feet[0]) / scale
  const tapY = 256 + (cooler[1] - 67 - feet[1]) / scale
  const [rimX, rimY] = cupRims[look] || cupRims.m01
  const endX = Math.max(rimX - 6, Math.min(rimX + 6, tapX))
  ctx.strokeStyle = '#92d9ed'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(tapX, tapY)
  ctx.lineTo(endX, rimY)
  ctx.stroke()
  const t = 0.14 + (phase % 5) * 0.13
  const dx = endX - tapX, dy = rimY - tapY
  ctx.strokeStyle = '#edfdff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(tapX + t * dx, tapY + t * dy)
  ctx.lineTo(tapX + (t + 0.18) * dx, tapY + (t + 0.18) * dy)
  ctx.stroke()
}

export function MotionFigure({ seat, frame }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const walk = useRef<{ last: number; cycle: number; moving: boolean }>({
    last: 0,
    cycle: 0,
    moving: false,
  })
  const previous = useRef('')
  const hasCup = useRef(false)
  const reduced = useSyncExternalStore(observeMotion, reduceMotion, () => true)
  const look = seat.character.look
  const blend = clamp(frame.seatBlend)
  const pack = spriteFrame(seat, frame, 0, reduced).pack
  const url = '/office/people/motion/' + look + '-' + pack + '.webp'
  const [decoded, setDecoded] = useState<{
    image: HTMLImageElement
    url: string
    look: string
  } | null>(null)
  useEffect(() => {
    let active = true
    loadPack(url)
      .then((image) => {
        if (active) setDecoded({ image, url, look })
      })
      .catch(() => {
        if (active) {previous.current='';setDecoded(null)}
      })
    return () => {
      active = false
    }
  }, [url, look])

  useLayoutEffect(() => {
    if (!decoded || decoded.url !== url || !canvas.current || document.hidden)
      return
    if(frame.carryingCup)hasCup.current=true
    else if(frame.action!=='drink'||frame.pose==='relax')hasCup.current=false
    const moving = frame.pose === 'walk'
    if (moving) {
      // The route's stride wraps once per 57 scene pixels. Two of those lengths
      // are one full alternating gait, so the pace stays tied to ground speed.
      const delta = walk.current.moving
        ? (frame.stride - walk.current.last + 1) % 1
        : 0
      walk.current.cycle = (walk.current.cycle + delta * 0.5) % 1
      walk.current.last = frame.stride
    } else {
      walk.current.cycle = 0
    }
    walk.current.moving = moving
    const f = spriteFrame(seat, frame, walk.current.cycle, reduced)
    if(hasCup.current && frame.pose==='reach' && f.pack==='social')f.column=frame.progress>.65?3:2
    const pour=frame.pose==='fill'?Math.min(14,Math.floor(frame.progress*15)):-1
    const cellHeight = f.pack === 'desk' ? 192 : 256
    // A rising figure starts exactly at the seated shoe anchor on its 192px
    // canvas. As the legs straighten, reveal the upper part of the 256px cell.
    const trim = f.pack === 'rise' ? Math.round(64 * blend) : 0
    const height = cellHeight - trim
    const signature = [url, f.row, f.column, f.mirror, trim, reduced?0:pour].join('|')
    if (previous.current === signature) return
    const el = canvas.current,
      ctx = el.getContext('2d')
    if (!ctx) return
    if (el.width !== cellWidth) el.width = cellWidth
    if (el.height !== height) el.height = height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cellWidth, height)
    if (f.mirror) ctx.setTransform(-1, 0, 0, 1, cellWidth, 0)
    ctx.drawImage(
      decoded.image,
      f.column * cellWidth,
      f.row * cellHeight + trim,
      cellWidth,
      height,
      0,
      0,
      cellWidth,
      height,
    )
    if (pour >= 0) drawWater(ctx, look, frame.p, reduced ? 0 : pour)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    previous.current = signature
  }, [frame, seat, decoded, url, reduced, blend,look])

  // The scene uses a taller box once the character stands. Reserve room for
  // extending arms/shoes without changing the position of the floor anchor.
  const width = 100 + 16 * (1 - blend) + '%'
  const style = { width, marginLeft: -8 * (1 - blend) + '%' }
  if (!decoded || decoded.look !== look) {
    const side = frame.atDesk ? positions[frame.blendSeatId || seat.id].facing : frame.facing
    const fallback = frame.atDesk
      ? '/office/people/seated/' +
        look +
        '-' +
        (['west', 'east'].includes(side)
          ? 'right'
          : side === 'north'
            ? 'back'
            : 'front') +
        '.png'
      : lookSrc(look, side === 'north' ? 'back' : 'front')
    return (
      <img
        data-office-sprite
        data-motion-pose={frame.pose}
        className="om-figure"
        alt=""
        src={fallback}
        style={{
          ...style,
          transform: side === 'west' ? 'scaleX(-1)' : undefined,
        }}
      />
    )
  }
  return (
    <canvas
      ref={canvas}
      data-office-sprite
      data-motion-pose={frame.pose}
      aria-hidden="true"
      className="om-figure"
      style={style}
    />
  )
}

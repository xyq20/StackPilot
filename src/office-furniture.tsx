import { useEffect, useRef } from 'react'
import { positions } from './office-geometry'
import { handAnchors, type HandView } from './office-hand-anchors'
import { northHands } from './office-north-anchors'
import { type Point } from './office-life'
import type { OfficeSeat } from './model'

const stageWidth = 1509,
  stageHeight = 1042
const spriteSize = 155

// Foreground desk edges in the room artwork, shared by resting gestures and
// their transitions into the aisle. Values are percentages of the actor box.
export function deskSilhouette(
  id: string,
  foot: Point,
  width: number,
  height: number,
) {
  const { facing } = positions[id]
  if (facing === 'north') return undefined
  const bound = (n: number) => Math.max(0, Math.min(100, n))
  const localY = (y: number) => bound(100 * (1 + (y - foot[1]) / height))
  if (facing === 'south') {
    const rim = localY(id.startsWith('C') ? 853 : 434)
    return rim < 100
      ? [
          [-20, 0],
          [120, 0],
          [120, rim],
          [-20, rim],
        ]
      : undefined
  }
  const left = facing === 'east'
  const x = 50 + (100 * ((left ? 994 : 1218) - foot[0])) / width
  const y = localY(deskKeys(id)[1] - 6)
  if ((left && x >= 120) || (!left && x <= -20)) return undefined
  return left
    ? [
        [-20, 0],
        [120, 0],
        [120, y],
        [x, y],
        [x, 100],
        [-20, 100],
      ]
    : [
        [-20, 0],
        [120, 0],
        [120, 100],
        [x, 100],
        [x, y],
        [-20, y],
      ]
}

/** Fixed physical keyboard locations on the tabletop, in room coordinates. */
export function deskKeys(id: string): Point {
  const { chair, screen, facing } = positions[id]
  if (facing === 'east' || facing === 'west')
    return [facing === 'east' ? 1014 : 1198, screen[1] + 5]
  const y =
    id[0] === 'A' ? 177 : id[0] === 'C' ? 868 : facing === 'south' ? 449 : 609
  return [chair[0], y]
}

export function workstationFor(seat: OfficeSeat) {
  const { facing } = positions[seat.id]
  const view: HandView =
    facing === 'north' ? 'back' : facing === 'south' ? 'front' : 'right'
  const mirrored = facing === 'west',
    scale = spriteSize / 192,
    side = view === 'right'
  const hands =
    view === 'back'
      ? northHands(seat.character.look)
      : handAnchors(seat.character.look, view)
  const contactX = side
    ? hands.right[0] + 5
    : (hands.left[0] + hands.right[0]) / 2
  const contactY = side
    ? hands.right[1] + 3
    : (hands.left[1] + hands.right[1]) / 2 + (view === 'back' ? -2 : 3)
  const keyboard = deskKeys(seat.id)
  const foot: Point = [
    keyboard[0] - (contactX - 96) * scale * (mirrored ? -1 : 1),
    keyboard[1] + (192 - contactY) * scale,
  ]
  // Express the real desk edge in the unmirrored sprite's coordinates.
  const edge =
    view === 'front'
      ? 192 + ((seat.id[0] === 'C' ? 853 : 434) - foot[1]) / scale
      : side
        ? 96 +
          ((mirrored ? 1218 : 994) - foot[0]) / (scale * (mirrored ? -1 : 1))
        : Infinity
  const src =
    view === 'back'
      ? '/office/people/desk-north/' + seat.character.look + '.png'
      : '/office/people/seated/' + seat.character.look + '-' + view + '.png'
  return { view, foot, size: spriteSize, side, mirrored, edge, src }
}

export function DeskEquipment() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let mounted = true
    const keys = ['horizontal', 'vertical'].map((name) => {
      const image = new Image()
      image.src = '/office/keyboard-' + name + '.png'
      return image
    })
    Promise.all(keys.map((i) => i.decode()))
      .then(() => {
        const c = ref.current?.getContext('2d')
        if (!mounted || !c) return
        c.clearRect(0, 0, stageWidth, stageHeight)
        for (const [id, p] of Object.entries(positions)) {
          const side = p.facing === 'east' || p.facing === 'west',
            [x, y] = deskKeys(id)
          const w = side ? 25 : p.facing === 'north' ? 92 : 79,
            h = side ? 65 : 21
          c.drawImage(keys[Number(side)], x - w / 2, y - h / 2, w, h)
        }
      })
      .catch((e) => {
        if (mounted) console.error('无法载入桌面键盘', e)
      })
    return () => {
      mounted = false
    }
  }, [])
  return (
    <canvas
      ref={ref}
      width={stageWidth}
      height={stageHeight}
      data-office-prop
      className="ol-desk-equipment"
      aria-hidden="true"
    />
  )
}
// Only north-facing desks show the front of a monitor from this camera.
export function WorkDisplay({
  seat,
  projectName,
}: {
  seat: OfficeSeat
  projectName: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current,
      c = canvas?.getContext('2d')
    if (!canvas || !c) return
    let step = 0
    function draw() {
      if (!c || document.hidden) return
      const w = 180,
        h = 62
      c.fillStyle = '#e5edf0'
      c.fillRect(0, 0, w, h)
      c.fillStyle = '#344557'
      c.fillRect(0, 0, w, 12)
      c.font = '8px sans-serif'
      c.fillStyle = '#f4f5fc'
      c.fillText(projectName || '工作台', 6, 9, 145)
      c.fillStyle = '#bbd2ce'
      c.fillRect(4, 16, 24, 42)
      for (let row = 0; row < 4; row++) {
        const y = 17 + row * 10
        c.fillStyle = row === step % 4 ? '#c0dcd5' : '#f5f8f8'
        c.fillRect(32, y, 143, 8)
        c.fillStyle = '#a7b8bf'
        c.fillRect(37, y + 3, 19 + ((row * 13) % 23), 2)
        c.fillRect(79, y + 3, 17 + ((row * 7) % 15), 2)
        c.fillStyle = row === step % 4 ? '#56958a' : '#b1c5cf'
        c.fillRect(122, y + 2, 18 + ((row * 9) % 22), 3)
      }
      step++
    }
    draw()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(draw, 1850)
    return () => clearInterval(timer)
  }, [projectName])
  return (
    <canvas
      ref={ref}
      width="180"
      height="62"
      data-office-prop
      aria-label="办公屏幕"
      className="ol-work-display"
      style={{
        left: (positions[seat.id].screen[0] / stageWidth) * 100 + '%',
        top: (positions[seat.id].screen[1] / stageHeight) * 100 + '%',
      }}
    />
  )
}

// The rear shell of a north-facing swivel chair is nearer the camera than its
// occupant. Preserve the actual upholstery and silhouette from the room plate.
const chairBacks = [
  ['A1', 177, 197, 97, 74],
  ['A2', 370, 196, 96, 74],
  ['A3', 562, 197, 95, 74],
  ['B4', 197, 628, 97, 73],
  ['B5', 393, 628, 97, 73],
  ['B6', 588, 628, 98, 73],
] as const
export function ChairBacks() {
  return (
    <>
      {chairBacks.map(([id, x, y, width, height]) => (
        <img
          key={id}
          alt=""
          data-office-prop
          className="ol-chair-back"
          src={'/office/furniture/back-' + id + '.png'}
          style={{
            left: (x / stageWidth) * 100 + '%',
            top: (y / stageHeight) * 100 + '%',
            width: (width / stageWidth) * 100 + '%',
            height: (height / stageHeight) * 100 + '%',
            zIndex: 100 + positions[id].chair[1] + 2,
          }}
        />
      ))}
    </>
  )
}

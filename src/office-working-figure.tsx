import { northHands } from './office-north-anchors'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  handAnchors,
  frontHandRadii,
  type HandPair,
  type HandView,
} from './office-hand-anchors'

const size = 192
const sides = ['left', 'right'] as const
type Props = {
  src: string
  view: HandView
  mirror: boolean
  typing: boolean
  edge: number
}
type Prepared = {
  src: string
  view: HandView
  frames: ImageData[]
  edge: number
}
const spriteStyle = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  objectPosition: 'center bottom',
} as const

function localImage(src: string) {
  const img = new Image()
  img.src = src
  return img.decode().then(() => img)
}

function strength(
  x: number,
  y: number,
  center: [number, number],
  rx: number,
  ry: number,
) {
  const distance = ((x - center[0]) / rx) ** 2 + ((y - center[1]) / ry) ** 2
  return distance < 1 ? (1 - distance) ** 2 : 0
}

// Sample from the unmodified pose on both sides of a subpixel vertical offset.
// Premultiplied interpolation keeps the transparent silhouette free of fringes.
function shiftPixel(
  original: Uint8ClampedArray,
  output: Uint8ClampedArray,
  x: number,
  y: number,
  drop: number,
) {
  const sample = Math.max(0, Math.min(size - 1, y - drop)),
    start = Math.floor(sample),
    mix = sample - start
  const i = 4 * (start * size + x),
    j = 4 * (Math.min(size - 1, start + 1) * size + x),
    dest = 4 * (y * size + x)
  const a = original[i + 3] * (1 - mix),
    b = original[j + 3] * mix,
    total = a + b
  output[dest + 3] = total
  for (let channel = 0; channel < 3; channel++)
    output[dest + channel] = total
      ? (original[i + channel] * a + original[j + channel] * b) / total
      : 0
}

function keypress(
  base: ImageData,
  hands: HandPair,
  view: HandView,
  drops: [number, number],
) {
  const frame = new ImageData(new Uint8ClampedArray(base.data), size, size)
  const rx = view === 'back' ? 13 : 24,
    ry = view === 'back' ? 12 : 18
  const left = Math.max(
    0,
    Math.floor(Math.min(hands.left[0], hands.right[0]) - rx),
  )
  const right = Math.min(
    size - 1,
    Math.ceil(Math.max(hands.left[0], hands.right[0]) + rx),
  )
  const top = Math.max(
    0,
    Math.floor(Math.min(hands.left[1], hands.right[1]) - ry),
  )
  const bottom = Math.min(
    size - 1,
    Math.ceil(Math.max(hands.left[1], hands.right[1]) + ry),
  )
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const a = strength(x, y, hands.left, rx, ry) * drops[0],
        b = strength(x, y, hands.right, rx, ry) * drops[1]
      const dy = Math.max(a, b)
      if (dy > 0.012) shiftPixel(base.data, frame.data, x, y, dy)
    }
  return frame
}

// Draw the seated body behind the desk. Keep the near sleeves and fingers above
// the top; the keys themselves stay on the room layer when the occupant leaves.
function deskOcclusion(
  frame: ImageData,
  view: HandView,
  edge: number,
  hands: HandPair,
  radii: HandPair,
) {
  const pixels = frame.data
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = 4 * (y * size + x)
      if (!pixels[i + 3]) continue
      const beyond = view === 'front' ? y - edge : x - edge
      if (beyond <= -1) continue
      let keep = 0
      if (view === 'front') {
        for (const k of sides) {
          const [px, py] = hands[k],
            [rx, ry] = radii[k]
          const up = Math.max(0, py - y)
          const center = px + (k === 'left' ? -1 : 1) * Math.min(5, up * 0.2)
          const d =
            ((x - center) / (rx + Math.min(3, up * 0.18))) ** 2 +
            (Math.max(0, y - py) / ry) ** 2
          keep = Math.max(keep, Math.max(0, Math.min(1, (1.08 - d) * 5)))
        }
      } else {
        // The knees and shoes tuck below the side of the worktop. The hand,
        // forearm and head in the same column remain in front of it.
        keep = Math.min(1, Math.max(0, (hands.right[1] + 9 - y) / 2))
      }
      const cover = Math.min(1, Math.max(0, beyond + 1))
      pixels[i + 3] *= 1 - cover * (1 - keep)
    }
}

async function prepare(
  src: string,
  view: HandView,
  edge: number,
  animated: boolean,
): Promise<Prepared> {
  const image = await localImage(src)
  const buffer = document.createElement('canvas')
  buffer.width = buffer.height = size
  const ctx = buffer.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw Error('Canvas unavailable')
  ctx.drawImage(image, 0, 0, size, size)
  const base = ctx.getImageData(0, 0, size, size)
  const id = src.match(/(?:^|\/)([mf]\d\d)(?:-|\.)/)?.[1] || 'm01'
  const hands = view === 'back' ? northHands(id) : handAnchors(id, view),
    radii = frontHandRadii(id)
  // Back-view sleeves only hint at the keystroke; no body translation is used.
  const depth = view === 'back' ? 1.9 : 3.2
  const phases: [number, number][] = animated
    ? [
        [0, 0],
        [depth * 0.52, 0],
        [depth, 0],
        [0, depth * 0.52],
        [0, depth],
      ]
    : [[0, 0]]
  const frames = phases.map((drops) => {
    const frame = keypress(base, hands, view, drops)
    if (view !== 'back') deskOcclusion(frame, view, edge, hands, radii)
    return frame
  })
  return { src, view, edge, frames }
}

const beats = [0, 1, 2, 1, 0, 3, 4, 3, 0, 1, 2, 0, 0, 0, 3, 4, 0, 0]
function WorkingCanvas({
  sheet,
  mirror,
  typing,
}: {
  sheet: Prepared
  mirror: boolean
  typing: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const frames = sheet.frames
    let visible = true,
      timer: number | undefined,
      beat = sheet.src.charCodeAt(sheet.src.lastIndexOf('-') - 1) % beats.length
    let last = -1
    function draw(frame: number) {
      if (frame !== last) {
        ctx!.putImageData(frames[frame], 0, 0)
        last = frame
      }
    }
    function tick() {
      draw(beats[beat])
      beat = (beat + 1) % beats.length
    }
    function sync() {
      const playing =
        typing &&
        frames.length > 1 &&
        visible &&
        !media.matches &&
        !document.hidden
      if (playing && timer === undefined) {
        tick()
        timer = window.setInterval(tick, 115)
      } else if (!playing) {
        window.clearInterval(timer)
        timer = undefined
        draw(0)
      }
    }
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            visible = entries[0]?.isIntersecting ?? false
            sync()
          })
    observer?.observe(canvas)
    document.addEventListener('visibilitychange', sync)
    media.addEventListener('change', sync)
    sync()
    return () => {
      window.clearInterval(timer)
      observer?.disconnect()
      document.removeEventListener('visibilitychange', sync)
      media.removeEventListener('change', sync)
    }
  }, [sheet, typing])
  return (
    <canvas
      aria-hidden="true"
      ref={ref}
      width={size}
      height={size}
      data-office-sprite
      className={'ol-figure ol-working-figure' + (mirror ? ' mirror' : '')}
      style={spriteStyle}
    />
  )
}

export function WorkingFigure({ src, view, mirror, typing, edge }: Props) {
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  useEffect(() => {
    let active = true
    if (typing || view !== 'back') {
      prepare(src, view, edge, typing)
        .then((sheet) => {
          if (active) setPrepared(sheet)
        })
        .catch(() => {
          if (active) setPrepared(null)
        })
    } else setPrepared(null)
    return () => {
      active = false
    }
  }, [src, view, edge, typing])
  if (
    (typing || view !== 'back') &&
    prepared?.edge === edge &&
    prepared?.src === src &&
    prepared.view === view
  ) {
    return <WorkingCanvas sheet={prepared} typing={typing} mirror={mirror} />
  }
  return (
    <img
      alt=""
      draggable={false}
      data-office-sprite
      src={src}
      className={'ol-figure ol-working-figure' + (mirror ? ' mirror' : '')}
      style={spriteStyle}
    />
  )
}

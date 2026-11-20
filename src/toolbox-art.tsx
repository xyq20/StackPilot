import { useEffect, useRef } from 'react'

// Isometric projection keeps the plates, connector pins and traces on one grid.
export function ToolboxArt() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return
    function render() {
      if (!ctx || !canvas) return
      const bounds = canvas.getBoundingClientRect(),
        dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = Math.round(bounds.width * dpr)
      canvas.height = Math.round(bounds.height * dpr)
      ctx.setTransform(canvas.width / 300, 0, 0, canvas.height / 194, 0, 0)
      type Point = readonly [number, number]
      const iso = (x: number, y: number, z: number): Point => [
        161 + 0.93 * (x - y),
        149 + 0.405 * (x + y) - z,
      ]
      const line = (pts: Point[], color: string, width = 1) => {
        ctx.beginPath()
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.stroke()
      }
      const face = (
        pts: Point[],
        color: string | CanvasGradient,
        edge: string,
      ) => {
        ctx.beginPath()
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.closePath()
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = edge
        ctx.lineWidth = 0.85
        ctx.stroke()
      }
      for (let i = -200; i < 210; i += 14) {
        line([iso(i, -160, 0), iso(i, 160, 0)], '#8c89e324', 0.7)
        line([iso(-160, i, 0), iso(160, i, 0)], '#8c89e324', 0.7)
      }
      const glow = ctx.createRadialGradient(157, 127, 0, 157, 127, 95)
      glow.addColorStop(0, '#8662f55c')
      glow.addColorStop(1, '#8763ea00')
      ctx.fillStyle = glow
      ctx.fillRect(60, 31, 200, 196)
      for (let i = 0; i < 4; i++) {
        const offset = -30 + i * 20
        for (const sign of [-1, 1]) {
          line(
            [
              iso(offset, sign * 40, 1),
              iso(offset, sign * 60, 1),
              iso(offset + sign * 12, sign * 72, 1),
              iso(offset + sign * 12, sign * (87 + i * 7), 1),
            ],
            i % 2 ? '#9797ed83' : '#557ac988',
            1.1,
          )
          const [x, y] = iso(offset + sign * 12, sign * (87 + i * 7), 1)
          ctx.beginPath()
          ctx.ellipse(x, y, 2.7, 1.45, 0, 0, Math.PI * 2)
          ctx.strokeStyle = '#aaaff5'
          ctx.stroke()
        }
      }
      const plate = (
        size: number,
        z: number,
        depth: number,
        colors: string[],
      ) => {
        const s = size / 2
        const grad = ctx.createLinearGradient(110, 60, 205, 145)
        grad.addColorStop(0, colors[0])
        grad.addColorStop(1, colors[1])
        face(
          [iso(-s, -s, z), iso(s, -s, z), iso(s, s, z), iso(-s, s, z)],
          grad,
          colors[4],
        )
        face(
          [
            iso(-s, s, z),
            iso(s, s, z),
            iso(s, s, z - depth),
            iso(-s, s, z - depth),
          ],
          colors[2],
          colors[4],
        )
        face(
          [
            iso(s, -s, z),
            iso(s, s, z),
            iso(s, s, z - depth),
            iso(s, -s, z - depth),
          ],
          colors[3],
          colors[4],
        )
      }
      plate(95, 14, 8, ['#35395e', '#555075', '#34324d', '#292b49', '#7e79b1'])
      plate(91, 34, 8, ['#625593', '#7765b4', '#4b426e', '#47415e', '#aca0dc'])
      plate(82, 53, 8, ['#8c7dcf', '#ada1e5', '#6a5c9d', '#53477d', '#cfc4fa'])
      ctx.shadowColor = '#ab8bff'
      ctx.shadowBlur = 10
      line([iso(-40, 41, 54), iso(40, 41, 54), iso(41, -39, 54)], '#d8bdff', 2)
      ctx.shadowBlur = 0
      plate(70, 82, 11, ['#b5a8f3', '#766cc0', '#676296', '#564e85', '#d6c8fe'])
      const rim = 29
      line(
        [
          iso(-rim, -rim, 82.5),
          iso(rim, -rim, 82.5),
          iso(rim, rim, 82.5),
          iso(-rim, rim, 82.5),
          iso(-rim, -rim, 82.5),
        ],
        '#e3dfff99',
        0.8,
      )
      line([iso(-16, -8, 83), iso(-6, 0, 83), iso(-16, 8, 83)], '#f5efff', 3.5)
      line([iso(-2, 9, 83), iso(12, 9, 83)], '#f5efff', 3.5)
      for (let i = 0; i < 9; i++)
        line([iso(-32 + i * 8, 35, 77), iso(-32 + i * 8, 35, 74)], '#d4c3f7', 1)
      for (let i = 0; i < 3; i++) {
        const [x, y] = iso(47, 12 + i * 9, 10)
        ctx.fillStyle = i === 2 ? '#6be0d6' : '#c7abfc'
        ctx.fillRect(x - 1, y - 1, 2.3, 1.6)
      }
    }
    render()
    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])
  return <canvas ref={ref} className="toolbox-art" aria-hidden="true" />
}

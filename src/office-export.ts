// Render the visible scene layers at the floor plan's native pixel resolution.
// The scene markers live on the same elements used by the interactive office.
type Bounds = { left: number; top: number; width: number; height: number }
type Context = CanvasRenderingContext2D
type SceneImage = HTMLImageElement | HTMLCanvasElement

function appearance(node: HTMLElement, stage: HTMLElement) {
  let alpha = 1
  const order: number[] = []
  for (
    let el: HTMLElement | null = node;
    el && el !== stage;
    el = el.parentElement
  ) {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') alpha = 0
    alpha *= Number(style.opacity)
    if (style.zIndex !== 'auto') order.unshift(Number(style.zIndex))
    else if (Number(style.opacity) < 1 || style.transform !== 'none')
      order.unshift(0)
  }
  return { alpha, order }
}

function imageBounds(
  img: SceneImage,
  box: Bounds = img.getBoundingClientRect(),
) {
  const { objectFit, objectPosition } = getComputedStyle(img)
  if (!['contain', 'cover', 'scale-down'].includes(objectFit)) return box
  const fit = objectFit === 'cover' ? Math.max : Math.min
  const intrinsicWidth =
    img instanceof HTMLCanvasElement ? img.width : img.naturalWidth
  const intrinsicHeight =
    img instanceof HTMLCanvasElement ? img.height : img.naturalHeight
  let scale = fit(box.width / intrinsicWidth, box.height / intrinsicHeight)
  if (objectFit === 'scale-down') scale = Math.min(1, scale)
  const width = intrinsicWidth * scale,
    height = intrinsicHeight * scale
  const position = objectPosition.split(' ')
  const inset = (space: number, pos: string) =>
    pos.endsWith('px') ? parseFloat(pos) : (space * parseFloat(pos)) / 100
  return {
    left: box.left + inset(box.width - width, position[0] || '50%'),
    top: box.top + inset(box.height - height, position[1] || '50%'),
    width,
    height,
  }
}

function paintImage(ctx: Context, img: SceneImage) {
  const style = getComputedStyle(img),
    rect = img.getBoundingClientRect()
  const width = parseFloat(style.width),
    height = parseFloat(style.height)
  if (!width || !height || !rect.width || !rect.height) return
  let matrix = new DOMMatrixReadOnly()
  for (let el: HTMLElement | null = img; el; el = el.parentElement) {
    const transform = getComputedStyle(el).transform
    if (transform !== 'none')
      matrix = new DOMMatrixReadOnly(transform).multiply(matrix)
  }
  // CSS exposes a transformed bounding box. Reconstruct its local axes so a
  // leaning or mirrored character keeps its orientation in the exported frame.
  const xs = [
    0,
    matrix.a * width,
    matrix.c * height,
    matrix.a * width + matrix.c * height,
  ]
  const ys = [
    0,
    matrix.b * width,
    matrix.d * height,
    matrix.b * width + matrix.d * height,
  ]
  const minX = Math.min(...xs),
    minY = Math.min(...ys)
  const sx = rect.width / (Math.max(...xs) - minX),
    sy = rect.height / (Math.max(...ys) - minY)
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return
  const object = imageBounds(img, { left: 0, top: 0, width, height })
  ctx.save()
  const mask = img.closest<HTMLElement>('[data-office-clip]')
  if (mask) {
    const bounds = mask.getBoundingClientRect()
    const points = mask.dataset.officeClip!.split(',').map(Number)
    ctx.beginPath()
    for (let i = 0; i < points.length; i += 2) {
      const x = bounds.left + (bounds.width * points[i]) / 100
      const y = bounds.top + (bounds.height * points[i + 1]) / 100
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.clip()
  }
  ctx.transform(
    matrix.a * sx,
    matrix.b * sy,
    matrix.c * sx,
    matrix.d * sy,
    rect.left - minX * sx,
    rect.top - minY * sy,
  )
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  ctx.clip()
  ctx.imageSmoothingEnabled = !['pixelated', 'crisp-edges'].includes(
    style.imageRendering,
  )
  ctx.drawImage(img, object.left, object.top, object.width, object.height)
  ctx.restore()
}

function renderedScale(el: HTMLElement, rect: Bounds) {
  return el.offsetWidth ? rect.width / el.offsetWidth : 1
}
function ellipseRadius(css: string, bounds: Bounds, scale: number) {
  const radius = parseFloat(css) || 0
  return Math.min(
    css.includes('%')
      ? (Math.min(bounds.width, bounds.height) * radius) / 100
      : radius * scale,
    bounds.width / 2,
    bounds.height / 2,
  )
}
function paintChip(ctx: Context, el: HTMLElement) {
  const box = el.getBoundingClientRect(),
    style = getComputedStyle(el)
  if (!box.width || !box.height) return
  const scale = renderedScale(el, box)
  const radii = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ].map((radius) => ellipseRadius(radius, box, scale))
  ctx.beginPath()
  ctx.roundRect(box.left, box.top, box.width, box.height, radii)
  ctx.save()
  const shadow = /^(.+) (-?[.\d]+)px (-?[.\d]+)px ([.\d]+)px 0px$/.exec(
    style.boxShadow,
  )
  if (shadow) {
    const pixelScale = scale * Math.abs(ctx.getTransform().a)
    ctx.shadowColor = shadow[1]
    ctx.shadowOffsetX = Number(shadow[2]) * pixelScale
    ctx.shadowOffsetY = Number(shadow[3]) * pixelScale
    ctx.shadowBlur = Number(shadow[4]) * pixelScale
  }
  ctx.fillStyle = style.backgroundColor
  ctx.fill()
  ctx.restore()
  const border = parseFloat(style.borderTopWidth) * scale
  if (
    border > 0 &&
    style.borderTopStyle !== 'none' &&
    box.width > border &&
    box.height > border
  ) {
    ctx.beginPath()
    ctx.roundRect(
      box.left + border / 2,
      box.top + border / 2,
      box.width - border,
      box.height - border,
      radii.map((radius) => Math.max(0, radius - border / 2)),
    )
    ctx.strokeStyle = style.borderTopColor
    ctx.lineWidth = border
    ctx.stroke()
  }
}

function paintText(ctx: Context, el: HTMLElement) {
  const box = el.getBoundingClientRect(),
    style = getComputedStyle(el)
  if (
    !box.width ||
    !box.height ||
    style.visibility === 'hidden' ||
    style.display === 'none'
  )
    return
  let text = (el.innerText || '').trim().replace(/\s+/g, ' ')
  if (!text) return
  const scale = renderedScale(el, box)
  const padLeft = parseFloat(style.paddingLeft) * scale,
    padRight = parseFloat(style.paddingRight) * scale
  const x = box.left + padLeft,
    width = Math.max(0, box.width - padLeft - padRight)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, box.top, width, box.height)
  ctx.clip()
  ctx.font =
    style.fontStyle +
    ' ' +
    style.fontWeight +
    ' ' +
    parseFloat(style.fontSize) * scale +
    'px ' +
    style.fontFamily
  if ('letterSpacing' in ctx)
    ctx.letterSpacing = (parseFloat(style.letterSpacing) || 0) * scale + 'px'
  if (
    style.textOverflow === 'ellipsis' &&
    ctx.measureText(text).width > width
  ) {
    const chars = Array.from(text)
    while (chars.length && ctx.measureText(chars.join('') + '…').width > width)
      chars.pop()
    text = chars.join('') + '…'
  }
  const centered = style.textAlign === 'center',
    right = style.textAlign === 'right' || style.textAlign === 'end'
  ctx.textAlign = centered ? 'center' : right ? 'right' : 'left'
  ctx.textBaseline = 'alphabetic'
  const metrics = ctx.measureText(text)
  const topToBaseline = Number.isFinite(metrics.fontBoundingBoxAscent)
    ? (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2
    : parseFloat(style.fontSize) * scale * 0.32
  ctx.fillStyle = style.color
  ctx.fillText(
    text,
    x + (centered ? width / 2 : right ? width : 0),
    box.top + box.height / 2 + topToBaseline,
  )
  ctx.restore()
}

export async function exportOfficeScene(stage: HTMLElement): Promise<void> {
  const floor = stage.querySelector<HTMLImageElement>(
    'img[data-office-background]',
  )
  if (!floor) throw Error('工作间底图尚未就绪。')
  const sprites = Array.from(
    stage.querySelectorAll<HTMLImageElement>(
      'img[data-office-sprite],img[data-office-prop]',
    ),
  )
  await Promise.all([
    document.fonts.ready,
    ...[floor, ...sprites].map((img) => img.decode()),
  ])
  if (!stage.isConnected) throw Error('工作间画面已关闭。')
  const frame = imageBounds(floor)
  if (!frame.width || !frame.height || !floor.naturalWidth)
    throw Error('工作间画面尚未显示。')
  const canvas = document.createElement('canvas')
  canvas.width = floor.naturalWidth
  canvas.height = floor.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw Error('浏览器无法创建场景画布。')
  const sx = canvas.width / frame.width,
    sy = canvas.height / frame.height
  ctx.setTransform(sx, 0, 0, sy, -sx * frame.left, -sy * frame.top)
  paintImage(ctx, floor)

  const layers = Array.from(
    stage.querySelectorAll<HTMLElement>(
      '[data-office-screen],[data-office-sprite],[data-office-prop],[data-office-label]',
    ),
  ).map((el) => ({ el, ...appearance(el, stage) }))
  layers.sort((a, b) => {
    for (let i = 0; i < Math.max(a.order.length, b.order.length); i++) {
      const diff = (a.order[i] || 0) - (b.order[i] || 0)
      if (diff) return diff
    }
    return 0
  })
  for (const { el, alpha } of layers) {
    if (!alpha || !el.getClientRects().length) continue
    ctx.save()
    ctx.globalAlpha = alpha
    if (el instanceof HTMLImageElement || el instanceof HTMLCanvasElement)
      paintImage(ctx, el)
    else {
      paintChip(ctx, el)
      if (el.hasAttribute('data-office-label')) {
        const parts = el.querySelectorAll<HTMLElement>(
          '[data-office-dot],[data-office-text]',
        )
        if (!parts.length) paintText(ctx, el)
        parts.forEach((part) => {
          ctx.globalAlpha = alpha * appearance(part, el).alpha
          if (part.hasAttribute('data-office-dot')) paintChip(ctx, part)
          else paintText(ctx, part)
        })
      }
    }
    ctx.restore()
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw Error('浏览器未能生成工作间 PNG。')
  const url = URL.createObjectURL(blob),
    link = document.createElement('a')
  link.href = url
  link.download = '工作间场景.png'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

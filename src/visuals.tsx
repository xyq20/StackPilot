import { useId, useState } from 'react'
import {
  Box,
  Boxes,
  ChartNoAxesColumnIncreasing,
  CodeXml,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  PackageSearch,
  ScanLine,
  Sheet,
  ShoppingBag,
  Tags,
  Tickets,
  Truck,
  WalletCards,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import {
  healthName,
  kindName,
  type App,
  type Health,
  type Workspace,
} from './model'

const icons: Record<string, [LucideIcon, string]> = {
  shopping: [ShoppingBag, 'violet'],
  boxes: [Boxes, 'teal'],
  scan: [ScanLine, 'blue'],
  chart: [ChartNoAxesColumnIncreasing, 'orange'],
  image: [ImageIcon, 'pink'],
  tickets: [Tickets, 'violet'],
  truck: [Truck, 'teal'],
  sheet: [Sheet, 'teal'],
  tag: [Tags, 'orange'],
  folder: [FolderOpen, 'blue'],
  wallet: [WalletCards, 'blue'],
  file: [FileText, 'pink'],
  code: [CodeXml, 'teal'],
  workflow: [Workflow, 'violet'],
}
export function ProgramIcon({ app }: { app: App }) {
  const [Icon, color] = icons[app.icon] || [Box, 'violet']
  return (
    <span className={'program-icon ' + color}>
      <Icon size={19} strokeWidth={1.8} />
    </span>
  )
}
export function Status({ value }: { value: Health }) {
  return (
    <span className={'status ' + value}>
      <i />
      {healthName[value]}
    </span>
  )
}
export function Empty({
  title = '暂无记录',
  detail = '当前筛选条件下没有匹配的数据。',
}: {
  title?: string
  detail?: string
}) {
  return (
    <div className="empty">
      <PackageSearch size={29} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}
function curve(points: number[][]) {
  if (!points.length) return ''
  let path = 'M ' + points[0].join(' ')
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1],
      q = points[i],
      mid = (p[0] + q[0]) / 2
    path += ' C ' + [mid, p[1], mid, q[1], q[0], q[1]].join(' ')
  }
  return path
}
export function Trend({ w }: { w: Workspace }) {
  const [count, setCount] = useState(7),
    [hover, setHover] = useState<number | null>(null)
  const bins = Array.from({ length: count }, (_, i) => {
    const d = new Date(w.now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (count - 1 - i))
    return {
      date: d,
      label: d.getMonth() + 1 + '/' + String(d.getDate()).padStart(2, '0'),
      commerce: 0,
      tool: 0,
    }
  })
  const byId = new Map(w.apps.map((a) => [a.id, a.kind]))
  const binMap = new Map(bins.map((b) => [b.date.getTime(), b]))
  for (const r of w.runs) {
    const d = new Date(r.time)
    d.setHours(0, 0, 0, 0)
    const bin = binMap.get(d.getTime())
    if (bin) bin[byId.get(r.appId) || 'tool']++
  }
  const max = Math.max(4, ...bins.flatMap((b) => [b.commerce, b.tool])),
    step = Math.max(1, Math.ceil(max / 3 / 10) * 10),
    top = step * 3
  const width = 600,
    height = 132,
    start = 0,
    end = width - 1,
    x = (i: number) => start + 1 + ((end - 2) * i) / (bins.length - 1),
    y = (v: number) => height - 4 - ((height - 10) * v) / top
  const line = (key: 'commerce' | 'tool') =>
    curve(bins.map((b, i) => [x(i), y(b[key])]))
  const id = useId(),
    active = hover === null ? null : bins[hover]
  return (
    <section className="trend panel">
      <div className="trend-head">
        <div>
          <h2>任务运行趋势</h2>
          <div className="trend-legends">
            <span>
              <i />
              {kindName.commerce}
            </span>
            <span>
              <i />
              {kindName.tool}
            </span>
          </div>
        </div>
        <div className="switch-dark">
          {[7, 14].map((n) => (
            <button
              key={n}
              className={n === count ? 'selected' : ''}
              onClick={() => {
                setCount(n)
                setHover(null)
              }}
            >
              {n} 天
            </button>
          ))}
        </div>
      </div>
      <div className="plot-wrap">
        <div className="axis-y">
          {[3, 2, 1, 0].map((n) => (
            <span key={n}>{n * step}</span>
          ))}
        </div>
        <div
          className="plot"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setHover(
              Math.min(
                count - 1,
                Math.max(
                  0,
                  Math.round(((e.clientX - r.left) / r.width) * (count - 1)),
                ),
              ),
            )
          }}
        >
          <svg
            viewBox={'0 0 ' + width + ' ' + height}
            preserveAspectRatio="none"
            role="img"
            aria-label={'近 ' + count + ' 天电商自动化和团队工具任务量折线图'}
          >
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#a294ff" stopOpacity=".34" />
                <stop offset="1" stopColor="#9c86ff" stopOpacity=".015" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3].map((n) => (
              <line
                key={n}
                x1="0"
                x2={width}
                y1={y(n * step)}
                y2={y(n * step)}
                stroke="#ffffff22"
                strokeDasharray="3 5"
              />
            ))}
            <path
              d={
                line('commerce') +
                ' L ' +
                x(count - 1) +
                ' ' +
                height +
                ' L 1 ' +
                height +
                'Z'
              }
              fill={'url(#' + id + ')'}
            />
            {(['commerce', 'tool'] as const).map((key) => (
              <path
                key={key}
                d={line(key)}
                fill="none"
                stroke={key === 'commerce' ? '#ad9bff' : '#69d4c9'}
                strokeWidth="2.7"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1="0"
                y2={height}
                stroke="#ffffff77"
                strokeDasharray="3 3"
              />
            )}
          </svg>
          {active && (
            <div
              className="chart-tip"
              style={{
                left:
                  Math.max(
                    14,
                    Math.min(83, ((hover || 0) * 100) / (count - 1)),
                  ) + '%',
              }}
            >
              {active.label} · 电商 {active.commerce} / 工具 {active.tool}
            </div>
          )}
          <div className="axis-x">
            {bins.map(
              (b, i) =>
                (count === 7 ||
                  (i % 2 === 0 && i < count - 2) ||
                  i === count - 1) && (
                  <span
                    key={b.label}
                    style={{ left: (i * 100) / (count - 1) + '%' }}
                  >
                    {b.label}
                  </span>
                ),
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
export function AppName({ app }: { app: App }) {
  return (
    <div className="app-name">
      <ProgramIcon app={app} />
      <div>
        <strong>{app.name}</strong>
        <small>{app.id}</small>
      </div>
    </div>
  )
}

import type { CSSProperties } from 'react'

export type Facing = 'north' | 'south' | 'east' | 'west'
type Position = {
  desk: [number, number]
  chair: [number, number]
  stand: [number, number]
  screen: [number, number]
  facing: Facing
}
export const positions: Record<string, Position> = {}
function row(
  group: string,
  start: number,
  xs: number[],
  chairBottom: number,
  deskY: number,
  screenY: number,
  facing: Facing,
) {
  xs.forEach((x, i) => {
    positions[group + (start + i)] = {
      chair: [x, chairBottom],
      // Leave the seat sideways. Front-facing chair bottoms almost touch the desktop.
      stand: [x + 66, chairBottom + (facing === 'south' ? -16 : 8)],
      desk: facing === 'north' ? [x + 66, deskY] : [x, deskY],
      screen: [x, screenY],
      facing,
    }
  })
}
row('A', 1, [226, 420, 609], 260, 195, 111, 'north')
row('B', 1, [248, 439, 632], 435, 509, 492, 'south')
row('B', 4, [247, 440, 632], 693, 622, 548, 'north')
row('C', 1, [250, 433, 626, 811], 853, 938, 901, 'south')
;[0, 1, 2].forEach((i) => {
  const screenY = [211, 386, 555][i],
    deskY = [307, 480, 652][i],
    bottom = [275, 445, 616][i]
  positions['D' + (i * 2 + 1)] = {
    chair: [947, bottom],
    stand: [947, bottom + 50],
    desk: [941, deskY],
    screen: [1059, screenY],
    facing: 'east',
  }
  positions['D' + (i * 2 + 2)] = {
    chair: [1257, bottom],
    stand: [1257, bottom + 50],
    desk: [1256, deskY],
    screen: [1160, screenY],
    facing: 'west',
  }
})
export function at([x, y]: [number, number]): CSSProperties {
  return { left: (x / 1509) * 100 + '%', top: (y / 1042) * 100 + '%' }
}

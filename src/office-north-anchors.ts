// Palm centers in the 192 × 192 rear overhead desk sprites, in screen coordinates.
type PalmCenters = readonly [number, number, number, number]
const palms: Record<string, PalmCenters> = {
  m01: [43, 79, 150, 76],
  m02: [41, 83, 149, 78],
  m03: [40, 81, 148, 75],
  m04: [45, 79, 146, 75],
  m05: [40, 80, 151, 73],
  m06: [47, 78, 144, 73],
  m07: [48, 76, 144, 75],
  m08: [45, 80, 144, 77],
  m09: [47, 81, 145, 75],
  m10: [42, 77, 147, 75],
  f01: [45, 80, 146, 80],
  f02: [41, 80, 150, 80],
  f03: [51, 80, 140, 79],
  f04: [44, 77, 147, 77],
  f05: [47, 80, 145, 79],
  f06: [48, 79, 143, 78],
  f07: [46, 76, 145, 76],
  f08: [43, 75, 148, 75],
  f09: [53, 81, 138, 81],
  f10: [48, 77, 144, 78],
}

export function northHands(look: string): {
  left: [number, number]
  right: [number, number]
} {
  const [lx, ly, rx, ry] = Object.hasOwn(palms, look) ? palms[look] : palms.m01
  return { left: [lx, ly], right: [rx, ry] }
}

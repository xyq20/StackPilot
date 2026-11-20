// Palm centers measured in the original 192 × 192 seated sprites. All coordinates are
// screen-space. On f06–f10 the backs conceal both palms, so rear contact points
// are estimated from the upper forearms. Mirror right-profile coordinates with the sprite.
export type HandView = 'front' | 'back' | 'right'
export type HandPair = { left: [number, number]; right: [number, number] }

// Each row holds frontal centers, rear centers, right-profile centers and frontal mask radii.
type Four = readonly [number, number, number, number]
// Keep each character’s four calibration tuples together for visual comparison.
// prettier-ignore
const guides: Record<string, readonly [Four, Four, Four, Four]> = {
  m01: [[81, 133, 116, 133], [59, 121, 137, 123], [126, 119, 133, 116], [13, 8, 12, 8]],
  m02: [[79, 130, 119, 130], [59, 121, 137, 123], [130, 120, 138, 115], [15, 9, 14, 9]],
  m03: [[84, 133, 119, 133], [55, 121, 136, 123], [130, 119, 137, 116], [13, 8, 13, 8]],
  m04: [[83, 134, 119, 134], [55, 122, 136, 124], [129, 120, 137, 116], [14, 8, 13, 8]],
  m05: [[79, 132, 115, 132], [53, 120, 137, 122], [130, 116, 139, 113], [13, 8, 12, 8]],
  m06: [[83, 123, 115, 123], [58, 111, 131, 111], [124, 119, 132, 116], [13, 8, 12, 8]],
  m07: [[85, 123, 117, 123], [58, 112, 133, 112], [125, 119, 132, 116], [12, 8, 12, 8]],
  m08: [[84, 124, 118, 124], [58, 112, 134, 112], [125, 120, 131, 116], [13, 8, 13, 8]],
  m09: [[85, 125, 117, 126], [59, 114, 133, 115], [124, 122, 130, 120], [14, 8, 12, 8]],
  m10: [[85, 123, 117, 123], [55, 110, 134, 110], [125, 119, 131, 116], [13, 8, 12, 8]],
  f01: [[82, 122, 116, 121], [59, 118, 131, 118], [127, 111, 134, 109], [12, 7, 12, 7]],
  f02: [[89, 122, 122, 122], [52, 116, 125, 115], [134, 110, 144, 108], [12, 7, 12, 7]],
  f03: [[79, 120, 112, 120], [55, 118, 134, 119], [132, 107, 140, 104], [13, 8, 13, 8]],
  f04: [[83, 119, 116, 119], [57, 117, 132, 117], [133, 107, 140, 104], [12, 7, 11, 7]],
  f05: [[85, 120, 116, 120], [55, 115, 132, 116], [132, 108, 139, 104], [12, 7, 11, 7]],
  f06: [[85, 117, 114, 117], [66, 107, 124, 108], [130, 110, 137, 107], [12, 7, 12, 7]],
  f07: [[82, 116, 112, 116], [69, 103, 123, 104], [134, 109, 143, 106], [11, 7, 11, 7]],
  f08: [[81, 116, 112, 116], [68, 103, 123, 104], [135, 110, 142, 106], [12, 7, 11, 7]],
  f09: [[84, 119, 113, 119], [71, 104, 121, 104], [134, 112, 140, 109], [11, 7, 11, 7]],
  f10: [[83, 117, 114, 117], [69, 104, 123, 105], [136, 111, 142, 108], [11, 7, 11, 7]],
}

function pair([x1, y1, x2, y2]: Four): HandPair {
  return { left: [x1, y1], right: [x2, y2] }
}

function guideFor(look: string) {
  return Object.hasOwn(guides, look) ? guides[look] : guides.m01
}

const viewSlot = { front: 0, back: 1, right: 2 } as const

/** Right-profile hands overlap. The forward hand is the screen-right point. */
export function handAnchors(look: string, view: HandView): HandPair {
  return pair(guideFor(look)[viewSlot[view]])
}

/** Horizontal and vertical radii of each frontal palm including its fingertips. */
export function frontHandRadii(look: string): HandPair {
  return pair(guideFor(look)[3])
}

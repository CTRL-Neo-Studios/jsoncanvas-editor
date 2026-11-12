import type { BBox } from '../../core'

/** Places an absolutely positioned element over `b` in world units. */
export const boxStyle = (b: BBox): Record<string, string> => ({
	transform: `translate(${b.minX}px, ${b.minY}px)`,
	width: `${b.maxX - b.minX}px`,
	height: `${b.maxY - b.minY}px`,
})

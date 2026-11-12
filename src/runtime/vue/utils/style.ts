import type { BBox } from '../../core'

/**
 * Places an absolutely positioned element over `b` in world units. `left`/`top` rather than a transform: a transform
 * per card makes the browser rebuild thousands of paint properties on every frame of a pan.
 */
export const boxStyle = (b: BBox): Record<string, string> => ({
	left: `${b.minX}px`,
	top: `${b.minY}px`,
	width: `${b.maxX - b.minX}px`,
	height: `${b.maxY - b.minY}px`,
})

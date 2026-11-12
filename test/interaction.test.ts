// @vitest-environment happy-dom
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { JSONCanvas, JSONCanvasNode } from '../src/runtime/core'
import JsonCanvas from '../src/runtime/vue/components/JsonCanvas.vue'
import { IS_MAC } from '../src/runtime/vue/utils/platform'

/** The view is 1000 × 800 and centred on the world origin at 100%: client = world + (500, 400). */
const W = 1000, H = 800
const MOD = IS_MAC ? { metaKey: true } : { ctrlKey: true }
const CLONE = IS_MAC ? { altKey: true } : { ctrlKey: true }
const NO_SNAP = IS_MAC ? { ctrlKey: true } : { altKey: true }

beforeAll(() => {
	globalThis.ResizeObserver = class {
		constructor(private cb: ResizeObserverCallback) {}
		observe() {
			this.cb([{ contentRect: { width: W, height: H } } as ResizeObserverEntry], this as unknown as ResizeObserver)
		}

		unobserve() {}
		disconnect() {}
	}
})

const card = (id: string, x: number, y: number, width = 100, height = 50): JSONCanvasNode => ({ id, type: 'text', text: id, x, y, width, height })
function frame() {
	const { promise, resolve } = Promise.withResolvers<undefined>()
	requestAnimationFrame(() => resolve(undefined))
	return promise
}

let wrapper: VueWrapper<InstanceType<typeof JsonCanvas>>
afterEach(() => wrapper?.unmount())

async function setup(canvas: JSONCanvas, props: Record<string, unknown> = {}) {
	wrapper = mount(JsonCanvas, {
		attachTo: document.body,
		props: {
			'modelValue': canvas,
			'viewport': { x: 0, y: 0, zoom: 0 },
			'onUpdate:modelValue': (v: JSONCanvas) => wrapper.setProps({ modelValue: v }),
			...props,
		},
	})
	await frame()
	await frame()
	return wrapper
}

const root = () => wrapper.find('.jc-canvas').element
const nodeEl = (key: string) => wrapper.find(`[data-key="${key}"] .jc-node-container`).element
const doc = () => wrapper.vm.canvas as JSONCanvas
const box = (id: string) => {
	const n = doc().nodes!.find(n => n.id === id) as JSONCanvasNode
	return [n.x, n.y, n.width, n.height]
}
const emits = () => wrapper.emitted('update:modelValue')?.length ?? 0
const selected = () => [...wrapper.vm.selected as Set<string>].sort()

function pointer(type: string, target: EventTarget, x: number, y: number, init: PointerEventInit = {}) {
	target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX: x + W / 2, clientY: y + H / 2, ...init }))
}

/** Presses on `target` at the first point (world units), moves through the rest, and releases unless `hold`. */
async function drag(target: Element, points: Array<[number, number]>, init: PointerEventInit = {}, hold = false) {
	pointer('pointerdown', target, ...points[0]!, init)
	for (const p of points.slice(1)) pointer('pointermove', window, ...p, init)
	if (!hold) pointer('pointerup', window, ...points.at(-1)!, init)
	await nextTick()
}

const click = (target: Element, x: number, y: number, init: PointerEventInit = {}) => drag(target, [[x, y]], init)

function key(k: string, init: KeyboardEventInit = {}) {
	root().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }))
	return nextTick()
}

describe('selection', () => {
	it('selects on click, toggles with Shift, clears on empty canvas', async () => {
		await setup({ nodes: [card('a', 0, 0), card('b', 300, 0)] })
		await click(nodeEl('a'), 10, 10)
		expect(selected()).toEqual(['a'])
		await click(nodeEl('b'), 310, 10, { shiftKey: true })
		expect(selected()).toEqual(['a', 'b'])
		await click(nodeEl('a'), 10, 10, { shiftKey: true })
		expect(selected()).toEqual(['b'])
		await click(root(), 200, 300)
		expect(selected()).toEqual([])
	})

	it('drag-selects what the rectangle touches, a group only when enclosed, and Esc restores', async () => {
		const g = { id: 'g', type: 'group', x: -50, y: -50, width: 500, height: 150 }
		await setup({ nodes: [g, card('a', 0, 0), card('b', 300, 0)] })
		await drag(root(), [[-10, -10], [200, 20], [350, 30]])
		expect(selected()).toEqual(['a', 'b'])
		await drag(root(), [[-60, -60], [300, 0], [460, 110]])
		expect(selected()).toEqual(['a', 'b', 'g'])

		await click(nodeEl('a'), 10, 10)
		await drag(root(), [[-10, -10], [350, 30]], { shiftKey: true })
		expect(selected()).toEqual(['b'])

		await drag(root(), [[250, -10], [300, 0], [350, 30]], {}, true)
		expect(selected()).toEqual(['b'])
		await key('Escape')
		expect(selected()).toEqual(['b'])
		await drag(root(), [[-10, -10], [5, 5], [20, 20]], {}, true)
		expect(selected()).toEqual(['a'])
		await key('Escape')
		expect(selected()).toEqual(['b'])
	})
})

describe('moving', () => {
	it('carries a group\'s contents and snaps it to the grid as Obsidian does (100×50 lands at 100×60)', async () => {
		const g = { id: 'g', type: 'group', label: 'G', x: -20, y: -20, width: 740, height: 410 }
		await setup({ nodes: [g, card('a', 0, 0, 250, 60)] })
		await click(nodeEl('g'), 0, -10)
		await drag(nodeEl('g'), [[0, -10], [50, 15], [100, 40]])
		expect(box('g')).toEqual([80, 40, 740, 410])
		expect(box('a')).toEqual([100, 60, 250, 60])
		expect(emits()).toBe(1) // one commit for the whole drag
	})

	it('locks to one axis with Shift, and skips snapping with the no-snap key', async () => {
		await setup({ nodes: [card('a', 0, 0)] })
		await drag(nodeEl('a'), [[10, 10], [60, 20], [110, 40]], { shiftKey: true })
		expect(box('a').slice(0, 2)).toEqual([100, 0])
		await drag(nodeEl('a'), [[110, 10], [123, 17]], NO_SNAP)
		expect(box('a').slice(0, 2)).toEqual([113, 7])
		await drag(nodeEl('a'), [[120, 10], [127, 22]])
		expect(box('a').slice(0, 2)).toEqual([120, 20]) // grid
	})

	it('snaps to another card and shows guides while dragging', async () => {
		await setup({ nodes: [card('a', 0, 0), card('b', 300, 0)] })
		await drag(nodeEl('b'), [[310, 10], [200, 10], [115, 13]], {}, true)
		expect(wrapper.findAll('.jc-guides line').length).toBeGreaterThan(0)
		pointer('pointerup', window, 115, 13)
		await nextTick()
		expect(box('b').slice(0, 2)).toEqual([100, 0])
		expect(wrapper.find('.jc-guides').exists()).toBe(false)
	})

	it('clones with the clone key, leaving the original', async () => {
		await setup({ nodes: [card('a', 0, 0)] })
		await drag(nodeEl('a'), [[10, 10], [10, 110], [10, 210]], CLONE, true)
		expect(wrapper.findAll('.jc-ghost')).toHaveLength(1)
		pointer('pointerup', window, 10, 210, CLONE)
		await nextTick()
		const nodes = doc().nodes as JSONCanvasNode[]
		expect(nodes).toHaveLength(2)
		expect(box('a').slice(0, 2)).toEqual([0, 0])
		const copy = nodes.find(n => n.id !== 'a')!
		expect([copy.x, copy.y]).toEqual([0, 200])
		expect(selected()).toEqual([copy.id])
	})

	it('cancels with Esc', async () => {
		await setup({ nodes: [card('a', 0, 0)] })
		await drag(nodeEl('a'), [[10, 10], [60, 10], [110, 10]], {}, true)
		expect(box('a')[0]).toBe(100)
		await key('Escape')
		expect(box('a')[0]).toBe(0)
		expect(emits()).toBe(0)
	})
})

describe('resizing', () => {
	it('stops at 50', async () => {
		await setup({ nodes: [card('a', 0, 0, 200, 100)] })
		pointer('pointermove', root(), 100, 50)
		await nextTick()
		await drag(wrapper.find('.jc-handle[data-resize="right"]').element, [[200, 50], [100, 50], [-100, 50]])
		expect(box('a')).toEqual([0, 0, 50, 100])
	})

	it('scales a multi-selection, keeping its proportions with Shift', async () => {
		await setup({ nodes: [card('a', 0, 0), card('b', 300, 0)] })
		await key('a', MOD)
		await nextTick()
		// The selection box is the nodes' bounds padded by 10: (-10, -10) to (410, 60), 6:1.
		await drag(wrapper.find('.jc-selection .jc-handle[data-resize="bottom-right"]').element, [[410, 60], [600, 100], [830, 200]], { shiftKey: true, ...NO_SNAP })
		expect(box('a')).toEqual([20, 20, 300, 150])
		expect(box('b')).toEqual([920, 20, 300, 150])
	})
})

describe('keys and history', () => {
	it('makes edits within 250 ms one undo step', async () => {
		await setup({ nodes: [card('a', 0, 0)] })
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		await click(nodeEl('a'), 10, 10)
		await key('ArrowRight')
		await key('ArrowRight')
		expect(box('a')[0]).toBe(40)
		await key('z', MOD)
		expect(box('a')[0]).toBe(0)
		await key('z', { ...MOD, shiftKey: true })
		expect(box('a')[0]).toBe(40)

		await key('ArrowRight')
		vi.advanceTimersByTime(300)
		await key('ArrowRight', { shiftKey: true })
		expect(box('a')[0]).toBe(160)
		await key('z', MOD)
		expect(box('a')[0]).toBe(60)
		vi.useRealTimers()
	})

	it('deletes a group with its edges but not its contents', async () => {
		const g = { id: 'g', type: 'group', x: -50, y: -50, width: 500, height: 200 }
		await setup({ nodes: [g, card('a', 0, 0), card('b', 600, 0)], edges: [{ id: 'e', fromNode: 'g', toNode: 'b' }, { id: 'f', fromNode: 'a', toNode: 'b' }] })
		await click(nodeEl('g'), 0, -40)
		await key('Delete')
		expect(doc().nodes!.map(n => n.id)).toEqual(['a', 'b'])
		expect(doc().edges!.map(e => e.id)).toEqual(['f'])
	})

	it('changes nothing when read-only, but still selects', async () => {
		await setup({ nodes: [card('a', 0, 0)] }, { readonly: true })
		await drag(nodeEl('a'), [[10, 10], [60, 10], [110, 10]])
		await key('Delete')
		await key('ArrowRight')
		expect(box('a')).toEqual([0, 0, 100, 50])
		expect(selected()).toEqual(['a'])
		expect(emits()).toBe(0)
	})
})

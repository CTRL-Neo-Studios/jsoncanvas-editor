// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, useTemplateRef, type VNode } from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { stringifyCanvas, type JSONCanvas, type JSONCanvasEdge, type JSONCanvasNode } from '../src/runtime/core'
import CanvasMenu from '../src/runtime/vue/components/CanvasMenu.vue'
import JsonCanvas from '../src/runtime/vue/components/JsonCanvas.vue'
import { IS_MAC } from '../src/runtime/vue/utils/platform'
import DropdownMenuStub from './stubs/DropdownMenuStub.vue'

/** What an export handed to the capture, read when it was handed over (the export DOM goes right after). */
const captures = vi.hoisted(() => [] as Array<{ options: Record<string, unknown>, keys: string[], placeholders: string[], frames: number, redacted: string[], redactedLive: number, watermark?: string }>)
vi.mock('../src/runtime/vue/utils/capture', () => ({
	// happy-dom can't draw: the capture's own part (an SVG of the page's CSS and a copy) is checked in a browser.
	captureElement: async (root: HTMLElement, { transform, context: _, ...options }: { transform?: (copy: HTMLElement) => void, context: Element }) => {
		const copy = root.cloneNode(true) as HTMLElement
		transform?.(copy)
		captures.push({
			options,
			keys: [...root.querySelectorAll<HTMLElement>('[data-key]')].map(n => n.dataset.key!),
			placeholders: [...root.querySelectorAll<HTMLElement>('[data-key]:has(.jc-placeholder)')].map(n => n.dataset.key!),
			frames: root.querySelectorAll('iframe').length,
			redacted: [...copy.querySelectorAll('.jc-redacted')].map(w => w.textContent!),
			redactedLive: root.querySelectorAll('.jc-redacted').length,
			watermark: copy.querySelector('.jc-watermark')?.textContent ?? undefined,
		})
		return new Blob(['png'], { type: 'image/png' })
	},
}))

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

async function setup(canvas: JSONCanvas, props: Record<string, unknown> = {}, slots: Record<string, (props: { node: Record<string, unknown> }) => VNode[]> = {}) {
	wrapper = mount(JsonCanvas, {
		attachTo: document.body,
		props: {
			'modelValue': canvas,
			'viewport': { x: 0, y: 0, zoom: 0 },
			'onUpdate:modelValue': (v: JSONCanvas) => wrapper.setProps({ modelValue: v }),
			...props,
		},
		slots,
	})
	await frame()
	await frame()
	return wrapper
}

const root = () => wrapper.find('.jc-canvas').element
const nodeEl = (key: string) => wrapper.find(`[data-key="${key}"] .jc-node-container`).element
const doc = () => wrapper.vm.canvas as JSONCanvas
const box = (id: string) => {
	const n = doc().nodes!.find(n => n?.id === id) as JSONCanvasNode
	return [n.x, n.y, n.width, n.height]
}
const emits = () => wrapper.emitted('update:modelValue')?.length ?? 0
const selected = () => [...wrapper.vm.selected as Set<string>].sort()
/** Closes the canvas's menu (a click elsewhere or Escape) without choosing. */
const closeMenu = () => wrapper.findComponent(CanvasMenu).findComponent(DropdownMenuStub).vm.$emit('update:open', false)
const menuItem = (label: string) => wrapper.find(`.menu-stub [data-label="${label}"]`)
/** Right-clicks `target`. Vue drops an event from the millisecond its listener was added, so the clock moves on first. */
function contextMenu(target: Element, x: number, y: number) {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(Date.now() + 1000)
	target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x + W / 2, clientY: y + H / 2 }))
	vi.useRealTimers()
	return nextTick()
}

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

	it('draws a move at an offset until it ends, and cancels with Esc', async () => {
		await setup({ nodes: [card('a', 0, 0), card('b', 300, 0)], edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left' }] })
		const world = () => wrapper.find('.jc-world').element as HTMLElement
		await drag(nodeEl('a'), [[10, 10], [60, 10], [110, 10]], {}, true)
		// The document is untouched mid-drag; the card is drawn at the offset, its edge reshaped.
		expect(box('a')[0]).toBe(0)
		expect(world().style.getPropertyValue('--jc-move-x')).toBe('100px')
		expect(wrapper.find('[data-key="a"]').classes()).toContain('jc-moved')
		expect(wrapper.find('[data-edge="e"] .jc-edge-line').attributes('d')).toMatch(/^M200 25/)
		await key('Escape')
		expect(box('a')[0]).toBe(0)
		expect(wrapper.find('[data-key="a"]').classes()).not.toContain('jc-moved')
		expect(wrapper.find('[data-edge="e"] .jc-edge-line').attributes('d')).toMatch(/^M100 25/)
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

describe('edges', () => {
	const edges = () => (doc().edges ?? []) as JSONCanvasEdge[]
	const nodeById = (id: string) => doc().nodes!.find(n => n.id === id) as JSONCanvasNode
	/** Hovers node `key` at (x, y) and drags from its `side`'s connection point through `points`. */
	async function connect(x: number, y: number, side: string, points: Array<[number, number]>) {
		pointer('pointermove', root(), x, y)
		await nextTick()
		await drag(wrapper.find(`.jc-connect[data-connect="${side}"]`).element, points)
	}
	const hit = (key = 'e') => wrapper.find(`[data-edge="${key}"] .jc-edge-hit`).element
	const ab = { nodes: [card('a', 0, 0), card('b', 300, 0)], edges: [{ id: 'e', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left' }] } as JSONCanvas

	it('connects to the nearest side of the node it\'s dropped on', async () => {
		await setup({ nodes: [card('a', 0, 0), card('b', 300, 0, 100, 100)] })
		await connect(50, 25, 'right', [[100, 25], [200, 40], [340, 90]])
		expect(edges()).toHaveLength(1)
		expect(edges()[0]).toMatchObject({ fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'bottom' })
		expect(Object.keys(edges()[0]!)).toEqual(['id', 'fromNode', 'fromSide', 'toNode', 'toSide'])
		expect(wrapper.find('.jc-dragged-edge').exists()).toBe(false)
	})

	it('never connects to a group around the node, or from a group to what it holds', async () => {
		const g = { id: 'g', type: 'group', x: -50, y: -50, width: 500, height: 200 }
		await setup({ nodes: [g, card('a', 0, 0)] })
		await connect(50, 25, 'bottom', [[50, 50], [50, 120], [50, 145]]) // g's bottom midpoint is (200, 150)
		expect(menuItem('Add card').exists()).toBe(true)
		closeMenu()
		await nextTick()
		await connect(-45, 100, 'top', [[200, -50], [10, 20], [5, 25]]) // from g, onto a's left side
		expect(menuItem('Add card').exists()).toBe(true)
	})

	it('removes a dropped edge whose menu closes without a choice', async () => {
		await setup({ nodes: [card('a', 0, 0)] })
		await connect(50, 25, 'right', [[100, 25], [300, 25], [400, 25]])
		expect(wrapper.find('.jc-dragged-edge').exists()).toBe(true)
		closeMenu()
		await nextTick()
		expect(wrapper.find('.jc-dragged-edge').exists()).toBe(false)
		expect(edges()).toHaveLength(0)
		expect(emits()).toBe(0)
	})

	it('adds a card from the drop menu, its facing side on the drop point', async () => {
		await setup({ nodes: [card('a', 0, 0)] })
		await connect(50, 25, 'right', [[100, 25], [300, 25], [400, 25]])
		await menuItem('Add card').trigger('click')
		await flushPromises()
		const added = doc().nodes!.at(-1) as JSONCanvasNode
		expect(added).toMatchObject({ type: 'text', text: '', x: 400, y: -5, width: 250, height: 60 })
		expect(edges()[0]).toMatchObject({ fromNode: 'a', fromSide: 'right', toNode: added.id, toSide: 'left' })
		expect(selected()).toEqual([added.id])
		expect(wrapper.find('.jc-dragged-edge').exists()).toBe(false)
	})

	it('offers a note\'s links not yet connected, and picked files', async () => {
		const f = { id: 'f', type: 'file', file: 'f.md', x: 0, y: 0, width: 100, height: 50 }
		const b = { id: 'b', type: 'file', file: 'b.md', x: 300, y: 0, width: 100, height: 50 }
		const host = {
			listLinks: vi.fn(() => [{ file: 'b.md' }, { file: 'c.md' }, { file: 'c.md', subpath: '#H' }]),
			pickFile: vi.fn(() => Promise.resolve('p.png')),
		}
		await setup({ nodes: [f, b], edges: [{ id: 'e', fromNode: 'f', toNode: 'b' }] }, { host })
		await connect(50, 25, 'bottom', [[50, 50], [50, 200], [50, 300]])
		await flushPromises()
		expect(host.listLinks).toHaveBeenCalledWith('f.md')
		expect(wrapper.findAll('.menu-stub button').map(b => b.attributes('data-label'))).toEqual(['Add card', 'Add file', 'c.md', 'c.md#H'])
		await menuItem('c.md#H').trigger('click')
		await flushPromises()
		expect(doc().nodes!.at(-1)).toMatchObject({ type: 'file', file: 'c.md', subpath: '#H', x: -150, y: 300, width: 400, height: 400 })

		await connect(50, 25, 'top', [[50, 0], [50, -150], [50, -300]])
		await flushPromises()
		await menuItem('Add file').trigger('click')
		await flushPromises()
		expect(doc().nodes!.at(-1)).toMatchObject({ type: 'file', file: 'p.png' })
		expect(edges()).toHaveLength(3)
	})

	it('moves the nearer end to another node, never onto the other end\'s node, and removes it dropped on nothing', async () => {
		await setup({ ...ab, nodes: [...ab.nodes!, card('c', 300, 200)] })
		await drag(hit(), [[280, 25], [300, 120], [345, 195]])
		expect(edges()[0]).toMatchObject({ fromNode: 'a', fromSide: 'right', toNode: 'c', toSide: 'top' })
		await drag(hit(), [[300, 190], [200, 100], [95, 25]]) // onto a, the fixed end
		expect(edges()).toHaveLength(0)
	})

	it('cancels a reconnect with Esc', async () => {
		await setup(ab)
		await drag(hit(), [[280, 25], [250, 100], [250, 300]], {}, true)
		expect(wrapper.find('[data-edge="e"]').exists()).toBe(false)
		await key('Escape')
		expect(edges()).toEqual(ab.edges)
		expect(emits()).toBe(0)
	})

	it('selects on click, edits the label on a second click, and removes an emptied label', async () => {
		await setup(ab)
		await click(hit(), 200, 25)
		expect(selected()).toEqual(['e'])
		await click(hit(), 200, 25)
		const editor = wrapper.find('[contenteditable]')
		editor.element.textContent = 'Label'
		await editor.trigger('blur')
		expect(edges()[0]!.label).toBe('Label')
		await click(wrapper.find('.jc-edge-label').element, 200, 25)
		const again = wrapper.find('[contenteditable]')
		again.element.textContent = '  '
		await again.trigger('blur')
		expect('label' in edges()[0]!).toBe(false)
	})

	it('deletes selected edges with Delete, keeping their nodes', async () => {
		await setup(ab)
		await click(hit(), 200, 25)
		await key('Delete')
		expect(edges()).toHaveLength(0)
		expect(doc().nodes).toHaveLength(2)
	})

	it('sets the line direction and removes from the context menu', async () => {
		await setup(ab)
		await contextMenu(hit(), 200, 25)
		expect(selected()).toEqual(['e'])
		await menuItem('Bidirectional').trigger('click')
		expect(edges()[0]).toMatchObject({ fromEnd: 'arrow' })
		expect('toEnd' in edges()[0]!).toBe(false)
		await contextMenu(hit(), 200, 25)
		await menuItem('Nondirectional').trigger('click')
		expect(edges()[0]).toMatchObject({ toEnd: 'none' })
		expect('fromEnd' in edges()[0]!).toBe(false)
		await contextMenu(hit(), 200, 25)
		await menuItem('Remove').trigger('click')
		expect(edges()).toHaveLength(0)
		expect(nodeById('a')).toBeDefined()
	})

	it('only selects when read-only', async () => {
		await setup(ab, { readonly: true })
		pointer('pointermove', root(), 50, 25)
		await nextTick()
		expect(wrapper.find('.jc-connect').exists()).toBe(false)
		await drag(hit(), [[280, 25], [250, 100], [250, 300]])
		await click(hit(), 200, 25)
		await click(hit(), 200, 25)
		expect(wrapper.find('[contenteditable]').exists()).toBe(false)
		expect(selected()).toEqual(['e'])
		expect(emits()).toBe(0)
	})
})

describe('custom cards', () => {
	const shape = { id: 's', type: 'shape', shape: 'star', x: 0, y: 0, width: 100, height: 100 }
	/** Shows its `shape`; while editing, a button that changes it. */
	const ShapeCard = defineComponent({
		props: ['node', 'editing', 'update', 'done'],
		setup: p => () => h('div', { class: 'shape' }, [
			String(p.node.shape),
			p.editing && h('button', { class: 'to-circle', onClick: () => (p.update({ shape: 'circle' }), p.done()) }),
		]),
	})

	it('draws a custom type with its component, saves its updates and stops reporting it', async () => {
		await setup({ nodes: [shape] }, { nodeRenderers: { shape: ShapeCard } })
		expect(wrapper.find('[data-key="s"] .shape').text()).toBe('star')
		expect(wrapper.vm.issues).toEqual([])
		nodeEl('s').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
		await nextTick()
		await wrapper.find('.to-circle').trigger('click')
		expect(doc().nodes![0]).toMatchObject({ type: 'shape', shape: 'circle' })
		expect(wrapper.find('.to-circle').exists()).toBe(false)
		await key('z', MOD)
		expect(doc().nodes![0]).toMatchObject({ shape: 'star' })
	})

	it('lets a #node-<type> slot replace a built-in card, ahead of nodeRenderers', async () => {
		await setup(
			{ nodes: [card('a', 0, 0), shape] },
			{ nodeRenderers: { shape: ShapeCard } },
			{ 'node-text': p => [h('p', { class: 'mine' }, String(p.node.text))], 'node-shape': () => [h('i', { class: 'slot-shape' })] },
		)
		expect(wrapper.find('[data-key="a"] .mine').text()).toBe('a')
		expect(wrapper.find('[data-key="s"] .slot-shape').exists()).toBe(true)
		expect(wrapper.find('.shape').exists()).toBe(false)
	})

	it('adds a node of any type through the component', async () => {
		await setup({ nodes: [] }, { nodeRenderers: { shape: ShapeCard } })
		const id = wrapper.vm.addNode({ type: 'shape', shape: 'square', x: 10, y: 10, width: 80, height: 80 })
		await nextTick()
		expect(doc().nodes).toEqual([{ id, type: 'shape', shape: 'square', x: 10, y: 10, width: 80, height: 80 }])
		expect(selected()).toEqual([id])
		expect(wrapper.find(`[data-key="${id}"] .shape`).text()).toBe('square')
	})
})

describe('card content', () => {
	const file = (id: string, path: string, extra: Record<string, unknown> = {}) => ({ id, type: 'file', file: path, x: 0, y: 0, width: 400, height: 400, ...extra })

	it('edits a text card on double-click and saves it on Escape, as one undo step', async () => {
		await setup({ nodes: [card('a', 0, 0)] })
		nodeEl('a').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
		await nextTick()
		const editor = wrapper.find('textarea')
		await editor.setValue('**new**')
		await editor.trigger('keydown', { key: 'Escape' })
		expect(doc().nodes![0]).toMatchObject({ text: '**new**' })
		expect(wrapper.find('textarea').exists()).toBe(false)
		await key('z', MOD)
		expect(doc().nodes![0]).toMatchObject({ text: 'a' })
	})

	it('shows files as the host resolves them: missing (removable), a note narrowed to a heading, others generic', async () => {
		const host = {
			resolveFile: (path: string) => ({ exists: path !== 'gone.md', url: `/${path}` }),
			readText: () => '# A\none\n# B\ntwo [[Other note]]',
			openLink: vi.fn(),
		}
		await setup({ nodes: [file('gone', 'gone.md'), file('note', 'n.md', { subpath: '#B', x: 500 }), file('zip', 'x.zip', { x: 1000 })] }, { host })
		await flushPromises()
		expect(wrapper.find('[data-key="gone"] .jc-missing').text()).toContain('“gone.md” could not be found.')
		// The Markdown parser loads and runs asynchronously.
		await vi.waitFor(() => expect(wrapper.find('[data-key="note"] .jc-markdown').text()).toContain('two'))
		expect(wrapper.find('[data-key="note"] .jc-markdown').text()).not.toContain('one')
		expect(wrapper.find('[data-key="zip"] .jc-card').text()).toBe('x.zip')
		await wrapper.find('[data-key="note"] a[data-wikilink]').trigger('click')
		expect(host.openLink).toHaveBeenCalledWith('Other note')
		await wrapper.find('[data-key="gone"] .jc-danger').trigger('click')
		expect(doc().nodes!.map(n => n.id)).toEqual(['note', 'zip'])
	})

	it('shrinks an image card to the image\'s shape on load, without an undo step, and keeps that shape when resized', async () => {
		await setup({ nodes: [file('img', 'a.png')] }, { host: { resolveFile: () => ({ exists: true, url: '/a.png' }) } })
		await flushPromises()
		const img = wrapper.find('img').element
		Object.defineProperties(img, { naturalWidth: { value: 300 }, naturalHeight: { value: 400 } })
		img.dispatchEvent(new Event('load'))
		expect(box('img')).toEqual([0, 0, 300, 400])
		expect(wrapper.vm.canUndo).toBe(false)
		pointer('pointermove', root(), 150, 200)
		await nextTick()
		await drag(wrapper.find('.jc-handle[data-resize="right"]').element, [[300, 200], [200, 200], [150, 200]], NO_SNAP)
		expect(box('img')).toEqual([0, 0, 150, 200])
	})

	describe('note cards', () => {
		const dblclick = (key: string) => {
			nodeEl(key).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
			return nextTick()
		}
		const textarea = (key: string) => wrapper.find(`[data-key="${key}"] textarea`)

		it('edits a note in place: written to the note, shown by every card of it, and not a canvas undo step', async () => {
			const writeText = vi.fn()
			await setup({ nodes: [file('a', 'n.md'), file('b', 'n.md', { x: -450 })] }, { host: { readText: () => '# A\none', writeText } })
			await flushPromises()
			wrapper.vm.select(['a'])
			await nextTick()
			expect(wrapper.findAll('.jc-toolbar button[aria-label]').map(b => b.attributes('aria-label'))).toContain('Edit')
			await dblclick('a')
			expect((textarea('a').element as HTMLTextAreaElement).value).toBe('# A\none')
			await textarea('a').setValue('# A\nnew')
			await textarea('a').trigger('keydown', { key: 'Escape' })
			await flushPromises()
			expect(writeText.mock.calls).toEqual([['n.md', '# A\nnew']])
			expect(wrapper.find('textarea').exists()).toBe(false)
			await vi.waitFor(() => expect(wrapper.find('[data-key="b"] .jc-markdown').text()).toContain('new'))
			expect(wrapper.find('[data-key="a"] .jc-markdown').text()).toContain('new')
			expect(wrapper.vm.canUndo).toBe(false)
			expect(emits()).toBe(0)
		})

		it('edits only the heading a card is narrowed to, keeping the rest of the note as it was', async () => {
			const note = '---\ntags: x\n---\n# A\none\n\n# B\ntwo ^b\n'
			const writeText = vi.fn()
			await setup({ nodes: [file('a', 'n.md', { subpath: '#A' })] }, { host: { readText: () => note, writeText } })
			await flushPromises()
			await dblclick('a')
			expect((textarea('a').element as HTMLTextAreaElement).value).toBe('# A\none\n')
			await textarea('a').setValue('# A\nONE\n')
			await click(root(), -400, -300)
			await flushPromises()
			expect(writeText.mock.calls).toEqual([['n.md', note.replace('one', 'ONE')]])
		})

		it('stays read-only without host.writeText', async () => {
			await setup({ nodes: [file('a', 'n.md')] }, { host: { readText: () => '# A' } })
			await flushPromises()
			await dblclick('a')
			expect(wrapper.find('textarea').exists()).toBe(false)
			wrapper.vm.select(['a'])
			await nextTick()
			expect(wrapper.findAll('.jc-toolbar button[aria-label]').map(b => b.attributes('aria-label'))).not.toContain('Edit')
		})

		it('takes its editor from #note-editor', async () => {
			const writeText = vi.fn()
			let editor: { path: string, text: string, update: (text: string) => void, done: () => void } | undefined
			await setup({ nodes: [file('a', 'n.md')] }, { host: { readText: () => 'old', writeText } }, {
				'note-editor': (props) => {
					editor = props as unknown as typeof editor
					return [h('div', { class: 'my-editor' }, editor!.text)]
				},
			})
			await flushPromises()
			await dblclick('a')
			expect(wrapper.find('.my-editor').text()).toBe('old')
			expect(editor!.path).toBe('n.md')
			editor!.update('new')
			editor!.done()
			await flushPromises()
			expect(writeText.mock.calls).toEqual([['n.md', 'new']])
			expect(wrapper.find('.my-editor').exists()).toBe(false)
		})

		it('reports a failed write and keeps what was typed in the editor', async () => {
			const errors: string[] = []
			await setup({ nodes: [file('a', 'n.md')] }, {
				host: { readText: () => 'old', writeText: async () => Promise.reject(new Error('disk full')) },
				onError: (e: { action: string }) => errors.push(e.action),
			})
			await flushPromises()
			await dblclick('a')
			await textarea('a').setValue('typed')
			// Saved shortly after typing, while still editing.
			await vi.waitFor(() => expect(errors).toEqual(['writeText']))
			expect((textarea('a').element as HTMLTextAreaElement).value).toBe('typed')
		})
	})

	it('opens a web link clicked in Markdown with host.openUrl', async () => {
		const openUrl = vi.fn()
		await setup({ nodes: [{ ...card('a', 0, 0), text: '[site](https://example.com/)' }] }, { host: { openUrl } })
		await vi.waitFor(() => expect(wrapper.find('[data-key="a"] .jc-markdown a').exists()).toBe(true))
		await wrapper.find('[data-key="a"] .jc-markdown a').trigger('click')
		expect(openUrl).toHaveBeenCalledWith('https://example.com/')
	})
})

describe('chrome', () => {
	const toolbar = () => wrapper.findAll('.jc-toolbar button[aria-label]').map(b => b.attributes('aria-label'))
	const group = (id: string, x: number, y: number, extra = {}) => ({ id, type: 'group', x, y, width: 300, height: 200, ...extra })
	const link = { id: 'l', type: 'link', url: 'https://example.com', x: 0, y: 300, width: 200, height: 100 }
	const edge = (id: string, extra = {}) => ({ id, fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', ...extra })
	const keys = (k: string[]) => wrapper.vm.select(k)

	it('shows the toolbar\'s buttons for what is selected, as Obsidian does', async () => {
		await setup({
			nodes: [group('g', -400, -400), card('a', 0, 0), card('b', 300, 0), link],
			edges: [edge('e'), edge('f', { label: 'L' })],
		}, { host: { pickFile: async () => undefined } })
		const rows: Array<[string[], string[]]> = [
			[['a'], ['Remove', 'Set color', 'Zoom to selection', 'Edit']],
			[['l'], ['Remove', 'Set color', 'Zoom to selection']],
			[['g'], ['Remove', 'Set color', 'Zoom to selection', 'Align', 'Edit label', 'Set background']],
			[['e'], ['Remove', 'Set color', 'Zoom to selection', 'Line direction', 'Edit label']],
			[['f'], ['Remove', 'Set color', 'Zoom to selection', 'Line direction', 'Remove label', 'Edit label']],
			[['e', 'f'], ['Remove', 'Set color', 'Zoom to selection', 'Line direction']],
			[['a', 'b'], ['Remove', 'Set color', 'Zoom to selection', 'Create group', 'Align']],
		]
		for (const [selection, buttons] of rows) {
			keys(selection)
			await nextTick()
			expect(toolbar(), selection.join()).toEqual(buttons)
		}
		await wrapper.setProps({ readonly: true })
		keys(['a'])
		await nextTick()
		expect(toolbar()).toEqual(['Zoom to selection'])
	})

	it('colors the selection from the toolbar, and groups it', async () => {
		await setup({ nodes: [card('a', 0, 0), card('b', 300, 0)], edges: [edge('e')] })
		keys(['a', 'b', 'e'])
		await nextTick()
		await wrapper.find('[data-action="color"]').trigger('click')
		await wrapper.find('.jc-swatch[data-color="4"]').trigger('click')
		expect([...doc().nodes!, ...doc().edges!].map(i => i.color)).toEqual(['4', '4', '4'])
		expect(wrapper.find('.jc-swatches').exists()).toBe(false)
		await wrapper.find('[data-action="color"]').trigger('click')
		await wrapper.find('.jc-swatch:not(.jc-themed)').trigger('click')
		expect(doc().nodes!.some(n => 'color' in n)).toBe(false)

		keys(['a', 'b'])
		await nextTick()
		await wrapper.find('[aria-label="Create group"]').trigger('click')
		expect(doc().nodes![0]).toMatchObject({ type: 'group', label: 'Untitled group', x: -20, y: -20, width: 440, height: 90 })
		expect(wrapper.find('.jc-group-label[contenteditable]').exists()).toBe(true)
	})

	it('aligns a group\'s contents within it', async () => {
		await setup({ nodes: [group('g', 0, 0), card('a', 100, 100), card('b', 150, 30)] })
		keys(['g'])
		wrapper.vm.actions.layout('left')
		expect([box('a')[0], box('b')[0]]).toEqual([20, 20])
	})

	it('adds cards from the empty canvas: right-click menu, double-click, and Mod+drag', async () => {
		await setup({ nodes: [] })
		expect(wrapper.find('.jc-empty').exists()).toBe(true)
		await contextMenu(root(), 100, 100)
		expect(menuItem('Select all').exists()).toBe(true)
		await menuItem('Add card').trigger('click')
		expect(doc().nodes![0]).toMatchObject({ type: 'text', x: 100, y: 100, width: 250, height: 60 })
		expect(wrapper.find('textarea').exists()).toBe(true)

		root().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: W / 2 - 300, clientY: H / 2 }))
		await nextTick()
		expect(doc().nodes![1]).toMatchObject({ type: 'text', x: -425, y: -30, width: 250, height: 60 })

		await drag(root(), [[0, 200], [100, 250], [200, 290]], MOD)
		await menuItem('Create group').trigger('click')
		expect(doc().nodes![0]).toMatchObject({ type: 'group', x: 0, y: 200, width: 200, height: 90 })
	})

	it('adds a card from the bottom bar: a click in the middle of the view, a drag where it\'s dropped', async () => {
		await setup({ nodes: [] })
		const button = wrapper.find('.jc-card-bar [aria-label="Drag to add card"]').element
		await drag(button, [[0, 380]])
		expect(doc().nodes![0]).toMatchObject({ x: -125, y: -30 })
		await drag(button, [[0, 380], [0, 300], [203, 197]])
		// Centred on the pointer (78, 167), then onto the grid.
		expect(doc().nodes![1]).toMatchObject({ type: 'text', x: 80, y: 160, width: 250, height: 60 })
	})

	it('hides the chrome by prop, replaces it by slot, and takes its strings from `messages`', async () => {
		await setup({ nodes: [card('a', 0, 0)] }, { toolbar: false, messages: { dragToAddCard: 'Karte hinzufügen' } }, { controls: () => [h('i', { class: 'my-controls' })] })
		keys(['a'])
		await nextTick()
		expect(wrapper.find('.jc-toolbar').exists()).toBe(false)
		expect(wrapper.find('.jc-controls').exists()).toBe(false)
		expect(wrapper.find('.my-controls').exists()).toBe(true)
		expect(wrapper.find('.jc-card-bar [aria-label="Karte hinzufügen"]').exists()).toBe(true)
		await wrapper.setProps({ cardBar: false })
		expect(wrapper.find('.jc-card-bar').exists()).toBe(false)
	})

	it('lets the host extend context menus through the `menu` event', async () => {
		const mine = vi.fn()
		await setup({ nodes: [card('a', 0, 0)] }, { onMenu: (e: { kind: string, items: unknown[][] }) => e.kind === 'node' && e.items.push([{ label: 'Mine', onSelect: mine }]) })
		await contextMenu(nodeEl('a'), 10, 10)
		expect(menuItem('Zoom to selection').exists()).toBe(true)
		await menuItem('Mine').trigger('click')
		expect(mine).toHaveBeenCalled()
	})

	it('toggles read-only from the controls, and undo follows the history', async () => {
		await setup({ nodes: [card('a', 0, 0)] })
		const undo = () => wrapper.find('.jc-controls [aria-label="Undo"]').element as HTMLButtonElement
		expect(undo().disabled).toBe(true)
		await key('ArrowRight')
		expect(undo().disabled).toBe(false)
		await wrapper.setProps({ readonly: true })
		await wrapper.find('.jc-controls [aria-label="Disable read-only"]').trigger('click')
		expect(wrapper.emitted('update:readonly')!.at(-1)).toEqual([false])
	})
})

describe('clipboard and drops', () => {
	/** Fires a clipboard event as the browser does (at the document) with the canvas focused. */
	function clipboard(type: 'copy' | 'cut' | 'paste', data: Record<string, string> | DataTransfer = {}) {
		const transfer = data instanceof DataTransfer ? data : new DataTransfer()
		if (!(data instanceof DataTransfer)) for (const [k, v] of Object.entries(data)) transfer.setData(k, v)
		;(root() as HTMLElement).focus()
		const e = new ClipboardEvent(type, { clipboardData: transfer, bubbles: true, cancelable: true })
		document.dispatchEvent(e)
		return { handled: e.defaultPrevented, transfer }
	}
	const added = (before: number) => doc().nodes!.slice(before) as JSONCanvasNode[]

	it('copies cards with the edges among them and their colors, and pastes them with new ids at the view\'s centre', async () => {
		await setup({
			nodes: [{ ...card('a', 0, 0), color: '3' }, card('b', 300, 0), card('c', 600, 0)],
			edges: [{ id: 'ab', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', color: '2' }, { id: 'bc', fromNode: 'b', fromSide: 'right', toNode: 'c', toSide: 'left' }],
		})
		wrapper.vm.select(['a', 'b'])
		const { handled, transfer } = clipboard('copy')
		expect(handled).toBe(true)
		expect(transfer.getData('text/plain')).toBe(transfer.getData('obsidian/canvas'))

		expect(clipboard('paste', transfer).handled).toBe(true)
		const [a, b] = added(3)
		expect([a, b].map(n => [n!.x, n!.y, n!.text, n!.color])).toEqual([[-200, -25, 'a', '3'], [100, -25, 'b', undefined]])
		expect(a!.id).not.toBe('a')
		expect(doc().edges!.at(-1)).toMatchObject({ fromNode: a!.id, toNode: b!.id, color: '2' })
		expect(doc().edges).toHaveLength(3)
		expect(selected()).toEqual([a!.id, b!.id].sort())

		// Canvas data as plain text (another app, or a host's own clipboard) pastes the same way.
		clipboard('paste', { 'text/plain': transfer.getData('text/plain') })
		expect(doc().nodes).toHaveLength(7)

		wrapper.vm.select(['c'])
		expect(clipboard('cut').handled).toBe(true)
		expect(doc().nodes!.some(n => n.id === 'c')).toBe(false)
	})

	it('pastes a URL as a web page and other text as a card being edited; nothing in read-only', async () => {
		await setup({ nodes: [] })
		clipboard('paste', { 'text/plain': ' https://example.com/x ' })
		expect(added(0)).toMatchObject([{ type: 'link', url: 'https://example.com/x', x: -200, y: -200, width: 400, height: 400 }])
		clipboard('paste', { 'text/plain': 'https://youtu.be/abc' })
		expect(added(1)).toMatchObject([{ type: 'link', width: 640, height: 360 }])
		clipboard('paste', { 'text/plain': 'www.example.com' })
		expect(added(2)).toMatchObject([{ type: 'text', text: 'www.example.com', x: -125, y: -30, width: 250, height: 60 }])
		await nextTick()
		expect(wrapper.find('textarea').exists()).toBe(true)

		await wrapper.setProps({ readonly: true })
		expect(clipboard('paste', { 'text/plain': 'more' }).handled).toBe(false)
		expect(doc().nodes).toHaveLength(3)
	})

	it('imports pasted files and adds them in rows; the host\'s own drops land at the drop point', async () => {
		const importFiles = vi.fn(async (files: File[]) => files.map(f => `in/${f.name}`))
		const filesIn = (data: DataTransfer) => data.getData('x-app/paths') ? data.getData('x-app/paths').split('\n') : undefined
		await setup({ nodes: [] }, { host: { importFiles, filesIn } })
		const files = new DataTransfer()
		for (let i = 0; i < 12; i++) files.items.add(new File(['x'], `${i}.png`, { type: 'image/png' }))
		expect(clipboard('paste', files).handled).toBe(true)
		await flushPromises()
		expect(importFiles).toHaveBeenCalledOnce()
		const grid = added(0)
		expect(grid).toHaveLength(12)
		expect([grid[0], grid[9], grid[10]].map(n => [n!.file, n!.x, n!.y, n!.width, n!.height])).toEqual([
			['in/0.png', -2202, -422, 400, 400], ['in/9.png', 1803, -422, 400, 400], ['in/10.png', -2202, 23, 400, 400],
		])
		expect(selected()).toHaveLength(12)

		const rows = new DataTransfer()
		rows.setData('x-app/paths', 'Notes/a.md')
		// happy-dom's DragEvent takes neither a transfer nor a position.
		const drop = new MouseEvent('drop', { bubbles: true, cancelable: true, clientX: W / 2 + 1000, clientY: H / 2 })
		root().dispatchEvent(Object.assign(drop, { dataTransfer: rows }))
		await flushPromises()
		expect(added(12)).toMatchObject([{ type: 'file', file: 'Notes/a.md', x: 800, y: -200 }])
	})

	it('writes the nodes it creates with their keys in Obsidian\'s order', async () => {
		const sticky = { label: 'Sticky', icon: 'i-lucide-sticky-note', node: { type: 'text', text: 'hi', color: '3', width: 200, height: 100 } }
		const filesIn = (data: DataTransfer) => data.getData('x-app/paths') ? [data.getData('x-app/paths')] : undefined
		await setup({ nodes: [] }, { host: { filesIn }, cardTemplates: [sticky] })
		const at = { at: { x: 0, y: 0 } }
		wrapper.vm.actions.add('card', at)
		wrapper.vm.actions.add(sticky, at)
		wrapper.vm.actions.add('group', at)
		clipboard('paste', { 'text/plain': 'https://example.com' })
		clipboard('paste', { 'x-app/paths': 'a.md' })
		await flushPromises()
		// As Obsidian 1.15.1 writes a node it creates: id, box, color, type, then the type's fields.
		expect(stringifyCanvas(doc()).split('\n').filter(l => l.includes('"id"')).map(l => l.trim().replace(/"id":"\w+"/, '"id":"n"'))).toEqual([
			'{"id":"n","x":0,"y":0,"width":400,"height":400,"type":"group","label":"Untitled group"},',
			'{"id":"n","x":0,"y":0,"width":250,"height":60,"type":"text","text":""},',
			'{"id":"n","x":0,"y":0,"width":200,"height":100,"color":"3","type":"text","text":"hi"},',
			'{"id":"n","x":-200,"y":-200,"width":400,"height":400,"type":"link","url":"https://example.com"},',
			'{"id":"n","x":-200,"y":-200,"width":400,"height":400,"type":"file","file":"a.md"}',
		])
	})
})

describe('export', () => {
	it('draws every card in the frame (pages as placeholders, text as bars in privacy mode) with the watermark', async () => {
		const link = { id: 'l', type: 'link', url: 'https://example.com', x: 0, y: 300, width: 200, height: 100 }
		await setup({ nodes: [card('a', 0, 0), card('far', 5000, 3000), link] }, {}, { watermark: () => [h('b', 'Logo')] })
		expect(wrapper.find('[data-key="far"]').exists()).toBe(false) // out of view
		const png = await wrapper.vm.exportPng({ scale: 2, privacy: true })
		expect(png.type).toBe('image/png')
		const c = captures.at(-1)!
		expect(c.options).toMatchObject({ width: 5300, height: 3250, scale: 2 })
		expect(c.keys.sort()).toEqual(['a', 'far', 'l'])
		expect([c.placeholders, c.frames]).toEqual([['l'], 0])
		expect(c.redacted).toEqual(expect.arrayContaining(['far', 'https://example.com', 'Logo']))
		expect(c.redactedLive).toBe(0) // privacy changes the copy drawn, not the page
		expect(c.watermark).toBe('Logo')
		await nextTick()
		expect(wrapper.find('.jc-export-host').exists()).toBe(false)

		await wrapper.vm.exportPng({ frame: 'viewport', watermark: false })
		expect(captures.at(-1)).toMatchObject({ options: { width: W, height: H, scale: 1 }, redacted: [], watermark: undefined })
	})
})

describe('hostile canvases', () => {
	it('draws what it can of a document with anything in it, edits it, and keeps the rest', async () => {
		const junk = [null, 7, 'x', []]
		await setup({
			nodes: [
				...junk,
				card('a', 0, 0),
				{ id: 'huge', type: 'text', text: '', x: 1e308, y: 0, width: 10, height: 10 },
				{ id: 'negative', type: 'text', text: '', x: 0, y: 0, width: -5, height: 10 },
				{ id: 's', type: 'shape', x: 300, y: 0, width: 100, height: 50 },
				card('a', 600, 0),
			] as JSONCanvas['nodes'],
			edges: [null, { id: 'e', fromNode: 'a', toNode: 'gone' }, { id: 'f', fromNode: 'a', fromSide: 'right', toNode: 's', toSide: 'left' }] as JSONCanvas['edges'],
		})
		// Drawn: both `a`s (the second keyed apart), the unsupported shape and the edge to it.
		expect(wrapper.findAll('.jc-world [data-key]').map(n => n.attributes('data-key')).sort()).toEqual(['a', 'a#8', 's'])
		expect(wrapper.find('[data-edge="f"]').exists()).toBe(true)
		wrapper.vm.select(['a'])
		await key('ArrowRight')
		await key('Delete')
		expect(doc().nodes!.slice(0, 4)).toEqual(junk)
		expect(doc().nodes!.map(n => (n as { id?: string } | null)?.id)).toEqual([undefined, undefined, undefined, undefined, 'huge', 'negative', 's', 'a'])
		// The other `a` still has the id, so the edges from it stay; so does the `null`.
		expect(doc().edges!.map(e => (e as { id?: string } | null)?.id)).toEqual([undefined, 'e', 'f'])
		// Both edits came within the history's 250 ms: one step back restores the document.
		wrapper.vm.undo()
		expect([doc().nodes!.length, box('a')[0]]).toEqual([9, 0])
	})

	it('reports a host that fails everywhere, and goes on without it', async () => {
		const fail = () => {
			throw new Error('no')
		}
		const errors: string[] = []
		await setup({ nodes: [{ id: 'f', type: 'file', file: 'Notes/a.md', x: 0, y: 0, width: 400, height: 400 }] }, {
			host: {
				resolveFile: fail,
				readText: async () => 42,
				pickFile: async () => fail(),
				importFiles: async () => 'not a list',
				filesIn: fail,
				listLinks: async () => null,
			},
			onError: (e: { action: string }) => errors.push(e.action),
		})
		await flushPromises()
		// No file information, no text: a generic card with the file's name.
		expect(wrapper.find('[data-key="f"] .jc-card-name').text()).toBe('a.md')
		wrapper.vm.actions.add('file', { at: { x: 0, y: 600 } })
		const files = new DataTransfer()
		files.items.add(new File(['x'], 'p.png', { type: 'image/png' }))
		;(root() as HTMLElement).focus()
		document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: files, bubbles: true, cancelable: true }))
		await flushPromises()
		expect(doc().nodes).toHaveLength(1)
		expect([...new Set(errors)].sort()).toEqual(['filesIn', 'importFiles', 'pickFile', 'readText', 'resolveFile'])
	})

	it('shows a card that throws as failed, keeps the rest, and refuses updates that would break a node', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		const Boom = defineComponent(() => {
			throw new Error('boom')
		})
		let update!: (patch: unknown) => void
		await setup(
			{ nodes: [{ id: 'b', type: 'boom', x: 0, y: 0, width: 100, height: 100 }, { id: 's', type: 'sticky', note: 'n', x: 200, y: 0, width: 100, height: 100 }, card('a', 400, 0)] },
			{ nodeRenderers: { boom: Boom } },
			{ 'node-sticky': (p) => {
				update = (p as unknown as { update: (patch: unknown) => void }).update
				return [h('p', String(p.node.note))]
			} },
		)
		expect(wrapper.find('[data-key="b"]').text()).toContain('This card couldn’t be shown.')
		expect(error).toHaveBeenCalled()
		expect(wrapper.find('[data-key="a"]').exists()).toBe(true)
		for (const bad of ['nope', null, [], { id: 'other' }, { width: -1 }, { x: Number.NaN }]) update(bad)
		expect(emits()).toBe(0)
		update({ note: 'kept' })
		expect(doc().nodes![1]).toMatchObject({ id: 's', note: 'kept' })
		error.mockRestore()
	})
})

it('settles when a parent passes `nodeRenderers` inline and shows `issues`', async () => {
	// Each render of the parent makes a new `nodeRenderers` object; the canvas must not answer with new `issues`.
	let renders = 0
	const doc: JSONCanvas = { nodes: [{ id: 'c', type: 'custom', x: 0, y: 0, width: 100, height: 100 }, { id: 'u', type: 'unknown', x: 200, y: 0, width: 100, height: 100 }], edges: [] }
	const Parent = defineComponent({
		setup() {
			const canvas = useTemplateRef<InstanceType<typeof JsonCanvas>>('canvas')
			return () => {
				renders++
				return h('div', [
					h('span', String(canvas.value?.issues.length ?? '')),
					h(JsonCanvas, { ref: 'canvas', modelValue: doc, nodeRenderers: { custom: () => h('p', 'custom') } }),
				])
			}
		},
	})
	const parent = mount(Parent, { attachTo: document.body })
	await frame()
	await frame()
	await flushPromises()
	expect(parent.find('span').text()).toBe('1')
	expect(renders).toBeLessThan(10)
	parent.unmount()
})

describe('lifecycle', () => {
	it('leaves no listeners behind, even when unmounted mid-drag', async () => {
		const live = new Map<string, number>()
		const spies = [window, document].flatMap((target) => {
			const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target)
			return [
				vi.spyOn(target, 'addEventListener').mockImplementation((type: string, ...rest: unknown[]) => {
					live.set(type, (live.get(type) ?? 0) + 1)
					add(type, ...(rest as [EventListener]))
				}),
				vi.spyOn(target, 'removeEventListener').mockImplementation((type: string, ...rest: unknown[]) => {
					live.set(type, (live.get(type) ?? 0) - 1)
					remove(type, ...(rest as [EventListener]))
				}),
			]
		})
		for (let i = 0; i < 20; i++) {
			await setup({ nodes: [card('a', 0, 0)] })
			await drag(nodeEl('a'), [[10, 10], [60, 10]], {}, true)
			wrapper.unmount()
		}
		// Whatever the pointer does now reaches no canvas.
		pointer('pointermove', window, 100, 10)
		pointer('pointerup', window, 100, 10)
		spies.forEach(s => s.mockRestore())
		expect([...live].filter(([, n]) => n !== 0)).toEqual([])
	})

	it('keeps two canvases on one page apart', async () => {
		const other = mount(JsonCanvas, { attachTo: document.body, props: { modelValue: { nodes: [card('b', 0, 0)], edges: [] } } })
		await setup({ nodes: [card('a', 0, 0)] })
		await frame()
		wrapper.vm.select(['a'])
		other.vm.select(['b'])
		await key('Delete')
		expect(doc().nodes).toEqual([])
		expect((other.vm.canvas as JSONCanvas).nodes).toHaveLength(1)
		// Copy goes to the focused one only.
		;(other.find('.jc-canvas').element as HTMLElement).focus()
		const data = new DataTransfer()
		document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }))
		expect(JSON.parse(data.getData('text/plain')).nodes.map((n: { text: string }) => n.text)).toEqual(['b'])
		other.unmount()
	})
})

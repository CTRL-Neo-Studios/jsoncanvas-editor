// @vitest-environment happy-dom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, type VNode } from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { JSONCanvas, JSONCanvasEdge, JSONCanvasNode } from '../src/runtime/core'
import CanvasMenu from '../src/runtime/vue/components/CanvasMenu.vue'
import JsonCanvas from '../src/runtime/vue/components/JsonCanvas.vue'
import { IS_MAC } from '../src/runtime/vue/utils/platform'
import DropdownMenuStub from './stubs/DropdownMenuStub.vue'

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
	const n = doc().nodes!.find(n => n.id === id) as JSONCanvasNode
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

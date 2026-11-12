import type { DropdownMenuItem } from '@nuxt/ui'
import { computed, type ComputedRef, type Ref } from 'vue'
import {
	alignRects, arrangeRects, CANVAS_CLIP_TYPE, copyClip, distributeRects, fileKind, gridSpacing, GROUP_PADDING, growBBox,
	justifyRects, newId, NODE_SIZE, orderNodes, pasteClip, pointBox, PRESET_COLORS, readClip, rectOf, removeFromCanvas,
	setBackground, unionBBox,
	type AlignMode, type ArrangeMode, type Axis, type BBox, type CanvasEnd, type FileKind, type JSONCanvasEdge,
	type JSONCanvasGroupNode, type Point, type Rect,
} from '../../core'
import type { CanvasHost } from '../host'
import type { CanvasMessages } from '../messages'
import type { CanvasEditor, SceneEdge, SceneNode } from './useCanvasEditor'
import type { CanvasInteraction } from './useCanvasInteraction'

/** What the Align menu does. */
export type LayoutOp = AlignMode | `distribute-${Axis}` | `justify-${Axis}` | `arrange-${ArrangeMode}`

/** What a new card is: one of the built-in kinds, or a template of a custom card. */
export type NewCardKind = 'card' | 'file' | 'media' | 'webpage' | 'group'

/** A custom card offered for adding (bottom bar, menus): a node of its own `type`, at its size. */
export interface CardTemplate {
	label: string
	icon: string
	node: Record<string, unknown> & { type: string, width: number, height: number }
}

/** What `Mod`+drag on empty canvas creates. */
export type ModDragBehavior = 'menu' | NewCardKind

/** Where a right-click happened, for its menu. `at` is in world units. */
export interface MenuTarget {
	kind: 'canvas' | 'node' | 'edge' | 'selection'
	/** The node's or edge's key. */
	key?: string
	at: Point
}

/** A context menu about to open; handlers may add items (groups of items). */
export interface CanvasMenuEvent extends MenuTarget {
	items: DropdownMenuItem[][]
}

/** A button of the floating selection toolbar; `children` opens a menu, `id: 'color'` the color picker. */
export interface ToolbarItem {
	id: string
	label: string
	icon: string
	onSelect?: () => void
	children?: DropdownMenuItem[][]
}

/** Where a new card goes: centered on or with its top left at `at`, or exactly `box`. */
export type Placement = { at: Point, center?: boolean } | { box: BBox }

export interface CanvasSettings {
	readonly: Ref<boolean>
	snapToGrid: Ref<boolean>
	snapToObjects: Ref<boolean>
}

export interface ActionsOptions {
	settings: CanvasSettings
	host: () => CanvasHost | undefined
	messages: () => CanvasMessages
	customTypes: () => ReadonlySet<string>
	cardTemplates: () => readonly CardTemplate[]
	modDragBehavior: () => ModDragBehavior
	/** A context menu is about to open: the host may add to it. */
	onMenu: (e: CanvasMenuEvent) => void
}

/** What the toolbar, the bottom bar, the controls and the context menus do. */
export interface CanvasActions {
	/** Selected nodes in z-order (bottom first), and selected edges. */
	selectedNodes: ComputedRef<SceneNode[]>
	selectedEdges: ComputedRef<SceneEdge[]>
	toolbarItems: ComputedRef<ToolbarItem[]>
	/** Where the toolbar's bottom centre goes (px from the canvas's top left), above the selection. */
	toolbarAnchor: ComputedRef<Point | undefined>
	/** The color of the selection's topmost item (`''` for none). */
	currentColor: ComputedRef<string>
	/** Colors every selected node and edge (`''` removes the color); `preview` shows it without saving. */
	setColor: (color: string, preview?: boolean) => void
	removeSelection: () => void
	createGroup: () => void
	layout: (op: LayoutOp) => void
	setLineDirection: (fromEnd: CanvasEnd, toEnd: CanvasEnd) => void
	/** Adds a card of `kind` (asking the host for a file or the user for a URL when needed), selected. */
	add: (kind: NewCardKind | CardTemplate, place: Placement) => void
	/** The menu of things to add at `place`. */
	creationItems: (place: Placement) => DropdownMenuItem[]
	/** Mod+drag drew `box`: creates what `modDragBehavior` says, or returns the menu to offer (`'menu'`). */
	createWithSize: (box: BBox) => DropdownMenuItem[] | undefined
	/** A context menu's items for `target`, after the host's additions. */
	menu: (target: MenuTarget) => DropdownMenuItem[][]
	/** Puts the selected nodes and the edges among them in `data` (a copy event's clipboard); false with no node selected. */
	copy: (data: DataTransfer) => boolean
	/** `copy`, then removes the selection. */
	cut: (data: DataTransfer) => boolean
	/**
	 * Adds what `data` (a paste or a drop) holds, centred on `at` (the view's centre by default): the host's files
	 * (`host.filesIn`), files (`host.importFiles`), cards copied from a canvas, a web page for a URL, else a text card.
	 * False when it holds none of these.
	 */
	paste: (data: DataTransfer, at?: Point) => boolean
}

const YOUTUBE = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//
const WEB_URL = /^https?:\/\/\S+$/i
/** Pasted files are laid out in rows of this many cards, this far apart. */
const PASTE_COLUMNS = 10
const PASTE_GAP = 45
const KINDS: Record<'file' | 'media', FileKind[]> = { file: ['markdown', 'canvas'], media: ['image', 'video', 'audio', 'pdf'] }
const SIZES: Record<NewCardKind, { width: number, height: number }> = {
	card: NODE_SIZE.text,
	file: NODE_SIZE.file,
	media: NODE_SIZE.file,
	webpage: NODE_SIZE.file,
	group: NODE_SIZE.file,
}
const ICONS: Record<NewCardKind, string> = {
	card: 'i-lucide-sticky-note',
	file: 'i-lucide-file-text',
	media: 'i-lucide-file-image',
	webpage: 'i-lucide-globe',
	group: 'i-lucide-group',
}

/** The edge with the ends a line direction gives it; defaults left out, keys in Obsidian's order. */
function withEnds(edge: JSONCanvasEdge, fromEnd: CanvasEnd, toEnd: CanvasEnd): JSONCanvasEdge {
	const { fromEnd: _from, toEnd: _to, color, label, ...rest } = edge
	return {
		...rest,
		...(fromEnd !== 'none' && { fromEnd }),
		...(toEnd !== 'arrow' && { toEnd }),
		...(color !== undefined && { color }),
		...(label !== undefined && { label }),
	}
}

const boxOf = (p: Placement, size: { width: number, height: number }): BBox => {
	if ('box' in p) return p.box
	const x = p.center ? p.at.x - size.width / 2 : p.at.x, y = p.center ? p.at.y - size.height / 2 : p.at.y
	return { minX: x, minY: y, maxX: x + size.width, maxY: y + size.height }
}

/** A box of `size` centred on `p`, in whole units. */
const rectAt = (p: Point, size: { width: number, height: number }) =>
	({ x: Math.round(p.x - size.width / 2), y: Math.round(p.y - size.height / 2), ...size })

export function useCanvasActions(editor: CanvasEditor, interaction: CanvasInteraction, o: ActionsOptions): CanvasActions {
	const { scene, viewport } = editor
	const t = o.messages
	const readonly = () => o.settings.readonly.value

	const selectedNodes = computed(() => scene.value.nodes.filter(n => editor.selected.value.has(n.key)))
	const selectedEdges = computed(() => scene.value.edges.filter(e => editor.selected.value.has(e.key)))
	/** The topmost selected item: a node over any edge. */
	const primary = computed(() => selectedNodes.value.at(-1) ?? selectedEdges.value.at(-1))
	const currentColor = computed(() => {
		const p = primary.value
		const c = p && ('node' in p ? p.node.color : p.edge.color)
		return typeof c === 'string' ? c : ''
	})

	function commitNodes(change: Map<object, Record<string, unknown>>) {
		const doc = editor.canvas.value
		editor.commit({ ...doc, nodes: doc.nodes!.map(n => change.get(n) ?? n) })
	}

	/** Inserts `nodes` (groups go behind, as always) and selects them. */
	function insert(...nodes: Array<Record<string, unknown> & { id: string }>) {
		const doc = editor.canvas.value
		editor.commit({ ...doc, nodes: orderNodes([...doc.nodes ?? [], ...nodes]) })
		editor.select(nodes.map(n => n.id))
	}

	const at = (b: BBox) => ({ x: Math.round(b.minX), y: Math.round(b.minY), width: Math.round(b.maxX - b.minX), height: Math.round(b.maxY - b.minY) })

	function add(kind: NewCardKind | CardTemplate, place: Placement) {
		if (readonly()) return
		if (typeof kind !== 'string') {
			insert({ ...kind.node, id: newId(), ...at(boxOf(place, kind.node)) })
			return
		}
		const box = boxOf(place, SIZES[kind])
		switch (kind) {
			case 'card': {
				const id = newId()
				insert({ id, ...at(box), type: 'text', text: '' })
				return interaction.startEditing(id)
			}
			case 'group': {
				const id = newId()
				insert({ id, ...at(box), type: 'group', label: t().untitledGroup })
				return interaction.editLabel(id)
			}
			case 'file':
			case 'media': {
				void o.host()?.pickFile?.({ kinds: KINDS[kind] }).then((file) => {
					if (file) insert({ id: newId(), ...at(box), type: 'file', file })
				})
				return
			}
			case 'webpage':
				interaction.prompt.value = {
					title: t().enterUrl,
					value: '',
					validate: url => (URL.canParse(url) ? undefined : t().invalidUrl),
					submit: (url) => {
						// A YouTube video gets a 16:9 card unless it was drawn with a size.
						const sized = YOUTUBE.test(url) && !('box' in place) ? boxOf(place, { width: 640, height: 360 }) : box
						insert({ id: newId(), ...at(sized), type: 'link', url })
					},
				}
		}
	}

	function creationItems(place: Placement): DropdownMenuItem[] {
		const pick = !!o.host()?.pickFile
		const builtIn: Array<[NewCardKind, string, boolean]> = [
			['card', t().addCard, true],
			['file', t().addFile, pick],
			['media', t().addMedia, pick],
			['webpage', t().addWebPage, true],
			['group', t().createGroup, true],
		]
		return [
			...builtIn.filter(([, , shown]) => shown).map(([kind, label]) => ({ label, icon: ICONS[kind], onSelect: () => add(kind, place) })),
			...o.cardTemplates().map(c => ({ label: c.label, icon: c.icon, onSelect: () => add(c, place) })),
		]
	}

	function setColor(color: string, preview = false) {
		if (readonly()) return
		const nodes = new Set(selectedNodes.value.map(n => n.node)), edges = new Set(selectedEdges.value.map(e => e.edge))
		const recolor = <T extends { color?: unknown }>(item: T): T => {
			if (color) return { ...item, color }
			const { color: _, ...rest } = item
			return rest as T
		}
		const doc = editor.canvas.value
		const next = {
			...doc,
			nodes: doc.nodes!.map(n => (nodes.has(n) ? recolor(n) : n)),
			edges: (doc.edges ?? []).map(e => (edges.has(e as JSONCanvasEdge) ? recolor(e) : e)),
		}
		if (preview) editor.preview(next)
		else editor.commit(next)
	}

	function removeSelection() {
		if (readonly()) return
		editor.commit(removeFromCanvas(editor.canvas.value, new Set(selectedNodes.value.map(n => n.node)), new Set(selectedEdges.value.map(e => e.edge))))
		editor.select([])
	}

	function copy(data: DataTransfer) {
		const clip = copyClip(editor.canvas.value, selectedNodes.value.map(n => n.node))
		if (!clip) return false
		const json = JSON.stringify(clip)
		data.setData(CANVAS_CLIP_TYPE, json)
		data.setData('text/plain', json)
		return true
	}

	/** File cards for `paths`, in rows centred on `at`. */
	function addFiles(paths: readonly string[], at: Point) {
		if (!paths.length || readonly()) return
		const { width, height } = NODE_SIZE.file, dx = width + PASTE_GAP, dy = height + PASTE_GAP
		const columns = Math.min(paths.length, PASTE_COLUMNS), rows = Math.ceil(paths.length / PASTE_COLUMNS)
		const left = at.x - (columns * dx - PASTE_GAP) / 2, top = at.y - (rows * dy - PASTE_GAP) / 2
		insert(...paths.map((file, i) => ({
			id: newId(), type: 'file', file, width, height,
			x: Math.round(left + (i % PASTE_COLUMNS) * dx), y: Math.round(top + Math.floor(i / PASTE_COLUMNS) * dy),
		})))
	}

	function paste(data: DataTransfer, at: Point = { x: viewport.view.x, y: viewport.view.y }) {
		if (readonly()) return false
		const host = o.host()
		// Everything is read before the first await: the transfer is emptied once its event is over.
		const own = host?.filesIn?.(data)
		const files = [...data.files]
		if (own) {
			void Promise.resolve(own).then(paths => addFiles(paths, at))
			return true
		}
		if (files.length && host?.importFiles) {
			void host.importFiles(files).then(paths => addFiles(paths, at))
			return true
		}
		const text = data.getData('text/plain')
		const clip = readClip(data.getData(CANVAS_CLIP_TYPE)) ?? readClip(text)
		if (clip) {
			const { canvas, clones } = pasteClip(editor.canvas.value, clip, at)
			editor.commit(canvas)
			editor.select(clones.map(n => String(n.id)))
			return true
		}
		const url = text.trim()
		if (WEB_URL.test(url) && URL.canParse(url)) {
			insert({ id: newId(), ...rectAt(at, YOUTUBE.test(url) ? { width: 640, height: 360 } : NODE_SIZE.file), type: 'link', url })
			return true
		}
		if (!text) return false
		const id = newId()
		insert({ id, ...rectAt(at, NODE_SIZE.text), type: 'text', text })
		interaction.startEditing(id)
		return true
	}

	function createGroup() {
		const box = unionBBox(selectedNodes.value.map(n => n.box))
		if (box) add('group', { box: growBBox(box, GROUP_PADDING) })
	}

	function layout(op: LayoutOp) {
		if (readonly()) return
		// A group alone aligns what's in it, within its box less the padding; otherwise the selected nodes.
		const only = selectedNodes.value.length === 1 ? selectedNodes.value[0]! : undefined
		const group = only?.kind === 'group' ? only : undefined
		const items = group
			? scene.value.nodes.filter(n => n !== group && n.box.minX >= group.box.minX && n.box.minY >= group.box.minY && n.box.maxX <= group.box.maxX && n.box.maxY <= group.box.maxY)
			: selectedNodes.value
		if (!items.length) return
		const rects: Rect[] = items.map(n => rectOf(n.box))
		const ref = group ? growBBox(group.box, -GROUP_PADDING) : undefined
		const [what, how] = op.split('-') as [string, string | undefined]
		const out = how === undefined
			? alignRects(rects, op as AlignMode, ref)
			: what === 'distribute'
				? distributeRects(rects, how as Axis)
				: what === 'justify'
					? justifyRects(rects, how as Axis, ref)
					: arrangeRects(rects, how as ArrangeMode, gridSpacing(viewport.view.zoom), ref)
		commitNodes(new Map(items.map((n, i) => [n.node, { ...n.node, ...out[i]! }])))
	}

	function setLineDirection(fromEnd: CanvasEnd, toEnd: CanvasEnd) {
		const edges = new Set(selectedEdges.value.map(e => e.edge))
		const doc = editor.canvas.value
		editor.commit({ ...doc, edges: doc.edges!.map(e => (edges.has(e as JSONCanvasEdge) ? withEnds(e as JSONCanvasEdge, fromEnd, toEnd) : e)) })
	}

	const DIRECTIONS = computed(() => [
		{ label: t().nondirectional, icon: 'i-lucide-minus', fromEnd: 'none', toEnd: 'none' },
		{ label: t().unidirectional, icon: 'i-lucide-arrow-right', fromEnd: 'none', toEnd: 'arrow' },
		{ label: t().bidirectional, icon: 'i-lucide-move-horizontal', fromEnd: 'arrow', toEnd: 'arrow' },
	] as const)

	function directionItems(edges: readonly SceneEdge[]): DropdownMenuItem[][] {
		const e = edges.at(-1)?.edge
		// As Obsidian shows it: an arrow at the start means both ways.
		const current = e?.fromEnd === 'arrow' ? 2 : e?.toEnd === 'none' ? 0 : 1
		return [DIRECTIONS.value.map((d, i) => ({
			label: d.label,
			icon: d.icon,
			type: 'checkbox' as const,
			checked: i === current,
			onSelect: () => setLineDirection(d.fromEnd, d.toEnd),
		}))]
	}

	const layoutItems = computed((): DropdownMenuItem[][] => {
		const item = (op: LayoutOp, label: string, icon: string): DropdownMenuItem => ({ label, icon, onSelect: () => layout(op) })
		const m = t()
		return [
			[item('left', m.alignLeft, 'i-lucide-align-start-vertical'), item('center', m.alignCenter, 'i-lucide-align-center-vertical'), item('right', m.alignRight, 'i-lucide-align-end-vertical')],
			[item('top', m.alignTop, 'i-lucide-align-start-horizontal'), item('middle', m.alignMiddle, 'i-lucide-align-center-horizontal'), item('bottom', m.alignBottom, 'i-lucide-align-end-horizontal')],
			[item('arrange-row', m.arrangeRow, 'i-lucide-columns-3'), item('arrange-column', m.arrangeColumn, 'i-lucide-rows-3'), item('arrange-grid', m.arrangeGrid, 'i-lucide-layout-grid')],
			[item('distribute-horizontal', m.distributeHorizontal, 'i-lucide-align-horizontal-space-between'), item('distribute-vertical', m.distributeVertical, 'i-lucide-align-vertical-space-between')],
			[item('justify-horizontal', m.justifyHorizontal, 'i-lucide-stretch-horizontal'), item('justify-vertical', m.justifyVertical, 'i-lucide-stretch-vertical')],
		]
	})

	function backgroundItems(group: SceneNode): DropdownMenuItem[][] {
		const node = group.node as JSONCanvasGroupNode
		const style = node.backgroundStyle ?? 'cover'
		const set = (bg?: string, s?: 'cover' | 'ratio' | 'repeat') => commitNodes(new Map([[group.node, setBackground(node, bg, s)]]))
		const pick = () => void o.host()?.pickFile?.({ kinds: ['image'] }).then(path => path && set(path, style))
		const m = t()
		const styles: Array<['cover' | 'ratio' | 'repeat', string, string]> = [
			['cover', m.backgroundCover, 'i-lucide-scaling'],
			['ratio', m.backgroundRatio, 'i-lucide-ratio'],
			['repeat', m.backgroundRepeat, 'i-lucide-layout-grid'],
		]
		return [
			[
				...(o.host()?.pickFile ? [{ label: m.replaceBackground, icon: 'i-lucide-repeat', onSelect: pick }] : []),
				{ label: m.removeBackground, icon: 'i-lucide-image-off', onSelect: () => set(undefined) },
			],
			styles.map(([s, label, icon]) => ({ label, icon, type: 'checkbox' as const, checked: style === s, onSelect: () => set(node.background, s) })),
		]
	}

	const toolbarItems = computed((): ToolbarItem[] => {
		const nodes = selectedNodes.value, edges = selectedEdges.value, p = primary.value
		if (!p) return []
		const m = t()
		const zoom: ToolbarItem = { id: 'zoom', label: m.zoomToSelection, icon: 'i-lucide-scan-search', onSelect: editor.zoomToSelection }
		if (readonly()) return [zoom]
		const items: ToolbarItem[] = [
			{ id: 'remove', label: m.remove, icon: 'i-lucide-trash-2', onSelect: removeSelection },
			{ id: 'color', label: m.setColor, icon: 'i-lucide-palette' },
			zoom,
		]
		const count = nodes.length + edges.length
		if ('node' in p) {
			const align: ToolbarItem = { id: 'align', label: m.align, icon: 'i-lucide-align-start-vertical', children: layoutItems.value }
			if (count > 1) return [...items, { id: 'group', label: m.createGroup, icon: 'i-lucide-group', onSelect: createGroup }, align]
			if (p.kind === 'group') {
				const node = p.node as JSONCanvasGroupNode
				const hasBackground = typeof node.background === 'string' && !!node.background
				items.push(align, { id: 'label', label: m.editLabel, icon: 'i-lucide-pencil', onSelect: () => interaction.editLabel(p.key) })
				if (hasBackground) items.push({ id: 'background', label: m.editBackground, icon: 'i-lucide-image', children: backgroundItems(p) })
				else if (o.host()?.pickFile) items.push({ id: 'background', label: m.setBackground, icon: 'i-lucide-image', onSelect: () => void o.host()!.pickFile!({ kinds: ['image'] }).then(path => path && commitNodes(new Map([[p.node, setBackground(node, path)]]))) })
			}
			else if (p.kind === 'text' || o.customTypes().has(String(p.node.type))) {
				items.push({ id: 'edit', label: m.edit, icon: 'i-lucide-pencil', onSelect: () => interaction.startEditing(p.key) })
			}
			return items
		}
		const current = edges.at(-1)!.edge
		const icon = current.fromEnd === 'arrow' ? 'i-lucide-move-horizontal' : current.toEnd === 'none' ? 'i-lucide-minus' : 'i-lucide-arrow-right'
		items.push({ id: 'direction', label: m.lineDirection, icon, children: directionItems(edges) })
		if (count === 1) {
			if (current.label) items.push({ id: 'remove-label', label: m.removeLabel, icon: 'i-lucide-x-square', onSelect: () => interaction.finishLabel(p.key, '') })
			items.push({ id: 'label', label: m.editLabel, icon: 'i-lucide-pencil', onSelect: () => interaction.editLabel(p.key) })
		}
		return items
	})

	const toolbarAnchor = computed(() => {
		const nodes = selectedNodes.value, edges = selectedEdges.value, p = primary.value
		const box = unionBBox([...nodes.map(n => n.box), ...edges.flatMap(e => [pointBox(e.shape.start), pointBox(e.shape.end)])])
		if (!box || !p || interaction.dragging.value) return
		const s = viewport.scale.value, root = Math.sqrt(s), { view, size } = viewport
		let y = box.minY - 10 / s
		// Clears a group's label, or a file card's name.
		if (nodes.some(n => n.kind === 'group')) y = box.minY - 35 / root
		else if ('node' in p && p.kind === 'file') y = box.minY - 30 / root
		if (nodes.length === 0 && edges.length === 1) y = Math.min(y, edges[0]!.shape.label.y - 20 / s - 10)
		return { x: ((box.minX + box.maxX) / 2 - view.x) * s + size.width / 2, y: (y - view.y) * s + size.height / 2 }
	})

	/** The node's own items in its context menu. */
	function nodeItems(item: SceneNode): DropdownMenuItem[] {
		const edit = !readonly(), host = o.host(), n = item.node, m = t()
		const all: Array<DropdownMenuItem | false> = item.kind === 'text' || o.customTypes().has(String(n.type))
			? [edit && { label: m.edit, icon: 'i-lucide-pencil', onSelect: () => interaction.startEditing(item.key) }]
			: item.kind === 'group'
				? [edit && { label: m.editLabel, icon: 'i-lucide-pencil', onSelect: () => interaction.editLabel(item.key) }]
				: item.kind === 'file'
					? [
							edit && !!host?.pickFile && { label: m.swapFile, icon: 'i-lucide-repeat', onSelect: () => interaction.swapFile(item.key) },
							!!host?.openFile && fileKind(n.file as string) === 'markdown' && { label: m.openInNewTab, icon: 'i-lucide-file-plus', onSelect: () => interaction.openNode(item, true) },
						]
					: item.kind === 'link'
						? [
								edit && { label: m.changeUrl, icon: 'i-lucide-link', onSelect: () => changeUrl(item) },
								{ label: m.openInBrowser, icon: 'i-lucide-globe', onSelect: () => interaction.openNode(item, true) },
								{ label: m.copyUrl, icon: 'i-lucide-copy', onSelect: () => void navigator.clipboard.writeText(n.url as string) },
								{ label: m.reloadPage, icon: 'i-lucide-rotate-ccw', onSelect: () => interaction.reload(item.key) },
							]
						: []
		return all.filter(i => !!i)
	}

	function changeUrl(item: SceneNode) {
		interaction.prompt.value = {
			title: t().enterUrl,
			value: item.node.url as string,
			validate: url => (URL.canParse(url) ? undefined : t().invalidUrl),
			submit: url => interaction.updateNode(item.key, { url }),
		}
	}

	/** The toolbar's actions as menu items, for a multi-selection's context menu. */
	function selectionItems(): DropdownMenuItem[][] {
		const m = t()
		const colors: DropdownMenuItem[] = [
			{ label: m.noColor, onSelect: () => setColor('') },
			...PRESET_COLORS.map(c => ({ label: c, icon: 'i-lucide-circle', class: `jc-color-${c} jc-swatch-item`, onSelect: () => setColor(c) })),
		]
		const items = toolbarItems.value.flatMap((i): DropdownMenuItem[] => {
			if (i.id === 'remove') return []
			if (i.id === 'color') return [{ label: i.label, icon: i.icon, children: [colors] }]
			return [{ label: i.label, icon: i.icon, onSelect: i.onSelect, children: i.children }]
		})
		const remove = toolbarItems.value.find(i => i.id === 'remove')
		return [items, remove ? [{ label: remove.label, icon: remove.icon, color: 'error', onSelect: remove.onSelect }] : []]
	}

	function menu(target: MenuTarget): DropdownMenuItem[][] {
		const edit = !readonly(), m = t()
		let items: DropdownMenuItem[][] = []
		const zoom: DropdownMenuItem = { label: m.zoomToSelection, icon: 'i-lucide-scan-search', onSelect: editor.zoomToSelection }
		const remove: DropdownMenuItem[] = edit ? [{ label: m.remove, icon: 'i-lucide-trash-2', color: 'error', onSelect: removeSelection }] : []
		if (target.kind === 'canvas') {
			const { settings } = o
			const toggle = (label: string, icon: string, setting: Ref<boolean>): DropdownMenuItem => ({
				label, icon, type: 'checkbox', checked: setting.value, onUpdateChecked: (v: boolean) => (setting.value = v),
			})
			items = [
				edit ? creationItems({ at: target.at }) : [],
				[
					...(edit && editor.canUndo.value ? [{ label: m.undo, icon: 'i-lucide-undo-2', onSelect: editor.undo }] : []),
					...(edit && editor.canRedo.value ? [{ label: m.redo, icon: 'i-lucide-redo-2', onSelect: editor.redo }] : []),
				],
				[
					{ label: m.selectAll, icon: 'i-lucide-box-select', onSelect: () => editor.select(scene.value.nodes.map(n => n.key)) },
					{ label: m.zoomToFit, icon: 'i-lucide-maximize', onSelect: () => editor.zoomToFit() },
				],
				[
					toggle(m.snapToGrid, 'i-lucide-grid-3x3', settings.snapToGrid),
					toggle(m.snapToObjects, 'i-lucide-magnet', settings.snapToObjects),
					toggle(m.readonly, 'i-lucide-lock', settings.readonly),
				],
			]
		}
		else if (target.kind === 'node') {
			const item = scene.value.byKey.get(target.key!)
			if (item) items = [nodeItems(item), [zoom], remove]
		}
		else if (target.kind === 'edge') {
			const item = scene.value.edgeByKey.get(target.key!)
			if (item) {
				const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
				// Follow to the end farther from where the edge was clicked.
				const far = d(target.at, item.shape.start) < d(target.at, item.shape.end) ? item.to : item.from
				const follow: DropdownMenuItem = { label: m.followConnection, icon: 'i-lucide-corner-down-right', onSelect: () => viewport.zoomToBBox(far) }
				items = edit
					? [[
							{ label: m.editLabel, icon: 'i-lucide-pencil', onSelect: () => interaction.editLabel(item.key) },
							{ label: m.lineDirection, icon: 'i-lucide-move-horizontal', children: directionItems([item]) },
							follow,
						], remove]
					: [[follow]]
			}
		}
		else {
			items = selectionItems()
		}
		o.onMenu({ ...target, items })
		return items.filter(g => g.length)
	}

	return {
		selectedNodes, selectedEdges, toolbarItems, toolbarAnchor, currentColor,
		setColor, removeSelection, createGroup, layout, setLineDirection, add, creationItems, menu, copy, paste,
		cut(data) {
			if (readonly() || !copy(data)) return false
			removeSelection()
			return true
		},
		createWithSize(box) {
			const behavior = o.modDragBehavior()
			if (behavior === 'menu') return creationItems({ box })
			add(behavior, { box })
		},
	}
}

import type { CanvasHost } from '@type32/jsoncanvas-editor/vue'
import type { ShallowRef } from 'vue'
import { download, noteLinks, resolveTarget } from './links'

// The File System Access API's pickers (Chromium only), which TypeScript's DOM types leave out.
declare global {
	interface Window {
		showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
		showOpenFilePicker?: (options?: { startIn?: FileSystemHandle }) => Promise<FileSystemFileHandle[]>
	}
}

/** A folder opened with the File System Access API: a `CanvasHost` over its files, and its canvases to edit in place. */
export interface CanvasFolder {
	name: string
	host: CanvasHost
	/** Every file in the folder (dot-folders aside), as `/`-separated paths; imports add to it. */
	paths: ShallowRef<string[]>
	read: (path: string) => Promise<string>
	write: (path: string, data: string | Blob) => Promise<void>
}

async function list(dir: FileSystemDirectoryHandle, prefix = ''): Promise<string[]> {
	const out: string[] = []
	for await (const [name, entry] of dir.entries()) {
		if (name.startsWith('.')) continue
		if (entry.kind === 'file') out.push(prefix + name)
		else out.push(...await list(entry as FileSystemDirectoryHandle, `${prefix}${name}/`))
	}
	return out.sort()
}

/**
 * Asks for a folder (an Obsidian vault, say); `undefined` when cancelled or unsupported. Canvas cards opened from the
 * canvas go to `openCanvas`. Call it from a click (the picker needs one) in a component with Nuxt UI's toasts.
 */
export async function openCanvasFolder(openCanvas: (path: string) => void): Promise<CanvasFolder | undefined> {
	const toast = useToast()
	if (!window.showDirectoryPicker) {
		toast.add({ title: 'Opening a folder needs a Chromium browser', color: 'error' })
		return
	}
	const dir = await window.showDirectoryPicker({ mode: 'readwrite' }).catch(() => undefined)
	if (!dir) return
	const paths = shallowRef(await list(dir))
	// ponytail: object URLs are kept until reload; revoke them if folders get large or long-lived.
	const urls = new Map<string, string>()

	async function handle(path: string, create = false): Promise<FileSystemFileHandle> {
		const parts = path.split('/')
		let folder: FileSystemDirectoryHandle = dir!
		for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create })
		return folder.getFileHandle(parts.at(-1)!, { create })
	}
	const read = async (path: string) => (await (await handle(path)).getFile()).text()
	async function write(path: string, data: string | Blob) {
		const stream = await (await handle(path, true)).createWritable()
		await stream.write(data)
		await stream.close()
	}
	/** Opens what `path` is: a canvas in the playground, anything else as a toast. */
	function open(path: string, subpath?: string) {
		if (path.endsWith('.canvas')) openCanvas(path)
		else toast.add({ title: `Open ${path}${subpath ?? ''}` })
	}

	const host: CanvasHost = {
		async resolveFile(path) {
			try {
				const file = await (await handle(path)).getFile()
				let url = urls.get(path)
				if (!url) urls.set(path, url = URL.createObjectURL(file))
				return { exists: true, url }
			}
			catch {
				return { exists: false }
			}
		},
		readText: read,
		async pickFile() {
			const [file] = await window.showOpenFilePicker?.({ startIn: dir }).catch(() => []) ?? []
			const parts = file && await dir.resolve(file)
			if (file && !parts) toast.add({ title: 'Pick a file inside the folder', color: 'warning' })
			return parts?.join('/')
		},
		async importFiles(files) {
			const added: string[] = []
			for (const file of files) {
				const dot = file.name.lastIndexOf('.')
				const [base, ext] = dot > 0 ? [file.name.slice(0, dot), file.name.slice(dot)] : [file.name, '']
				let path = file.name
				// Obsidian's naming for a clash: "name 1.ext".
				for (let n = 1; paths.value.includes(path); n++) path = `${base} ${n}${ext}`
				await write(path, file)
				added.push(path)
			}
			paths.value = [...paths.value, ...added].sort()
			return added
		},
		listLinks: async path => noteLinks(await read(path), path, paths.value),
		openFile: (path, subpath) => open(path, subpath),
		openLink(target) {
			const hash = target.indexOf('#')
			const name = hash < 0 ? target : target.slice(0, hash), subpath = hash < 0 ? undefined : target.slice(hash)
			const path = name ? resolveTarget(name, paths.value) : undefined
			if (path) open(path, subpath)
			else toast.add({ title: `No file for [[${target}]]`, color: 'warning' })
		},
		saveImage: png => download(png, 'canvas.png'),
	}
	return { name: dir.name, host, paths, read, write }
}

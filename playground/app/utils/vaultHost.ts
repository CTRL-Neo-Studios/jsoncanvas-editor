import type { CanvasHost } from '@type32/jsoncanvas-editor/vue'
import { download, noteLinks } from './links'

/** Where the playground server serves a vault path: `/vault/` plus each segment URL-encoded. */
const vaultUrl = (path: string): string => '/vault/' + path.split('/').map(encodeURIComponent).join('/')

/** A `CanvasHost` over the vault the playground server serves (`/vault/<path>`, `/vault-index`). Call it in `setup`. */
export function createVaultHost(): CanvasHost {
	const toast = useToast()
	let index: Promise<string[]> | undefined
	// ponytail: imported files live in memory until reload; a POST route would keep them in the vault.
	const imported = new Map<string, string>()
	const urlOf = (path: string) => imported.get(path) ?? vaultUrl(path)

	async function readText(path: string): Promise<string> {
		const res = await fetch(urlOf(path))
		if (!res.ok) throw new Error(`${path}: ${res.status}`)
		return res.text()
	}

	return {
		async resolveFile(path) {
			const url = urlOf(path)
			return { exists: imported.has(path) || (await fetch(url, { method: 'HEAD' })).ok, url }
		},
		async importFiles(files) {
			return files.map((file) => {
				let path = `Imported/${file.name}`
				for (let n = 1; imported.has(path); n++) path = `Imported/${n} ${file.name}`
				imported.set(path, URL.createObjectURL(file))
				return path
			})
		},
		readText,
		saveImage: png => download(png, 'canvas.png'),
		async listLinks(path) {
			index ??= fetch('/vault-index').then(res => res.json())
			const [text, paths] = await Promise.all([readText(path), index])
			return noteLinks(text, path, paths)
		},
		pickFile: async () => window.prompt('File path') || undefined,
		openFile(path, subpath, newTab) {
			toast.add({ title: `Open ${path}${subpath ?? ''}${newTab ? ' in a new tab' : ''}` })
		},
		openLink(target) {
			toast.add({ title: `Follow [[${target}]]` })
		},
	}
}

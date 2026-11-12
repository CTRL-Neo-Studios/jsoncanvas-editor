import { fileName } from '@type32/jsoncanvas-editor/core'
import type { CanvasHost, CanvasLink } from '@type32/jsoncanvas-editor/vue'

/** Where the playground server serves a vault path: `/vault/` plus each segment URL-encoded. */
const vaultUrl = (path: string): string => '/vault/' + path.split('/').map(encodeURIComponent).join('/')

/** `[[target#subpath|alias]]`, but not `![[embeds]]`. */
const wikiLink = /(?<!!)\[\[([^\]|#]*)(#[^\]|]*)?(?:\|[^\]]*)?\]\]/g

/** The vault path a link target points to, Obsidian-style: the exact path, the path plus `.md`, else the shortest path with that file name. */
function resolveTarget(target: string, paths: string[]): string | undefined {
	if (paths.includes(target)) return target
	if (paths.includes(`${target}.md`)) return `${target}.md`
	const name = fileName(target)
	return paths.filter(p => [name, `${name}.md`].includes(fileName(p))).sort((a, b) => a.length - b.length)[0]
}

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
		saveImage(png) {
			const a = document.createElement('a')
			a.href = URL.createObjectURL(png)
			a.download = 'canvas.png'
			a.click()
			setTimeout(() => URL.revokeObjectURL(a.href), 1000)
		},
		async listLinks(path) {
			index ??= fetch('/vault-index').then(res => res.json())
			const [text, paths] = await Promise.all([readText(path), index])
			const links = new Map<string, CanvasLink>()
			for (const [, target = '', subpath] of text.matchAll(wikiLink)) {
				const file = target.trim() ? resolveTarget(target.trim(), paths) : path
				if (file) links.set(file + (subpath ?? ''), subpath ? { file, subpath } : { file })
			}
			return [...links.values()]
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

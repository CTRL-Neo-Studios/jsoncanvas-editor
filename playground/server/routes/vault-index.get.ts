import { readdir } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

/** `GET /vault-index`: every file of the vault, as `/`-separated vault paths, leaving out dot-folders and dotfiles. */
export default defineEventHandler(async (event) => {
	const root = resolve(useRuntimeConfig(event).vaultRoot)
	const entries = await readdir(root, { recursive: true, withFileTypes: true })
	return entries
		.filter(e => e.isFile())
		.map(e => relative(root, join(e.parentPath, e.name)).split(sep).join('/'))
		.filter(path => !path.split('/').some(part => part.startsWith('.')))
})

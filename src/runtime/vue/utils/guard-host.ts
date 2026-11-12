import type { CanvasError, CanvasHost, CanvasLink, ResolvedFile } from '../host'

const isString = (v: unknown): v is string => typeof v === 'string'
const strings = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every(isString) ? v : undefined)

/**
 * `host` with every call made safe: a member that throws, rejects or answers with the wrong type is reported to
 * `report` and treated as having nothing to offer (an existing file without a URL, no text, a cancelled picker, no
 * imported files, no links). `readText` and `saveImage` still reject after reporting, so their callers can tell.
 */
export function guardHost(host: CanvasHost | undefined, report: (e: CanvasError) => void): CanvasHost | undefined {
	if (!host) return undefined
	const fail = (action: CanvasError['action'], error: unknown) => report({ action, error })
	const wrongType = (action: CanvasError['action'], value: unknown) =>
		fail(action, new TypeError(`host.${action} answered ${value === null ? 'null' : typeof value}`))

	/** Runs `call`, checks its answer, and falls back to `fallback` (reported) when it fails. */
	async function safe<T>(action: CanvasError['action'], call: () => unknown, check: (v: unknown) => T | undefined, fallback: T): Promise<T> {
		try {
			const value = await call()
			const checked = check(value)
			if (checked === undefined && value !== undefined) wrongType(action, value)
			return checked ?? fallback
		}
		catch (error) {
			fail(action, error)
			return fallback
		}
	}

	const { resolveFile, readText, pickFile, importFiles, filesIn, saveImage, listLinks, openFile, openLink } = host
	return {
		...(resolveFile && {
			resolveFile: path => safe<ResolvedFile>('resolveFile', () => resolveFile(path), v => (typeof v === 'object' && v !== null && typeof (v as ResolvedFile).exists === 'boolean'
				? {
						exists: (v as ResolvedFile).exists,
						...(isString((v as ResolvedFile).name) && { name: (v as ResolvedFile).name }),
						...(isString((v as ResolvedFile).ext) && { ext: (v as ResolvedFile).ext }),
						...(isString((v as ResolvedFile).url) && { url: (v as ResolvedFile).url }),
					}
				: undefined), { exists: true }),
		}),
		...(readText && {
			async readText(path) {
				let value: unknown
				try {
					value = await readText(path)
				}
				catch (error) {
					fail('readText', error)
					throw error
				}
				if (isString(value)) return value
				wrongType('readText', value)
				throw new TypeError('host.readText didn\'t answer text')
			},
		}),
		...(pickFile && { pickFile: options => safe('pickFile', () => pickFile(options), v => (isString(v) && v ? v : undefined), undefined) }),
		...(importFiles && { importFiles: files => safe('importFiles', () => importFiles(files), strings, []) }),
		...(filesIn && {
			// Synchronous up to its answer: the transfer is only readable during its event.
			filesIn(data) {
				let value: string[] | Promise<string[]> | undefined
				try {
					value = filesIn(data)
				}
				catch (error) {
					fail('filesIn', error)
					return undefined
				}
				if (value === undefined) return undefined
				return safe('filesIn', () => value, strings, [])
			},
		}),
		...(saveImage && {
			async saveImage(png) {
				try {
					await saveImage(png)
				}
				catch (error) {
					fail('saveImage', error)
					throw error
				}
			},
		}),
		...(listLinks && {
			listLinks: path => safe<CanvasLink[]>('listLinks', () => listLinks(path), v => (Array.isArray(v)
				? v.filter((l): l is CanvasLink => typeof l === 'object' && l !== null && isString(l.file) && (l.subpath === undefined || isString(l.subpath)))
				: undefined), []),
		}),
		...(openFile && {
			openFile(path, subpath, newTab) {
				try {
					openFile(path, subpath, newTab)
				}
				catch (error) {
					fail('openFile', error)
				}
			},
		}),
		...(openLink && {
			openLink(target) {
				try {
					openLink(target)
				}
				catch (error) {
					fail('openLink', error)
				}
			},
		}),
	}
}

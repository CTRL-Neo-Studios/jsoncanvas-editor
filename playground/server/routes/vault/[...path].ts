import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const types: Record<string, string> = {
	md: 'text/markdown; charset=utf-8',
	txt: 'text/plain; charset=utf-8',
	canvas: 'application/json; charset=utf-8',
	json: 'application/json; charset=utf-8',
	base: 'text/yaml; charset=utf-8',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	bmp: 'image/bmp',
	svg: 'image/svg+xml',
	mp4: 'video/mp4',
	webm: 'video/webm',
	ogv: 'video/ogg',
	mov: 'video/quicktime',
	mkv: 'video/x-matroska',
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	m4a: 'audio/mp4',
	ogg: 'audio/ogg',
	flac: 'audio/flac',
	pdf: 'application/pdf',
	zip: 'application/zip',
}

/** `GET|HEAD /vault/<encoded path>`: a file of the vault; 404 when missing or outside it. */
// ponytail: no Range support, so Safari won't play video; add `accept-ranges` + partial reads if that matters.
export default defineEventHandler(async (event) => {
	const root = resolve(useRuntimeConfig(event).vaultRoot)
	let path: string
	try {
		path = decodeURIComponent(getRouterParam(event, 'path') ?? '')
	}
	catch {
		throw createError({ statusCode: 400 })
	}
	const file = resolve(root, path)
	const info = file.startsWith(root + sep) ? await stat(file).catch(() => undefined) : undefined
	if (!info?.isFile()) throw createError({ statusCode: 404 })
	setResponseHeaders(event, {
		'content-type': types[extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream',
		'content-length': info.size,
	})
	return event.method === 'HEAD' ? '' : readFile(file)
})

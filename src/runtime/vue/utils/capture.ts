/**
 * Draws an element into a PNG: a copy of it goes into an SVG `foreignObject` together with the page's stylesheets, and
 * the browser lays out and paints that as it does the page. Copying each element's computed style instead (what
 * libraries such as `modern-screenshot` do) costs about a millisecond per element: twenty seconds for a thousand
 * cards. An SVG image loads nothing itself, so images, video frames, backgrounds and fonts by URL become data URLs.
 */

const XHTML = 'http://www.w3.org/1999/xhtml'
const URL_IN_CSS = /url\((['"]?)([^'")]+)\1\)/g

/** Data URLs by URL, for the page's lifetime: fonts and images are the same from one export to the next. */
const inlined = new Map<string, Promise<string>>()

function dataUrl(url: string): Promise<string> {
	if (url.startsWith('data:')) return Promise.resolve(url)
	let p = inlined.get(url)
	if (!p) {
		p = fetch(url)
			.then(res => (res.ok ? res.blob() : Promise.reject(new Error(`${url}: ${res.status}`))))
			.then(blob => new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onload = () => resolve(reader.result as string)
				reader.onerror = () => reject(reader.error)
				reader.readAsDataURL(blob)
			}))
		// A failure (offline, cross-origin) isn't kept: the next export tries again. Meanwhile it draws nothing.
		p.catch(() => inlined.delete(url))
		inlined.set(url, p)
	}
	return p.catch(() => '')
}

/** `css` with each `url(…)` (resolved against `base`) as a data URL. */
async function inlineUrls(css: string, base: string): Promise<string> {
	const urls = [...new Set([...css.matchAll(URL_IN_CSS)].map(m => m[2]!))].filter(u => !u.startsWith('data:') && !u.startsWith('#'))
	if (!urls.length) return css
	const data = new Map(await Promise.all(urls.map(async u => [u, await dataUrl(new URL(u, base).href)] as const)))
	return css.replace(URL_IN_CSS, (all, _q, u: string) => (data.get(u) ? `url("${data.get(u)}")` : all))
}

/** The page's stylesheets as one text, with their URLs inlined. Sheets from other origins can't be read and are left out. */
async function pageCss(): Promise<string> {
	const sheets = await Promise.all([...document.styleSheets].map(async (sheet) => {
		let text: string
		try {
			text = [...sheet.cssRules].map(r => r.cssText).join('\n')
		}
		catch {
			return ''
		}
		return inlineUrls(text, sheet.href ?? location.href)
	}))
	return sheets.join('\n')
}

/** Copies what `cloneNode` leaves behind into `copy`: video frames (as images), and image and background URLs inlined. */
async function prepareCopy(source: HTMLElement, copy: HTMLElement) {
	const videos = [...source.querySelectorAll('video')], copies = [...copy.querySelectorAll('video')]
	for (const [i, video] of videos.entries()) {
		const img = document.createElement('img')
		img.className = video.className
		img.setAttribute('style', video.getAttribute('style') ?? '')
		try {
			const c = document.createElement('canvas')
			c.width = video.videoWidth
			c.height = video.videoHeight
			c.getContext('2d')!.drawImage(video, 0, 0)
			img.src = c.toDataURL()
		}
		catch {
			// A frame from another origin can't be read: the card stays empty.
		}
		copies[i]!.replaceWith(img)
	}
	await Promise.all([
		...[...copy.querySelectorAll('img')].map(async (img) => {
			const src = img.getAttribute('src')
			if (src && !src.startsWith('data:')) img.setAttribute('src', await dataUrl(new URL(src, location.href).href))
			img.removeAttribute('srcset')
			img.removeAttribute('loading')
		}),
		...[...copy.querySelectorAll<HTMLElement>('[style*="url("]')].map(async (el) => {
			el.setAttribute('style', await inlineUrls(el.getAttribute('style')!, location.href))
		}),
	])
}

export interface CaptureOptions {
	/** The element's size in CSS px. */
	width: number
	height: number
	/** Image px per CSS px. */
	scale: number
	/** Where `root` sits on the page: its custom properties, font and color are carried over (the copy has no ancestors). */
	context: Element
	/** Changes the copy before it's drawn (privacy mode). */
	transform?: (copy: HTMLElement) => void
}

export async function captureElement(root: HTMLElement, o: CaptureOptions): Promise<Blob> {
	const copy = root.cloneNode(true) as HTMLElement
	const [css] = await Promise.all([pageCss(), prepareCopy(root, copy)])
	o.transform?.(copy)

	const wrapper = document.createElementNS(XHTML, 'div') as HTMLElement
	// The canvas's class for its variables and rules; none of the view's state classes (zoomed out, read-only).
	wrapper.className = 'jc-canvas'
	const cs = getComputedStyle(o.context)
	const carried = [...cs].filter(name => name.startsWith('--')).map(name => `${name}: ${cs.getPropertyValue(name)};`)
	for (const name of ['font-family', 'font-size', 'line-height', 'color', 'font-feature-settings', '-webkit-font-smoothing']) {
		carried.push(`${name}: ${cs.getPropertyValue(name)};`)
	}
	wrapper.setAttribute('style', `${carried.join(' ')} width: ${o.width}px; height: ${o.height}px; position: relative;`)
	wrapper.append(copy)

	const { width, height } = o
	const html = new XMLSerializer().serializeToString(wrapper)
	// The page's classes (a `dark` theme) on the image's root, where `:root` and `.dark` rules match.
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="${document.documentElement.className}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
		+ `<style><![CDATA[${css.replaceAll(']]>', ']]]]><![CDATA[>')}]]></style>`
		+ `<foreignObject x="0" y="0" width="${width}" height="${height}">${html}</foreignObject></svg>`

	const image = new Image()
	// A data URL, not a blob URL: Chromium marks a canvas tainted after drawing a `foreignObject` from a blob.
	image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
	await image.decode()
	const canvas = document.createElement('canvas')
	canvas.width = Math.round(width * o.scale)
	canvas.height = Math.round(height * o.scale)
	const ctx = canvas.getContext('2d')!
	ctx.scale(o.scale, o.scale)
	ctx.drawImage(image, 0, 0, width, height)
	return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The image is too large to draw'))), 'image/png'))
}

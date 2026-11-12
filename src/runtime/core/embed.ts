const ID = /^[\w-]+$/
const TIME = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/

/** YouTube's `t`/`start`: `90`, `90s` or `1h2m3s`, in seconds; 0 when absent or unreadable. */
function seconds(t: string | null): number {
	const m = TIME.exec(t ?? '')
	return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0
}

/**
 * The `src` for a link card's iframe: a YouTube video or an X/Twitter post as its embed, any other http(s) URL as
 * it is; `undefined` for anything else.
 */
export function embedUrl(url: string, options: { dark: boolean }): string | undefined {
	let u: URL
	try {
		u = new URL(url)
	}
	catch {
		return undefined
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
	const host = u.hostname.replace(/^(?:www|m|mobile)\./, '')
	const path = u.pathname.split('/').filter(Boolean)
	const video = host === 'youtu.be'
		? path[0]
		: host === 'youtube.com'
			? path[0] === 'watch' ? u.searchParams.get('v') : ['embed', 'v', 'shorts'].includes(path[0]!) ? path[1] : undefined
			: undefined
	if (video && ID.test(video)) {
		const start = seconds(u.searchParams.get('t') ?? u.searchParams.get('start'))
		return `https://www.youtube-nocookie.com/embed/${video}${start > 0 ? `?start=${start}` : ''}`
	}
	if ((host === 'twitter.com' || host === 'x.com') && path[1] === 'status' && /^\d+$/.test(path[2] ?? '')) {
		return `https://platform.twitter.com/embed/Tweet.html?dnt=true&theme=${options.dark ? 'dark' : 'light'}&id=${path[2]}`
	}
	return url
}

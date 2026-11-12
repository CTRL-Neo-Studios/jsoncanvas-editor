import { expect, it } from 'vitest'
import { embedUrl } from '../src/runtime/core'

const light = { dark: false }
const yt = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'

it('embeds YouTube videos without cookies, from the start time', () => {
	expect(embedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', light)).toBe(yt)
	expect(embedUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s', light)).toBe(`${yt}?start=3723`)
	expect(embedUrl('https://youtu.be/dQw4w9WgXcQ?t=90', light)).toBe(`${yt}?start=90`)
	expect(embedUrl('https://youtu.be/dQw4w9WgXcQ?t=90s', light)).toBe(`${yt}?start=90`)
	expect(embedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?start=30', light)).toBe(`${yt}?start=30`)
	expect(embedUrl('https://youtube.com/v/dQw4w9WgXcQ?t=0', light)).toBe(yt)
	expect(embedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ', light)).toBe(yt)
})

it('embeds X/Twitter posts in the current theme', () => {
	expect(embedUrl('https://twitter.com/jack/status/20', { dark: true }))
		.toBe('https://platform.twitter.com/embed/Tweet.html?dnt=true&theme=dark&id=20')
	expect(embedUrl('https://mobile.x.com/jack/status/123?s=20', light))
		.toBe('https://platform.twitter.com/embed/Tweet.html?dnt=true&theme=light&id=123')
})

it('keeps any other web URL as it is', () => {
	expect(embedUrl('https://Example.com/a?b=1', light)).toBe('https://Example.com/a?b=1')
	expect(embedUrl('https://www.youtube.com/', light)).toBe('https://www.youtube.com/')
	expect(embedUrl('https://x.com/jack', light)).toBe('https://x.com/jack')
})

it('refuses anything that is not an http(s) URL', () => {
	expect(embedUrl('javascript:alert(1)', light)).toBeUndefined()
	expect(embedUrl('ftp://example.com/file', light)).toBeUndefined()
	expect(embedUrl('not a url', light)).toBeUndefined()
})

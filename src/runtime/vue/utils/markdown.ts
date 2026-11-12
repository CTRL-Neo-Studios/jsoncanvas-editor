import { createSerializedMarkdownParser, defineComarkPlugin, type MarkdownDocument } from 'comark'
import alert from 'comark/plugins/alert'
import breaks from 'comark/plugins/breaks'
import frontmatter from 'comark/plugins/frontmatter'
import linkify from 'comark/plugins/linkify'
import taskList from 'comark/plugins/task-list'

interface InlineState {
	src: string
	pos: number
	push: (type: string, tag: string, nesting: number) => { attrs: Array<[string, string]> | null, content: string }
}
interface MarkdownIt {
	inline: { ruler: { before: (name: string, rule: string, fn: (state: InlineState, silent: boolean) => boolean) => void } }
}

/** `[[target]]` and `[[target|text]]` as links with `data-wikilink`; `![[embeds]]` stay text. */
const wikilinks = defineComarkPlugin(() => ({
	name: 'wikilinks',
	markdownItPlugins: [(md: MarkdownIt) => {
		md.inline.ruler.before('link', 'wikilink', (state, silent) => {
			const { src, pos } = state
			if (!src.startsWith('[[', pos) || src[pos - 1] === '!') return false
			const end = src.indexOf(']]', pos + 2)
			const inner = end < 0 ? '' : src.slice(pos + 2, end)
			if (!inner.trim() || inner.includes('\n')) return false
			if (!silent) {
				const bar = inner.indexOf('|')
				const target = (bar < 0 ? inner : inner.slice(0, bar)).trim()
				state.push('link_open', 'a', 1).attrs = [['href', target], ['data-wikilink', target]]
				// As Obsidian shows it: the alias, or `Note > Heading`.
				state.push('text', '', 0).content = bar < 0 ? target.replace(/^#/, '').replaceAll('#', ' > ') : inner.slice(bar + 1)
				state.push('link_close', 'a', -1)
			}
			state.pos = end + 2
			return true
		})
	}],
}))

// Obsidian's flavour, without raw HTML (it would be rendered unsanitized) or Comark's component syntax.
const parse = createSerializedMarkdownParser({
	registerDefaultPlugins: false,
	plugins: [linkify(), frontmatter(), alert(), taskList(), breaks(), wikilinks()],
})

const cache = new Map<string, Promise<MarkdownDocument>>()
const CACHE_SIZE = 500

/** `text` parsed, cached, so cards scrolled back into view render at once. */
export function parseMarkdown(text: string): Promise<MarkdownDocument> {
	let doc = cache.get(text)
	if (!doc) {
		doc = parse(text)
		if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
		cache.set(text, doc)
	}
	return doc
}

import { describe, expect, it } from 'vitest'
import { fileKind, markdownSection, markdownSectionRange } from '../src/runtime/core'

it('fileKind groups files by extension, as Obsidian does', () => {
	expect(fileKind('Notes/a.md')).toBe('markdown')
	expect(fileKind('pic.JPEG')).toBe('image')
	expect(fileKind('clip.mkv')).toBe('video')
	expect(fileKind('voice.3gp')).toBe('audio')
	expect(fileKind('paper.pdf')).toBe('pdf')
	expect(fileKind('board.canvas')).toBe('canvas')
	expect(fileKind('Untitled.base')).toBe('other')
	expect(fileKind('README')).toBe('other')
})

describe('markdownSection', () => {
	const doc = [
		'---',
		'title: x',
		'# not a heading',
		'---',
		'# Intro',
		'Hello',
		'',
		'## Setup',
		'Install it.',
		'```js',
		'# not a heading',
		'```',
		'### Details',
		'Deep.',
		'## Usage',
		'Use it. ^para',
		'',
		'- one',
		'- two ^item',
		'',
		'| a | b |',
		'|---|---|',
		'| 1 | 2 |',
		'',
		'^table',
		'# Other',
		'Rest',
		'more ^multi',
	].join('\n')

	it('is the whole text for no subpath', () => {
		expect(markdownSection(doc, '')).toBe(doc)
		expect(markdownSection(doc, '#')).toBe(doc)
	})

	it('runs from a heading to the next one of the same or higher level, past fenced code', () => {
		expect(markdownSection(doc, '#Setup')).toBe('## Setup\nInstall it.\n```js\n# not a heading\n```\n### Details\nDeep.')
		expect(markdownSection(doc, '#Other')).toBe('# Other\nRest\nmore ^multi')
	})

	it('follows a heading path, case-insensitively', () => {
		expect(markdownSection(doc, '#intro#SETUP#Details')).toBe('### Details\nDeep.')
		expect(markdownSection(doc, '#Setup#Usage')).toBeUndefined()
	})

	it('finds a block by id, without the marker', () => {
		expect(markdownSection(doc, '#^para')).toBe('Use it.')
		expect(markdownSection(doc, '#^multi')).toBe('Rest\nmore')
		expect(markdownSection(doc, '#^item')).toBe('- two')
	})

	it('takes an id on its own line for the block before it', () => {
		expect(markdownSection(doc, '#^table')).toBe('| a | b |\n|---|---|\n| 1 | 2 |')
	})

	it('is undefined when there is no such heading or block, ignoring frontmatter and code', () => {
		expect(markdownSection(doc, '#Missing')).toBeUndefined()
		expect(markdownSection(doc, '#^missing')).toBeUndefined()
		expect(markdownSection(doc, '#not a heading')).toBeUndefined()
	})

	it('has a range in the text that slices to the section, past frontmatter and with CRLF line endings', () => {
		const crlf = doc.replaceAll('\n', '\r\n')
		for (const text of [doc, crlf]) {
			for (const subpath of ['', '#Setup', '#intro#SETUP#Details', '#Other', '#^para', '#^multi', '#^item', '#^table']) {
				const range = markdownSectionRange(text, subpath)!
				expect(text.slice(range.from, range.to).replaceAll('\r\n', '\n'), subpath).toBe(markdownSection(doc, subpath))
			}
		}
		// A block's range stops before its id, so the id survives an edit.
		const { from, to } = markdownSectionRange(doc, '#^para')!
		expect(doc.slice(0, from) + 'Edited.' + doc.slice(to)).toBe(doc.replace('Use it. ^para', 'Edited. ^para'))
		expect(markdownSectionRange(doc, '#Missing')).toBeUndefined()
		expect(markdownSectionRange(doc, '#^missing')).toBeUndefined()
	})
})

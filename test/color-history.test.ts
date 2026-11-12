import { describe, expect, it } from 'vitest'
import { CanvasHistory, isLightColor, newId, normalizeColor, parseHexColor } from '../src/runtime/core'

describe('colors', () => {
	it('turns "r, g, b" into hex and leaves presets and hex alone', () => {
		expect(normalizeColor(' 255, 0 ,10 ')).toBe('#ff000a')
		expect(normalizeColor('3')).toBe('3')
		expect(normalizeColor('#ABC')).toBe('#ABC')
	})

	it('parses short and long hex, ignoring alpha', () => {
		expect(parseHexColor('#abc')).toEqual([170, 187, 204])
		expect(parseHexColor('#11223344')).toEqual([17, 34, 51])
		expect(parseHexColor('red')).toBeUndefined()
	})

	it('tells light backgrounds from dark ones', () => {
		expect(isLightColor([255, 204, 0])).toBe(true) // yellow
		expect(isLightColor([203, 48, 224])).toBe(false) // purple
	})
})

describe('CanvasHistory', () => {
	it('keeps the last `limit` states', () => {
		const h = new CanvasHistory<number>(100)
		for (let i = 0; i <= 100; i++) h.push(i)
		let last
		while (h.canUndo) last = h.undo()
		expect(last).toBe(1)
	})

	it('drops the redo side on a new state, and replace adds no step', () => {
		const h = new CanvasHistory<string>()
		h.push('a')
		h.push('b')
		expect(h.undo()).toBe('a')
		h.push('c')
		expect(h.canRedo).toBe(false)
		h.replace('c2')
		expect(h.undo()).toBe('a')
		expect(h.redo()).toBe('c2')
		expect(h.redo()).toBeUndefined()
	})
})

it('newId makes 16 lowercase hex characters', () => {
	expect(newId()).toMatch(/^[\da-f]{16}$/)
})

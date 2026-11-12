/** Undo/redo over whole snapshots. The caller pushes copies; entries are returned as they were pushed. */
export class CanvasHistory<T> {
	private entries: T[] = []
	private index = -1

	constructor(readonly limit = 100) {}

	get canUndo(): boolean {
		return this.index > 0
	}

	get canRedo(): boolean {
		return this.index < this.entries.length - 1
	}

	/** Records a new state, dropping anything that could be redone and, past `limit`, the oldest state. */
	push(state: T): void {
		this.entries.length = this.index + 1
		this.entries.push(state)
		if (this.entries.length > this.limit) this.entries.shift()
		this.index = this.entries.length - 1
	}

	/** Replaces the current state without adding an undo step (e.g. a media node fitting its image on load). */
	replace(state: T): void {
		if (this.index < 0) this.push(state)
		else this.entries[this.index] = state
	}

	undo(): T | undefined {
		return this.canUndo ? this.entries[--this.index] : undefined
	}

	redo(): T | undefined {
		return this.canRedo ? this.entries[++this.index] : undefined
	}

	clear(): void {
		this.entries = []
		this.index = -1
	}
}

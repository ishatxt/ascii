export class EditHistory {
  #undoStack = [];
  #redoStack = [];
  #limit;

  constructor({ limit = 80 } = {}) {
    this.#limit = Math.max(1, limit);
  }

  record(changes) {
    if (!Array.isArray(changes) || changes.length === 0) return false;
    this.#undoStack.push(changes);
    if (this.#undoStack.length > this.#limit) this.#undoStack.shift();
    this.#redoStack.length = 0;
    return true;
  }

  undo() {
    const entry = this.#undoStack.pop();
    if (!entry) return null;
    this.#redoStack.push(entry);
    return entry;
  }

  redo() {
    const entry = this.#redoStack.pop();
    if (!entry) return null;
    this.#undoStack.push(entry);
    return entry;
  }

  clear() {
    this.#undoStack.length = 0;
    this.#redoStack.length = 0;
  }

  get canUndo() {
    return this.#undoStack.length > 0;
  }

  get canRedo() {
    return this.#redoStack.length > 0;
  }

  get undoDepth() {
    return this.#undoStack.length;
  }

  get redoDepth() {
    return this.#redoStack.length;
  }
}

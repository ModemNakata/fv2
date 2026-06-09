import { anyAbortSignal } from "@videojs/utils/events";
import { generateId } from "@videojs/utils/string";
//#region src/core/tasks/task.ts
/**
* Generic reusable task that wraps an async run function.
*
* Owns its own AbortController so it can always be aborted independently.
* Optionally composes an external AbortSignal so that a parent's cancellation
* propagates into the task's work without requiring the caller to track the
* task separately.
*
* Ordering guarantee: `value` is written before `status` transitions to `'done'`;
* `error` is written before `status` transitions to `'error'`. Any reader
* observing `status === 'done'` is guaranteed `value` is already present.
*/
var Task = class {
	id;
	#runFn;
	#abortController = new AbortController();
	#signal;
	#status = "pending";
	#value = void 0;
	#error = void 0;
	constructor(runFn, config) {
		this.#runFn = runFn;
		const rawId = config?.id;
		this.id = typeof rawId === "function" ? rawId() : rawId ?? generateId();
		this.#signal = config?.signal ? anyAbortSignal([this.#abortController.signal, config.signal]) : this.#abortController.signal;
	}
	get status() {
		return this.#status;
	}
	get value() {
		return this.#value;
	}
	get error() {
		return this.#error;
	}
	async run() {
		this.#status = "running";
		try {
			const result = await this.#runFn(this.#signal);
			this.#value = result;
			this.#status = "done";
			return result;
		} catch (e) {
			this.#error = e;
			this.#status = "error";
			throw e;
		}
	}
	abort() {
		this.#abortController.abort();
	}
};
/**
* Runs tasks concurrently, deduplicated by task id.
*
* If a task with a given id is already in flight, subsequent schedule() calls
* for that id are silently ignored until the first completes. Tasks are stored
* so abortAll() can cancel any in-flight work (e.g. on engine cleanup).
*/
var ConcurrentRunner = class {
	#pending = /* @__PURE__ */ new Map();
	#settled = Promise.resolve();
	#resolveSettled = null;
	#destroyed = false;
	schedule(task) {
		if (this.#destroyed) return Promise.resolve();
		const existing = this.#pending.get(task.id);
		if (existing) return existing.promise;
		if (this.#pending.size === 0) this.#settled = new Promise((resolve) => {
			this.#resolveSettled = resolve;
		});
		const promise = task.run();
		promise.catch(() => {});
		const cleanup = () => {
			this.#pending.delete(task.id);
			if (this.#pending.size === 0) {
				this.#resolveSettled?.();
				this.#resolveSettled = null;
			}
		};
		promise.then(cleanup, cleanup);
		this.#pending.set(task.id, {
			task,
			promise
		});
		return promise;
	}
	/**
	* Registers a callback to fire when all currently in-flight tasks settle.
	* If the runner is already idle, the callback is never called. If abortAll()
	* is called before the batch settles, the callback is superseded and silently
	* dropped — no stale callbacks, no generation token required by the caller.
	*/
	whenSettled(callback) {
		if (this.#pending.size === 0) return;
		const captured = this.#settled;
		captured.then(() => {
			if (this.#settled !== captured) return;
			callback();
		}, () => {});
	}
	abortAll() {
		for (const { task } of this.#pending.values()) task.abort();
		this.#pending.clear();
		this.#resolveSettled?.();
		this.#resolveSettled = null;
		this.#settled = Promise.resolve();
	}
	destroy() {
		this.#destroyed = true;
		this.abortAll();
	}
};
/**
* Runs tasks one at a time in submission order.
*
* Each schedule() call returns a Promise that resolves or rejects with the
* task's result when it is eventually executed. Tasks wait in queue until the
* prior task completes.
*
* Serialization is achieved by chaining each task's run() onto the tail of a
* shared promise chain — no explicit queue or drain loop needed.
*
* abortAll() aborts all pending (not yet started) tasks and the currently
* in-flight task. Pending tasks still run briefly but receive an aborted
* signal and are expected to exit early.
*/
var SerialRunner = class {
	#chain = Promise.resolve();
	#pending = /* @__PURE__ */ new Set();
	#current = null;
	#destroyed = false;
	schedule(task) {
		if (this.#destroyed) return Promise.resolve();
		const t = task;
		this.#pending.add(t);
		const result = this.#chain.then(() => {
			this.#pending.delete(t);
			this.#current = t;
			return task.run();
		}).finally(() => {
			this.#current = null;
		});
		this.#chain = result.then(() => {}, () => {});
		return result;
	}
	/**
	* A promise that resolves when all currently-scheduled tasks have settled.
	* Use the reference as a generation token: capture it after scheduling a
	* batch, then check identity in the resolution callback to detect whether
	* a subsequent abortAll() + new batch has superseded this one.
	*/
	get settled() {
		return this.#chain;
	}
	/**
	* Registers a callback to fire when all currently-pending tasks settle.
	* If the runner is already idle (no pending or running tasks), the callback
	* is never called. If new tasks are scheduled before the current batch
	* settles, the callback is superseded and silently dropped — no stale
	* callbacks, no generation token required by the caller.
	*/
	whenSettled(callback) {
		if (this.#pending.size === 0 && this.#current === null) return;
		const currentChain = this.#chain;
		currentChain.then(() => {
			if (this.#chain !== currentChain) return;
			callback();
		}, () => {});
	}
	/** Aborts and clears queued tasks without touching the in-flight task. */
	abortPending() {
		for (const task of this.#pending) task.abort();
		this.#pending.clear();
	}
	abortAll() {
		this.abortPending();
		this.#current?.abort();
	}
	destroy() {
		this.#destroyed = true;
		this.abortAll();
	}
};
//#endregion
export { ConcurrentRunner, SerialRunner, Task };

//# sourceMappingURL=task.js.map
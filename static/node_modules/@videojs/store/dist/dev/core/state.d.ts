//#region src/core/state.d.ts
type StateChange = () => void;
type UnknownState = Record<string, unknown>;
interface SubscribeOptions {
  signal?: AbortSignal;
}
interface State<T> {
  readonly current: Readonly<T>;
  subscribe(callback: StateChange, options?: SubscribeOptions): () => void;
}
interface WritableState<T> extends State<T> {
  patch: (partial: Partial<T>) => void;
}
declare function flush(): void;
declare function createState<T>(initial: T): WritableState<T>;
declare function isState(value: unknown): value is State<object>;
//#endregion
export { State, StateChange, SubscribeOptions, UnknownState, WritableState, createState, flush, isState };
//# sourceMappingURL=state.d.ts.map
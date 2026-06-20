//#region src/core/abort-controller-registry.d.ts
type SignalKey = PropertyKey;
declare class AbortControllerRegistry {
  #private;
  /** The attach-scoped signal. Aborts on detach or reattach. */
  get base(): AbortSignal;
  /** Clears all keyed signals, leaving base intact. */
  clear(): void;
  /** Resets base and clears all keyed signals. */
  reset(): void;
  /** Creates a new signal for the key, superseding any previous signal. */
  supersede(key: SignalKey): AbortSignal;
}
//#endregion
export { AbortControllerRegistry, SignalKey };
//# sourceMappingURL=abort-controller-registry.d.ts.map
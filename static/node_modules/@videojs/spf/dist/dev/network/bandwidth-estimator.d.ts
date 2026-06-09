//#region src/network/bandwidth-estimator.d.ts
/**
 * Dual EWMA Bandwidth Estimator
 *
 * Estimates available bandwidth using two EWMA calculations with different
 * half-lives, taking the minimum of both. This approach (from Shaka Player):
 *
 * - **Fast EWMA** (2s half-life): Reacts quickly to bandwidth drops
 * - **Slow EWMA** (5s half-life): Provides stability during fluctuations
 * - **min(fast, slow)**: Adapts down quickly, up slowly
 *
 * This naturally provides asymmetric behavior needed for good QoE:
 * avoiding stalls (quick downgrade) while preventing oscillation (slow upgrade).
 */
/**
 * Bandwidth estimator state.
 *
 * This state structure will be managed by O1 (State Container).
 * Functions in this module operate on this state immutably.
 */
interface BandwidthState {
  /** Fast-moving EWMA estimate (raw, uncorrected). */
  fastEstimate: number;
  /** Total weight accumulated in fast EWMA. */
  fastTotalWeight: number;
  /** Slow-moving EWMA estimate (raw, uncorrected). */
  slowEstimate: number;
  /** Total weight accumulated in slow EWMA. */
  slowTotalWeight: number;
  /** Total bytes sampled across all valid samples. */
  bytesSampled: number;
}
/**
 * Configuration for bandwidth estimation.
 */
interface BandwidthConfig {
  /** Half-life for fast EWMA in seconds. */
  fastHalfLife: number;
  /** Half-life for slow EWMA in seconds. */
  slowHalfLife: number;
  /** Minimum total bytes before trusting the estimate. */
  minTotalBytes: number;
  /** Minimum bytes per sample to count (filters TTFB-dominated samples). */
  minBytes: number;
  /** Minimum sample duration in ms (filters cached responses). */
  minDuration: number;
}
//#endregion
export { BandwidthConfig, BandwidthState };
//# sourceMappingURL=bandwidth-estimator.d.ts.map
import { applyZeroFactor, calculateEwma } from "./ewma.js";
//#region src/network/bandwidth-estimator.ts
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
* Default bandwidth estimator configuration.
*
* Values match Shaka Player defaults based on experimentation.
*/
const DEFAULT_BANDWIDTH_CONFIG = {
	fastHalfLife: 2,
	slowHalfLife: 5,
	minTotalBytes: 128e3,
	minBytes: 16e3,
	minDuration: 5
};
/**
* Add a bandwidth sample from a segment download.
*
* Samples are filtered based on:
* - Minimum bytes (filters TTFB-dominated small segments)
* - Minimum duration (filters cached responses)
*
* Valid samples update both fast and slow EWMA estimates.
*
* @param state - Current estimator state
* @param durationMs - Download duration in milliseconds
* @param numBytes - Number of bytes downloaded
* @param config - Optional estimator configuration (uses defaults if not provided)
* @returns New estimator state with sample incorporated (or unchanged if filtered)
*
* @example
* let state = { fastEstimate: 0, fastTotalWeight: 0, ... };
* // Sample: 1MB in 1 second
* state = sampleBandwidth(state, 1000, 1_000_000);
*/
function sampleBandwidth(state, durationMs, numBytes, config = DEFAULT_BANDWIDTH_CONFIG) {
	const updatedBytesSampled = state.bytesSampled + numBytes;
	if (numBytes < config.minBytes) return {
		...state,
		bytesSampled: updatedBytesSampled
	};
	if (durationMs < config.minDuration) return {
		...state,
		bytesSampled: updatedBytesSampled
	};
	const bandwidth = 8e3 * numBytes / durationMs;
	const weight = durationMs / 1e3;
	return {
		fastEstimate: calculateEwma(state.fastEstimate, bandwidth, weight, config.fastHalfLife),
		fastTotalWeight: state.fastTotalWeight + weight,
		slowEstimate: calculateEwma(state.slowEstimate, bandwidth, weight, config.slowHalfLife),
		slowTotalWeight: state.slowTotalWeight + weight,
		bytesSampled: updatedBytesSampled
	};
}
/**
* Get the current bandwidth estimate.
*
* Returns the **minimum** of the fast and slow EWMA estimates.
* This provides the key asymmetric behavior:
* - When bandwidth drops, fast EWMA reacts first and dominates (quick adaptation)
* - When bandwidth rises, slow EWMA lags behind and dominates (slow adaptation)
*
* Uses default estimate until enough data has been sampled — and when no
* estimator state exists at all (`state === undefined`).
*
* @param state - Current estimator state, or `undefined` before any samples have been collected
* @param defaultEstimate - Fallback estimate before sufficient samples (bps)
* @param config - Optional estimator configuration (uses defaults if not provided)
* @returns Bandwidth estimate in bits per second
*
* @example
* const estimate = getBandwidthEstimate(state, 5_000_000); // 5 Mbps default
*/
function getBandwidthEstimate(state, defaultEstimate, config = DEFAULT_BANDWIDTH_CONFIG) {
	if (!state || state.bytesSampled < config.minTotalBytes) return defaultEstimate;
	const fastEstimate = applyZeroFactor(state.fastEstimate, state.fastTotalWeight, config.fastHalfLife);
	const slowEstimate = applyZeroFactor(state.slowEstimate, state.slowTotalWeight, config.slowHalfLife);
	return Math.min(fastEstimate, slowEstimate);
}
//#endregion
export { DEFAULT_BANDWIDTH_CONFIG, getBandwidthEstimate, sampleBandwidth };

//# sourceMappingURL=bandwidth-estimator.js.map
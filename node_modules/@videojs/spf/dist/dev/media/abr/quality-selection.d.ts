//#region src/media/abr/quality-selection.d.ts
/**
 * Quality selection configuration.
 */
interface QualityConfig {
  /**
   * Safety margin (0-1).
   * To select a track, need: currentBandwidth >= track.bandwidth / safetyMargin.
   * Default 0.85 means track must use ≤85% of available bandwidth (15% headroom).
   */
  safetyMargin: number;
  /**
   * Upgrade hysteresis ratio (>= 1). When `currentTrack` is supplied, an
   * upgrade is applied only if `optimal.bandwidth >= currentTrack.bandwidth * upgradeMargin`.
   * Downgrades are always applied. Default 1.15 means optimal must clear
   * the current bandwidth by at least 15% to trigger an upgrade.
   */
  upgradeMargin: number;
}
//#endregion
export { QualityConfig };
//# sourceMappingURL=quality-selection.d.ts.map
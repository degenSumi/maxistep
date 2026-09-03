/**
 * Gates, not targets. `pnpm eval` exits non-zero when a suite drops below its
 * threshold, so a routing regression fails CI rather than being noticed later.
 *
 * Grounding sits at 1.0 on purpose: one invented order number is one too many.
 */
export const THRESHOLDS: Record<string, number> = {
  routing: 0.85,
  behaviour: 0.9,
  failure: 1.0,
};

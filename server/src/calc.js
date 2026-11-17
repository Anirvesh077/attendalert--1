// All the attendance maths lives here so it can be tested without a database.
// Everything uses integer comparisons on purpose: 12/16 must be *exactly* 75%,
// and floating point has a habit of disagreeing about that.

export const THRESHOLD = 75;
export const WARNING_FLOOR = 65;

const RANK = { critical: 0, warning: 1, safe: 2, none: 3 };

export function tierFor(attended, held) {
  if (held <= 0) return 'none';
  if (attended * 100 >= THRESHOLD * held) return 'safe';
  if (attended * 100 >= WARNING_FLOOR * held) return 'warning';
  return 'critical';
}

// Brief's formula: ceil((0.75 * total - attended) / 0.25).
// Dividing by 0.25 is the same as multiplying by 4, so it collapses to 3*total - 4*attended,
// which is always a whole number. Each class attended adds 1 to both attended and total.
export function classesNeeded(attended, held) {
  return Math.max(0, 3 * held - 4 * attended);
}

// How many classes can be skipped from here and still stay at 75% or better.
export function classesCanSkip(attended, held) {
  if (4 * attended < 3 * held) return 0;
  return Math.floor((4 * attended - 3 * held) / 3);
}

export function summarise(attended, held) {
  const pct = held > 0 ? Math.round((attended / held) * 10000) / 100 : null;
  return {
    attended,
    held,
    pct,
    tier: tierFor(attended, held),
    needed: classesNeeded(attended, held),
    canSkip: classesCanSkip(attended, held),
  };
}

export function worstTier(tiers) {
  const real = tiers.filter((t) => t !== 'none');
  if (real.length === 0) return 'none';
  return real.reduce((worst, t) => (RANK[t] < RANK[worst] ? t : worst));
}

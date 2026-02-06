/**
 * Pure functions for calculating Pulse signals
 */

export const SECONDS_IN_DAY = 86400;

/**
 * Calculate current streak in days
 * @param timestamps Descending sorted timestamps (latest first)
 * @param now Current timestamp in seconds
 */
export function calculateStreak(timestamps: number[], now: number = Date.now() / 1000): { count: number; startDate: number } {
  if (timestamps.length === 0) return { count: 0, startDate: 0 };

  // Normalize to start of day (UTC) to match "daily" logic
  // A streak is unbroken if there is at least one burn in consecutive 24h windows working backwards
  // However, simpler logic for "Daily Pulse":
  // Did they burn today? If yes, 1 + check yesterday.
  // If no, did they burn yesterday? If yes, 1 + check day before.
  // If no, streak is 0.

  const todayStart = Math.floor(now / SECONDS_IN_DAY) * SECONDS_IN_DAY;
  const yesterdayStart = todayStart - SECONDS_IN_DAY;

  // Group burns by day
  const burnDays = new Set(timestamps.map(t => Math.floor(t / SECONDS_IN_DAY) * SECONDS_IN_DAY));

  let currentDay = todayStart;
  let streak = 0;
  
  // If no burn today, check if streak is alive from yesterday
  if (!burnDays.has(currentDay)) {
    if (burnDays.has(yesterdayStart)) {
      currentDay = yesterdayStart;
    } else {
      // Streak broken
      return { count: 0, startDate: 0 };
    }
  }

  // Count backwards
  while (burnDays.has(currentDay)) {
    streak++;
    currentDay -= SECONDS_IN_DAY;
  }

  // Start date is the day *after* the last missing day (which is currentDay + 1 day)
  return { count: streak, startDate: currentDay + SECONDS_IN_DAY };
}

/**
 * Calculate Jitter (Standard Deviation of inter-burn intervals)
 * @param timestamps Ascending or Descending timestamps
 */
export function calculateJitter(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  
  const sorted = [...timestamps].sort((a, b) => a - b);
  const intervals: number[] = [];
  
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i] - sorted[i - 1]);
  }

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
  
  return Math.sqrt(variance);
}

/**
 * Calculate Burn Velocity (burns in last 7 days)
 * @param timestamps Array of timestamps
 * @param now Current time
 */
export function calculateVelocity(timestamps: number[], now: number = Date.now() / 1000): number {
  const cutoff = now - (7 * SECONDS_IN_DAY);
  return timestamps.filter(t => t >= cutoff).length;
}

/**
 * Calculate Hazard Rate
 * Probability of missing the NEXT burn given the current history.
 * P(miss | streak=N)
 * 
 * Simplified implementation:
 * Based on reliability score or variance.
 * If jitter is high, hazard is higher.
 * If current time > mean interval + 2*stddev, hazard is high.
 * 
 * Returns 0.0 to 1.0
 */
export function calculateHazardRate(
  timestamps: number[], 
  streak: number,
  now: number = Date.now() / 1000
): number {
  if (timestamps.length < 2) return 0.5; // Not enough data, uncertainty is high

  const jitter = calculateJitter(timestamps);
  const sorted = [...timestamps].sort((a, b) => a - b);
  const lastBurn = sorted[sorted.length - 1];
  
  // Mean interval
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i] - sorted[i - 1]);
  }
  const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  const timeSinceLast = now - lastBurn;

  // Survival function estimation (Weibull-like shape often used for failures)
  // Here we use a heuristic:
  // As timeSinceLast exceeds meanInterval, risk increases.
  // As timeSinceLast exceeds meanInterval + Jitter, risk spikes.
  
  if (timeSinceLast < meanInterval) {
    // Safe zone
    return Math.max(0, (timeSinceLast / meanInterval) * 0.2);
  } else {
    // Danger zone
    const excess = timeSinceLast - meanInterval;
    // Map excess/jitter to 0.2 -> 1.0
    // If excess is 2x jitter, we are at very high risk
    const risk = 0.2 + (excess / (jitter || 1)) * 0.4;
    return Math.min(0.99, risk);
  }
}

/**
 * Calculate Pearson Correlation between two time series
 * We bin them by day to correlate activity levels
 */
export function calculateCorrelation(
  timestampsA: number[], 
  timestampsB: number[],
  days: number = 30,
  now: number = Math.floor(Date.now() / 1000)
): number {
  if (timestampsA.length === 0 || timestampsB.length === 0) return 0;

  const start = now - (days * SECONDS_IN_DAY);
  
  const binsA = new Array(days + 1).fill(0);
  const binsB = new Array(days + 1).fill(0);

  // Fill bins
  const fill = (ts: number[], bins: number[]) => {
    ts.forEach(t => {
      if (t < start) return;
      const dayIndex = Math.floor((t - start) / SECONDS_IN_DAY);
      if (dayIndex >= 0 && dayIndex <= days) {
        bins[dayIndex]++;
      }
    });
  };

  fill(timestampsA, binsA);
  fill(timestampsB, binsB);

  // Pearson calculation
  const n = days + 1;
  const meanA = binsA.reduce((a, b) => a + b, 0) / n;
  const meanB = binsB.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < n; i++) {
    const diffA = binsA[i] - meanA;
    const diffB = binsB[i] - meanB;
    num += diffA * diffB;
    denA += diffA * diffA;
    denB += diffB * diffB;
  }

  if (denA === 0 || denB === 0) return 0;

  return num / (Math.sqrt(denA) * Math.sqrt(denB));
}

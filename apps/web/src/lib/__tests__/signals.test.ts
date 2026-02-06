import { calculateStreak, calculateJitter, calculateHazardRate, calculateVelocity, calculateCorrelation, SECONDS_IN_DAY } from '../signals';
import { describe, it, expect } from 'vitest'; // Using vitest as per package.json

describe('Signals', () => {
  const NOW = 1700000000; // Fixed reference time

  describe('calculateStreak', () => {
    it('should return 0 for empty history', () => {
      expect(calculateStreak([], NOW)).toEqual({ count: 0, startDate: 0 });
    });

    it('should count continuous days correctly', () => {
      const history = [
        NOW,
        NOW - SECONDS_IN_DAY,
        NOW - SECONDS_IN_DAY * 2
      ];
      expect(calculateStreak(history, NOW).count).toBe(3);
    });

    it('should break on missing day', () => {
      const history = [
        NOW,
        // Missed yesterday
        NOW - SECONDS_IN_DAY * 2
      ];
      // Streak is 1 (today only)
      expect(calculateStreak(history, NOW).count).toBe(1);
    });
    
    it('should allow yesterday to continue streak if today missed', () => {
      const history = [
        NOW - SECONDS_IN_DAY,
        NOW - SECONDS_IN_DAY * 2
      ];
      expect(calculateStreak(history, NOW).count).toBe(2);
    });
  });

  describe('calculateJitter', () => {
    it('should be 0 for perfectly regular intervals', () => {
      const history = [100, 200, 300, 400];
      expect(calculateJitter(history)).toBe(0);
    });

    it('should detect variance', () => {
      const history = [100, 210, 290, 405]; // Intervals: 110, 80, 115
      // Mean: 101.66
      // Variance calculation...
      expect(calculateJitter(history)).toBeGreaterThan(0);
    });
  });

  describe('calculateVelocity', () => {
    it('should count events in last 7 days', () => {
      const history = [
        NOW,
        NOW - SECONDS_IN_DAY * 3,
        NOW - SECONDS_IN_DAY * 6,
        NOW - SECONDS_IN_DAY * 8 // Old
      ];
      expect(calculateVelocity(history, NOW)).toBe(3);
    });
  });

  describe('calculateHazardRate', () => {
    it('should be low for regular heartbeat inside window', () => {
      const history = [NOW, NOW - 100, NOW - 200];
      // Last pulse just happened, hazard should be low
      expect(calculateHazardRate(history, 3, NOW)).toBeLessThan(0.3);
    });
    
    it('should be high when overdue', () => {
      const history = [NOW - 500, NOW - 600]; // Mean 100
      // 500s since last pulse, much > 100
      expect(calculateHazardRate(history, 2, NOW)).toBeGreaterThan(0.5);
    });
  });

  describe('calculateCorrelation', () => {
    it('should be 1 for identical series', () => {
      const history = [NOW, NOW - SECONDS_IN_DAY];
      expect(calculateCorrelation(history, history, 30, NOW)).toBeCloseTo(1);
      
      // Need variance
      const complexHistory = [NOW, NOW - SECONDS_IN_DAY * 5];
      expect(calculateCorrelation(complexHistory, complexHistory, 30, NOW)).toBeCloseTo(1);
    });

    it('should be -1 for opposite patterns (if possible)', () => {
      // Hard to simulate perfectly opposite with binary bins, but let's try
      // Agent A burns on day 1, 3. Agent B burns on day 2, 4.
      const A = [NOW - SECONDS_IN_DAY, NOW - SECONDS_IN_DAY * 3];
      const B = [NOW - SECONDS_IN_DAY * 2, NOW - SECONDS_IN_DAY * 4];
      // Correlation should be negative
      const corr = calculateCorrelation(A, B, 5, NOW);
      expect(corr).toBeLessThan(0);
    });
  });
});

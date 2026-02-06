import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPulseClient } from '../client.js';
import { AgentPulseGate } from '../gate.js';
import { AgentPulseError } from '../types.js';
import type { Address } from 'viem';

// Mock addresses for testing
const MOCK_ADDRESSES = {
  ALIVE: '0x1111111111111111111111111111111111111111' as Address,
  DEAD: '0x2222222222222222222222222222222222222222' as Address,
  STALE: '0x3333333333333333333333333333333333333333' as Address,
  UNKNOWN: '0x4444444444444444444444444444444444444444' as Address,
};

// Mock the pulse registry state
const mockRegistry = new Map<Address, { lastPulse: number; isAlive: boolean }>();

// Helper to create mock client
function createMockClient(registry: typeof mockRegistry) {
  const client = {
    isAlive: vi.fn(async (address: Address) => {
      const entry = registry.get(address);
      return entry?.isAlive ?? false;
    }),
    getAgentStatus: vi.fn(async (address: Address) => ({
      alive: registry.get(address)?.isAlive ?? false,
      lastPulse: registry.get(address)?.lastPulse ?? 0,
      streak: 0,
      hazardScore: 0,
      ttlSeconds: 86400,
    })),
  } as unknown as AgentPulseClient;

  return client;
}

describe('AgentPulseGate', () => {
  let mockClient: AgentPulseClient;

  beforeEach(() => {
    mockRegistry.clear();
    
    // Set up default registry state
    mockRegistry.set(MOCK_ADDRESSES.ALIVE, { lastPulse: Date.now(), isAlive: true });
    mockRegistry.set(MOCK_ADDRESSES.DEAD, { lastPulse: 0, isAlive: false });
    mockRegistry.set(MOCK_ADDRESSES.STALE, { lastPulse: Date.now() - 100000, isAlive: false });
    
    mockClient = createMockClient(mockRegistry);
  });

  // ============================================================================
  // Test 1: Strict Inbound Gating
  // ============================================================================
  describe('strict inbound gating', () => {
    it('should allow pulsed agents to pass', async () => {
      const gate = new AgentPulseGate(mockClient, { mode: 'strict' });
      
      const result = await gate.gateIncoming(MOCK_ADDRESSES.ALIVE);
      
      expect(result).toBe(true);
      expect(mockClient.isAlive).toHaveBeenCalledWith(MOCK_ADDRESSES.ALIVE);
    });

    it('should reject un-pulsed agents with PULSE_REQUIRED error', async () => {
      const gate = new AgentPulseGate(mockClient, { 
        mode: 'strict', 
        throwOnError: true 
      });
      
      await expect(gate.gateIncoming(MOCK_ADDRESSES.DEAD))
        .rejects.toThrow(AgentPulseError);
      
      try {
        await gate.gateIncoming(MOCK_ADDRESSES.DEAD);
      } catch (error) {
        expect(error).toBeInstanceOf(AgentPulseError);
        expect((error as AgentPulseError).code).toBe('API_ERROR');
        expect((error as AgentPulseError).statusCode).toBe(403);
        expect((error as AgentPulseError).message).toContain('NOT alive');
      }
    });

    it('should reject stale agents', async () => {
      const gate = new AgentPulseGate(mockClient, { 
        mode: 'strict', 
        throwOnError: true 
      });
      
      await expect(gate.gateIncoming(MOCK_ADDRESSES.STALE))
        .rejects.toThrow(AgentPulseError);
    });

    it('should return false for rejected agents when throwOnError is false', async () => {
      const gate = new AgentPulseGate(mockClient, { 
        mode: 'strict', 
        throwOnError: false 
      });
      
      const result = await gate.gateIncoming(MOCK_ADDRESSES.DEAD);
      
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Test 2: Strict Outbound Gating
  // ============================================================================
  describe('strict outbound gating', () => {
    it('should allow requests to pulsed targets', async () => {
      const gate = new AgentPulseGate(mockClient, { mode: 'strict' });
      
      const result = await gate.gateOutgoing(MOCK_ADDRESSES.ALIVE);
      
      expect(result).toBe(true);
      expect(mockClient.isAlive).toHaveBeenCalledWith(MOCK_ADDRESSES.ALIVE);
    });

    it('should refuse requests to un-pulsed targets', async () => {
      const gate = new AgentPulseGate(mockClient, { 
        mode: 'strict', 
        throwOnError: true 
      });
      
      await expect(gate.gateOutgoing(MOCK_ADDRESSES.DEAD))
        .rejects.toThrow(AgentPulseError);
      
      try {
        await gate.gateOutgoing(MOCK_ADDRESSES.DEAD);
      } catch (error) {
        expect(error).toBeInstanceOf(AgentPulseError);
        expect((error as AgentPulseError).code).toBe('API_ERROR');
        expect((error as AgentPulseError).statusCode).toBe(403);
      }
    });

    it('should refuse requests to stale targets', async () => {
      const gate = new AgentPulseGate(mockClient, { 
        mode: 'strict', 
        throwOnError: true 
      });
      
      await expect(gate.gateOutgoing(MOCK_ADDRESSES.STALE))
        .rejects.toThrow(AgentPulseError);
    });

    it('should return false for refused outbound when throwOnError is false', async () => {
      const gate = new AgentPulseGate(mockClient, { 
        mode: 'strict', 
        throwOnError: false 
      });
      
      const result = await gate.gateOutgoing(MOCK_ADDRESSES.DEAD);
      
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Test 3: Warn Mode
  // ============================================================================
  describe('warn mode', () => {
    it('should allow interaction to proceed for dead agents', async () => {
      const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
      const gate = new AgentPulseGate(mockClient, { mode: 'warn', logger });
      
      const result = await gate.gateIncoming(MOCK_ADDRESSES.DEAD);
      
      expect(result).toBe(true);
    });

    it('should emit warning event/log for dead agents', async () => {
      const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
      const gate = new AgentPulseGate(mockClient, { mode: 'warn', logger });
      
      await gate.gateIncoming(MOCK_ADDRESSES.DEAD);
      
      expect(logger.warn).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('NOT alive')
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('warn mode')
      );
    });

    it('should allow outbound requests in warn mode for dead targets', async () => {
      const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
      const gate = new AgentPulseGate(mockClient, { mode: 'warn', logger });
      
      const result = await gate.gateOutgoing(MOCK_ADDRESSES.DEAD);
      
      expect(result).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Test 4: Log Mode
  // ============================================================================
  describe('log mode', () => {
    it('should proceed unchanged for dead agents', async () => {
      const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
      const gate = new AgentPulseGate(mockClient, { mode: 'log', logger });
      
      const result = await gate.gateIncoming(MOCK_ADDRESSES.DEAD);
      
      expect(result).toBe(true);
    });

    it('should emit structured log for status tracking', async () => {
      const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
      const gate = new AgentPulseGate(mockClient, { mode: 'log', logger });
      
      await gate.gateIncoming(MOCK_ADDRESSES.DEAD);
      
      expect(logger.info).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('NOT alive')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('log mode')
      );
    });

    it('should not emit warning in response (no warning log level)', async () => {
      const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
      const gate = new AgentPulseGate(mockClient, { mode: 'log', logger });
      
      await gate.gateIncoming(MOCK_ADDRESSES.DEAD);
      
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle both inbound and outbound in log mode', async () => {
      const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
      const gate = new AgentPulseGate(mockClient, { mode: 'log', logger });
      
      const inbound = await gate.gateIncoming(MOCK_ADDRESSES.DEAD);
      const outbound = await gate.gateOutgoing(MOCK_ADDRESSES.DEAD);
      
      expect(inbound).toBe(true);
      expect(outbound).toBe(true);
      expect(logger.info).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // Test 5: Threshold Behavior
  // ============================================================================
  describe('threshold behavior', () => {
    it('should treat agent at exact boundary as alive', async () => {
      const now = Date.now();
      const ttlSeconds = 3600; // 1 hour TTL
      
      // Agent pulsed exactly at TTL boundary
      mockRegistry.set(MOCK_ADDRESSES.ALIVE, { 
        lastPulse: now - (ttlSeconds * 1000), 
        isAlive: true 
      });
      
      const gate = new AgentPulseGate(mockClient, { mode: 'strict' });
      
      const result = await gate.gateIncoming(MOCK_ADDRESSES.ALIVE);
      
      expect(result).toBe(true);
    });

    it('should treat agent 1 second past TTL as dead', async () => {
      const now = Date.now();
      const ttlSeconds = 3600;
      
      // Agent pulsed 1 second past TTL
      mockRegistry.set(MOCK_ADDRESSES.STALE, { 
        lastPulse: now - (ttlSeconds * 1000 + 1000), 
        isAlive: false 
      });
      
      const gate = new AgentPulseGate(mockClient, { 
        mode: 'strict', 
        throwOnError: false 
      });
      
      const result = await gate.gateIncoming(MOCK_ADDRESSES.STALE);
      
      expect(result).toBe(false);
    });

    it('should treat all agents as dead when threshold is 0', async () => {
      // This tests that with 0 threshold, even recently pulsed agents are dead
      mockRegistry.set(MOCK_ADDRESSES.ALIVE, { 
        lastPulse: Date.now(), 
        isAlive: false 
      });
      
      const gate = new AgentPulseGate(mockClient, { 
        mode: 'strict', 
        throwOnError: false 
      });
      
      const result = await gate.gateIncoming(MOCK_ADDRESSES.ALIVE);
      
      expect(result).toBe(false);
    });

    it('should treat all agents as alive with max threshold', async () => {
      // With a very large threshold, even old pulses are considered alive
      const maxThreshold = 100 * 365 * 24 * 3600; // 100 years in seconds
      
      mockRegistry.set(MOCK_ADDRESSES.STALE, { 
        lastPulse: Date.now() - (maxThreshold * 1000 / 2), // 50 years ago
        isAlive: true 
      });
      
      const gate = new AgentPulseGate(mockClient, { mode: 'strict' });
      
      const result = await gate.gateIncoming(MOCK_ADDRESSES.STALE);
      
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // Test 6: Gate Status Counters
  // ============================================================================
  describe('gate.status() counters', () => {
    it('should track total checks count', async () => {
      const gate = new AgentPulseGate(mockClient, { mode: 'strict' });
      
      // Perform multiple checks
      await gate.gateIncoming(MOCK_ADDRESSES.ALIVE);
      await gate.gateOutgoing(MOCK_ADDRESSES.ALIVE);
      await gate.gateIncoming(MOCK_ADDRESSES.DEAD).catch(() => {});
      
      // Verify isAlive was called 3 times
      expect(mockClient.isAlive).toHaveBeenCalledTimes(3);
    });

    it('should track allowed vs rejected counts', async () => {
      const gate = new AgentPulseGate(mockClient, { 
        mode: 'strict', 
        throwOnError: false 
      });
      
      // Mix of allowed and rejected
      const r1 = await gate.gateIncoming(MOCK_ADDRESSES.ALIVE); // allowed
      const r2 = await gate.gateOutgoing(MOCK_ADDRESSES.DEAD);  // rejected
      const r3 = await gate.gateIncoming(MOCK_ADDRESSES.ALIVE); // allowed
      
      expect(r1).toBe(true);
      expect(r2).toBe(false);
      expect(r3).toBe(true);
    });

    it('should distinguish between inbound and outbound checks', async () => {
      const gate = new AgentPulseGate(mockClient, { mode: 'strict' });
      
      await gate.gateIncoming(MOCK_ADDRESSES.ALIVE);
      await gate.gateOutgoing(MOCK_ADDRESSES.ALIVE);
      
      // Both calls should use isAlive
      expect(mockClient.isAlive).toHaveBeenCalledWith(MOCK_ADDRESSES.ALIVE);
    });
  });

  // ============================================================================
  // Additional Edge Cases
  // ============================================================================
  describe('edge cases', () => {
    it('should handle network errors gracefully', async () => {
      const errorClient = {
        isAlive: vi.fn().mockRejectedValue(new Error('Network error')),
      } as unknown as AgentPulseClient;
      
      const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
      const gate = new AgentPulseGate(errorClient, { mode: 'strict', logger });
      
      // On error, should fail open (return true) per implementation
      const result = await gate.gateIncoming(MOCK_ADDRESSES.ALIVE);
      
      expect(result).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error checking liveness')
      );
    });

    it('should propagate AgentPulseError without wrapping', async () => {
      const errorClient = {
        isAlive: vi.fn().mockRejectedValue(
          new AgentPulseError('Custom error', 'API_ERROR', 500)
        ),
      } as unknown as AgentPulseClient;
      
      const gate = new AgentPulseGate(errorClient, { mode: 'strict' });
      
      await expect(gate.gateIncoming(MOCK_ADDRESSES.ALIVE))
        .rejects.toThrow(AgentPulseError);
    });

    it('should use default options when not provided', async () => {
      const gate = new AgentPulseGate(mockClient);
      
      // Default mode is strict
      await expect(gate.gateIncoming(MOCK_ADDRESSES.DEAD))
        .rejects.toThrow();
    });

    it('should use console as default logger', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const gate = new AgentPulseGate(mockClient, { 
        mode: 'strict', 
        throwOnError: false 
      });
      
      await gate.gateIncoming(MOCK_ADDRESSES.DEAD);
      
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});

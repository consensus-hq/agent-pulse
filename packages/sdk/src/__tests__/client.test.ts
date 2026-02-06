import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPulse } from '../index.js';
import { AgentPulseClient } from '../client.js';
import { AgentPulseGate } from '../gate.js';
import { AgentPulseError } from '../types.js';

// Mock fetch for API calls
global.fetch = vi.fn();

describe('AgentPulse SDK', () => {
  const mockConfig = {
    wallet: {
      address: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      privateKey: '0x123' as `0x${string}`
    },
    x402: {
      serverWalletAddress: '0x9876543210987654321098765432109876543210' as `0x${string}`
    }
  };

  let pulse: AgentPulse;

  beforeEach(() => {
    vi.clearAllMocks();
    pulse = new AgentPulse(mockConfig);
  });

  describe('Core Functionality', () => {
    it('should initialize with config', () => {
      expect(pulse).toBeDefined();
      expect(pulse.getClient()).toBeInstanceOf(AgentPulseClient);
    });

    it('should create a gate', () => {
      const gate = pulse.createGate();
      expect(gate).toBeInstanceOf(AgentPulseGate);
    });
  });

  describe('Gating', () => {
    it('should allow alive agents in strict mode', async () => {
      const gate = pulse.createGate({ mode: 'strict' });
      
      // Mock isAlive to return true
      vi.spyOn(pulse.getClient(), 'isAlive').mockResolvedValue(true);
      
      const allowed = await gate.gateIncoming('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
      expect(allowed).toBe(true);
    });

    it('should reject dead agents in strict mode', async () => {
      const gate = pulse.createGate({ mode: 'strict', throwOnError: false });
      
      // Mock isAlive to return false
      vi.spyOn(pulse.getClient(), 'isAlive').mockResolvedValue(false);
      
      const allowed = await gate.gateIncoming('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
      expect(allowed).toBe(false);
    });

    it('should throw error for dead agents in strict mode with throwOnError', async () => {
      const gate = pulse.createGate({ mode: 'strict', throwOnError: true });
      
      vi.spyOn(pulse.getClient(), 'isAlive').mockResolvedValue(false);
      
      await expect(gate.gateIncoming('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'))
        .rejects.toThrow(AgentPulseError);
    });

    it('should allow dead agents in warn mode', async () => {
      const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
      const gate = pulse.createGate({ mode: 'warn', logger });
      
      vi.spyOn(pulse.getClient(), 'isAlive').mockResolvedValue(false);
      
      const allowed = await gate.gateIncoming('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
      expect(allowed).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filterAlive, isAgentAlive, getRegistryTTL, type FilterOptions } from '../index.js';
import type { Address } from 'viem';

// Mock viem
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(),
    http: vi.fn(() => 'mock-transport'),
  };
});

import { createPublicClient } from 'viem';

const TEST_OPTIONS: FilterOptions = {
  threshold: 3600,
  registryAddress: '0xe61C615743A02983A46aFF66Db035297e8a43846',
  rpcUrl: 'https://sepolia.base.org',
};

describe('filterAlive', () => {
  let mockReadContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReadContract = vi.fn();
    vi.mocked(createPublicClient).mockReturnValue({
      readContract: mockReadContract,
    } as unknown as ReturnType<typeof createPublicClient>);
  });

  it('should filter alive agents within threshold', async () => {
    const now = Math.floor(Date.now() / 1000);
    const addresses: Address[] = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
    ];

    // Mock responses: [alive, lastPulseAt, streak, hazardScore]
    mockReadContract
      .mockResolvedValueOnce([true, BigInt(now - 100), BigInt(5), BigInt(0)])  // Alive, recent
      .mockResolvedValueOnce([true, BigInt(now - 4000), BigInt(3), BigInt(1)]) // Alive, old
      .mockResolvedValueOnce([false, BigInt(now - 50), BigInt(0), BigInt(0)]); // Dead

    const result = await filterAlive(addresses, TEST_OPTIONS);

    expect(result.alive).toHaveLength(1);
    expect(result.alive[0]).toBe(addresses[0]);
    expect(result.details).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it('should return empty array for no agents', async () => {
    const result = await filterAlive([], TEST_OPTIONS);
    
    expect(result.alive).toHaveLength(0);
    expect(result.details).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle invalid addresses', async () => {
    const addresses = [
      '0x1111111111111111111111111111111111111111',
      'invalid-address',
      '0xnot-hex',
    ] as Address[];

    mockReadContract.mockImplementation(async (params: unknown) => {
      const args = (params as { args: [Address] }).args;
      if (args[0] === '0x1111111111111111111111111111111111111111') {
        const now = Math.floor(Date.now() / 1000);
        return [true, BigInt(now - 100), BigInt(1), BigInt(0)];
      }
      throw new Error('Unexpected address');
    });

    const result = await filterAlive(addresses, TEST_OPTIONS);

    expect(result.alive).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].reason).toContain('Invalid address');
  });

  it('should handle contract call errors gracefully', async () => {
    const addresses: Address[] = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ];

    mockReadContract.mockImplementation(async (params: unknown) => {
      const args = (params as { args: [Address] }).args;
      if (args[0] === '0x1111111111111111111111111111111111111111') {
        throw new Error('Contract call failed');
      }
      const now = Math.floor(Date.now() / 1000);
      return [true, BigInt(now - 100), BigInt(1), BigInt(0)];
    });

    const result = await filterAlive(addresses, TEST_OPTIONS);

    expect(result.alive).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toContain('Contract call failed');
  });

  it('should use provided timestamp for filtering', async () => {
    const now = Math.floor(Date.now() / 1000);
    const addresses: Address[] = ['0x1111111111111111111111111111111111111111'];

    mockReadContract.mockResolvedValueOnce([true, BigInt(now - 1800), BigInt(1), BigInt(0)]);

    const result = await filterAlive(addresses, { ...TEST_OPTIONS, threshold: 3600 });

    expect(result.alive).toHaveLength(1);
    expect(result.timestamp).toBeGreaterThan(1700000000); // Sanity check
  });

  it('should filter agents at exact threshold boundary', async () => {
    const now = Math.floor(Date.now() / 1000);
    const addresses: Address[] = [
      '0x1111111111111111111111111111111111111111', // exactly at threshold
      '0x2222222222222222222222222222222222222222', // just inside
      '0x3333333333333333333333333333333333333333', // just outside
    ];

    mockReadContract
      .mockResolvedValueOnce([true, BigInt(now - 3600), BigInt(1), BigInt(0)])
      .mockResolvedValueOnce([true, BigInt(now - 3599), BigInt(1), BigInt(0)])
      .mockResolvedValueOnce([true, BigInt(now - 3601), BigInt(1), BigInt(0)]);

    const result = await filterAlive(addresses, TEST_OPTIONS);

    // Should include agent at exactly 3600s and within, exclude outside
    expect(result.alive).toContain(addresses[0]);
    expect(result.alive).toContain(addresses[1]);
    expect(result.alive).not.toContain(addresses[2]);
  });

  it('should batch call contract for all valid addresses', async () => {
    const addresses: Address[] = [
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
    ];

    mockReadContract
      .mockResolvedValueOnce([true, BigInt(1707000000), BigInt(1), BigInt(0)])
      .mockResolvedValueOnce([true, BigInt(1707000000), BigInt(1), BigInt(0)]);

    await filterAlive(addresses, TEST_OPTIONS);

    expect(mockReadContract).toHaveBeenCalledTimes(2);
    expect(mockReadContract).toHaveBeenNthCalledWith(1, expect.objectContaining({
      address: TEST_OPTIONS.registryAddress,
      functionName: 'getAgentStatus',
      args: [addresses[0]],
    }));
    expect(mockReadContract).toHaveBeenNthCalledWith(2, expect.objectContaining({
      address: TEST_OPTIONS.registryAddress,
      functionName: 'getAgentStatus',
      args: [addresses[1]],
    }));
  });
});

describe('isAgentAlive', () => {
  let mockReadContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReadContract = vi.fn();
    vi.mocked(createPublicClient).mockReturnValue({
      readContract: mockReadContract,
    } as unknown as ReturnType<typeof createPublicClient>);
  });

  it('should return status for single agent', async () => {
    const address: Address = '0x1111111111111111111111111111111111111111';
    const expectedStatus = {
      alive: true,
      lastPulseAt: BigInt(1707000000),
      streak: BigInt(5),
      hazardScore: BigInt(0),
    };

    mockReadContract.mockResolvedValueOnce([
      expectedStatus.alive,
      expectedStatus.lastPulseAt,
      expectedStatus.streak,
      expectedStatus.hazardScore,
    ]);

    const result = await isAgentAlive(address, TEST_OPTIONS);

    expect(result).toEqual(expectedStatus);
  });

  it('should handle dead agents', async () => {
    const address: Address = '0x1111111111111111111111111111111111111111';

    mockReadContract.mockResolvedValueOnce([false, BigInt(1707000000), BigInt(0), BigInt(10)]);

    const result = await isAgentAlive(address, TEST_OPTIONS);

    expect(result.alive).toBe(false);
    expect(result.streak).toBe(BigInt(0));
    expect(result.hazardScore).toBe(BigInt(10));
  });
});

describe('getRegistryTTL', () => {
  let mockReadContract: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReadContract = vi.fn();
    vi.mocked(createPublicClient).mockReturnValue({
      readContract: mockReadContract,
    } as unknown as ReturnType<typeof createPublicClient>);
  });

  it('should return TTL from registry', async () => {
    const expectedTTL = BigInt(86400); // 24 hours
    mockReadContract.mockResolvedValueOnce(expectedTTL);

    const result = await getRegistryTTL(TEST_OPTIONS);

    expect(result).toBe(expectedTTL);
    expect(mockReadContract).toHaveBeenCalledWith(expect.objectContaining({
      address: TEST_OPTIONS.registryAddress,
      functionName: 'ttlSeconds',
    }));
  });

  it('should return different TTL values', async () => {
    mockReadContract.mockResolvedValueOnce(BigInt(3600)); // 1 hour
    const result1 = await getRegistryTTL(TEST_OPTIONS);
    expect(result1).toBe(BigInt(3600));
  });
});

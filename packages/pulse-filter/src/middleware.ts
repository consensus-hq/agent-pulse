import { type Address } from 'viem';
import { filterAlive, isAgentAlive, getRegistryTTL, type FilterOptions, type FilterResult } from './index.js';

// Re-export types
export type { FilterOptions, FilterResult } from './index.js';

/**
 * LangChain Integration
 * 
 * Provides a callable tool for LangChain agents to filter alive agents.
 * 
 * @example
 * ```typescript
 * import { LangChainTool } from '@agent-pulse/middleware';
 * import { Tool } from 'langchain/tools';
 * 
 * const aliveFilterTool = new LangChainTool({
 *   threshold: 3600, // 1 hour
 *   registryAddress: '0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612',
 *   rpcUrl: 'https://sepolia.base.org',
 * });
 * ```
 */
export class LangChainTool {
  private options: FilterOptions;

  constructor(options: FilterOptions) {
    this.options = options;
  }

  /**
   * Tool name for LangChain
   */
  name = 'agent_pulse_filter';

  /**
   * Tool description for LangChain
   */
  description = `
Filter Ethereum addresses to return only alive agents from the PulseRegistry.
Input should be a JSON array of Ethereum addresses: ["0x1234...", "0x5678..."]
Returns an array of addresses that are currently alive and within the threshold.
`.trim();

  /**
   * Call the filter function with agent addresses
   */
  async call(addresses: Address[]): Promise<string> {
    const result = await filterAlive(addresses, this.options);
    return JSON.stringify({
      alive: result.alive,
      count: result.alive.length,
      total: addresses.length,
      timestamp: result.timestamp,
    });
  }

  /**
   * Get detailed status for agents
   */
  async getDetails(addresses: Address[]): Promise<string> {
    const result = await filterAlive(addresses, this.options);
    return JSON.stringify(result, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
  }
}

/**
 * AutoGen Integration
 * 
 * Provides a function-based tool for AutoGen (Microsoft's multi-agent framework).
 * 
 * @example
 * ```typescript
 * import { AutoGenTool } from '@agent-pulse/middleware';
 * 
 * const autoGenTool = new AutoGenTool({
 *   threshold: 3600,
 *   registryAddress: '0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612',
 *   rpcUrl: 'https://sepolia.base.org',
 * });
 * 
 * // Register with AutoGen
 * user_proxy.register_function({
 *   function_map: {
 *     filter_alive_agents: autoGenTool.filterAgents.bind(autoGenTool),
 *   },
 * });
 * ```
 */
export class AutoGenTool {
  private options: FilterOptions;

  constructor(options: FilterOptions) {
    this.options = options;
  }

  /**
   * Filter agents - compatible with AutoGen function calling
   */
  async filterAgents(addresses: string[]): Promise<string> {
    // Validate and convert addresses
    const validAddresses = addresses.filter((addr): addr is Address =>
      /^0x[a-fA-F0-9]{40}$/.test(addr)
    );

    if (validAddresses.length === 0) {
      return JSON.stringify({
        error: 'No valid Ethereum addresses provided',
        alive: [],
      });
    }

    const result = await filterAlive(validAddresses, this.options);
    
    return JSON.stringify({
      alive_agents: result.alive,
      alive_count: result.alive.length,
      total_checked: validAddresses.length,
      timestamp: result.timestamp,
      threshold_seconds: this.options.threshold,
    }, (_, value) => typeof value === 'bigint' ? value.toString() : value);
  }

  /**
   * Check single agent status
   */
  async checkAgent(address: string): Promise<string> {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return JSON.stringify({ error: 'Invalid Ethereum address' });
    }

    const status = await isAgentAlive(address as Address, this.options);
    
    return JSON.stringify({
      address,
      alive: status.alive,
      last_pulse_at: status.lastPulseAt.toString(),
      streak: status.streak.toString(),
      hazard_score: status.hazardScore.toString(),
    });
  }
}

/**
 * ElizaOS Integration
 * 
 * Provides an action handler for ElizaOS (ai16z's agent framework).
 * 
 * @example
 * ```typescript
 * import { ElizaAction } from '@agent-pulse/middleware';
 * 
 * const elizaAction = new ElizaAction({
 *   threshold: 3600,
 *   registryAddress: '0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612',
 *   rpcUrl: 'https://sepolia.base.org',
 * });
 * 
 * // Register with Eliza runtime
 * runtime.registerAction(elizaAction.toElizaAction());
 * ```
 */
export class ElizaAction {
  private options: FilterOptions;

  constructor(options: FilterOptions) {
    this.options = options;
  }

  /**
   * Convert to ElizaOS Action format
   */
  toElizaAction() {
    return {
      name: 'PULSE_FILTER',
      similes: ['FILTER_ALIVE_AGENTS', 'CHECK_AGENT_STATUS', 'PULSE_CHECK'],
      description: 'Filter Ethereum addresses to return only alive agents from the PulseRegistry',
      
      validate: async (_runtime: unknown, message: { content?: { text?: string } }) => {
        const text = message?.content?.text || '';
        // Check if message contains Ethereum addresses
        return /0x[a-fA-F0-9]{40}/.test(text);
      },

      handler: async (
        _runtime: unknown,
        message: { content?: { text?: string } },
        _state?: unknown,
        _options?: unknown,
        callback?: (response: { text: string; content?: unknown }) => void
      ) => {
        const text = message?.content?.text || '';
        
        // Extract all Ethereum addresses from the message
        const addresses = text.match(/0x[a-fA-F0-9]{40}/g) || [];
        
        if (addresses.length === 0) {
          if (callback) {
            callback({
              text: 'No valid Ethereum addresses found in your message.',
            });
          }
          return;
        }

        try {
          const result = await filterAlive(addresses as Address[], this.options);
          
          const responseText = result.alive.length > 0
            ? `Found ${result.alive.length} alive agent(s) out of ${addresses.length} checked:\n${result.alive.join('\n')}`
            : `No alive agents found among the ${addresses.length} addresses checked.`;

          if (callback) {
            callback({
              text: responseText,
              content: {
                alive: result.alive,
                details: result.details,
                timestamp: result.timestamp,
              },
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          if (callback) {
            callback({
              text: `Error checking agent status: ${errorMsg}`,
            });
          }
        }
      },
    };
  }
}

/**
 * Generic middleware factory
 * Creates a simple filter function that can be used with any framework
 * 
 * @example
 * ```typescript
 * import { createFilter } from '@agent-pulse/middleware';
 * 
 * const filter = createFilter({
 *   threshold: 3600,
 *   registryAddress: '0x2C802988c16Fae08bf04656fe93aDFA9a5bA8612',
 *   rpcUrl: 'https://sepolia.base.org',
 * });
 * 
 * const aliveAgents = await filter(['0x1234...', '0x5678...']);
 * ```
 */
export function createFilter(options: FilterOptions) {
  return async (addresses: Address[]): Promise<FilterResult> => {
    return filterAlive(addresses, options);
  };
}

/**
 * Utility to convert BigInt values to strings for JSON serialization
 */
export function serializeBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeBigInt);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serializeBigInt(v)])
    );
  }
  return value;
}

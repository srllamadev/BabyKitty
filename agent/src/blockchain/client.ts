import { createPublicClient, createWalletClient, http, defineChain, type Address, type Chain, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';

const hardhatLocal = defineChain({
  id: 31337,
  name: 'Hardhat Local',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

const fuji = defineChain({
  id: 43113,
  name: 'Avalanche Fuji',
  nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.avax-test.network/ext/bc/C/rpc'] } },
  blockExplorers: { default: { name: 'Snowtrace', url: 'https://testnet.snowtrace.io' } },
});

const avalanche = defineChain({
  id: 43114,
  name: 'Avalanche C-Chain',
  nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.avax.network/ext/bc/C/rpc'] } },
  blockExplorers: { default: { name: 'Snowtrace', url: 'https://snowtrace.io' } },
});

const CHAINS: Record<string, Chain> = { localhost: hardhatLocal, fuji, avalanche };

let publicClient: PublicClient | null = null;
let walletClient: WalletClient | null = null;
let auditorAddress: Address;

export function getPublicClient(): PublicClient {
  if (publicClient) return publicClient;
  
  const env = getEnv();
  const chain = CHAINS[env.NETWORK];
  if (!chain) throw new Error(`Unknown network: ${env.NETWORK}`);
  
  publicClient = createPublicClient({
    chain,
    transport: http(env.RPC_URL),
  });
  
  getLogger().info({ network: env.NETWORK, chainId: chain.id }, 'Public client initialized');
  return publicClient;
}

export function getWalletClient(): WalletClient {
  if (walletClient) return walletClient;
  
  const env = getEnv();
  const chain = CHAINS[env.NETWORK];
  if (!chain) throw new Error(`Unknown network: ${env.NETWORK}`);
  
  const account = privateKeyToAccount(env.AUDITOR_PRIVATE_KEY as `0x${string}`);
  auditorAddress = account.address;
  
  walletClient = createWalletClient({
    account,
    chain,
    transport: http(env.RPC_URL),
  });
  
  getLogger().info({ auditor: auditorAddress }, 'Wallet client initialized');
  return walletClient;
}

export function getAuditorAddress(): Address {
  if (!auditorAddress) {
    getWalletClient();
  }
  return auditorAddress;
}

export function getChain(): Chain {
  const env = getEnv();
  const chain = CHAINS[env.NETWORK];
  if (!chain) throw new Error(`Unknown network: ${env.NETWORK}`);
  return chain;
}

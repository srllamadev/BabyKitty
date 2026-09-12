import { z } from 'zod';

const envSchema = z.object({
  NETWORK: z.enum(['localhost', 'fuji', 'avalanche']).default('localhost'),
  RPC_URL: z.string().url(),
  AUDIT_REGISTRY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  AUDITOR_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid private key'),
  AUDIT_CONFIRMATIONS: z.coerce.number().int().min(0).max(100).default(2),
  
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_BASE_URL: z.string().url().optional(),
  
  IPFS_PINNING_TOKEN: z.string().optional(),
  IPFS_GATEWAY: z.string().url().default('https://ipfs.io/ipfs/'),
  
  AVALANCHE_MCP_ENABLED: z.coerce.boolean().default(true),
  
  POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(4000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function loadEnv(): Env {
  if (env) return env;
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  env = result.data;
  return env;
}

export function getEnv(): Env {
  if (!env) {
    throw new Error('Environment not loaded. Call loadEnv() first.');
  }
  return env;
}

import { type Address, decodeEventLog, encodeFunctionData, keccak256, toHex } from 'viem';
import { getPublicClient, getWalletClient, getAuditorAddress, getChain } from './client.js';
import { AUDIT_REGISTRY_ABI, AuditStatus } from './abi.js';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ module: 'registry' });

export interface AuditData {
  id: bigint;
  requester: Address;
  target: Address;
  codeHash: `0x${string}`;
  fee: bigint;
  requestedAt: bigint;
  completedAt: bigint;
  securityScore: number;
  status: number;
  reportURI: string;
  reportHash: `0x${string}`;
  auditor: Address;
}

export function getRegistryAddress(): Address {
  const env = getEnv();
  return env.AUDIT_REGISTRY_ADDRESS as Address;
}

export async function getAudit(auditId: bigint): Promise<AuditData> {
  const client = getPublicClient();
  const registry = getRegistryAddress();
  
  const result = await client.readContract({
    address: registry,
    abi: AUDIT_REGISTRY_ABI,
    functionName: 'getAudit',
    args: [auditId],
  });
  
  return result as unknown as AuditData;
}

export async function isAuditCompleted(auditId: bigint): Promise<boolean> {
  const audit = await getAudit(auditId);
  return audit.status === AuditStatus.COMPLETED;
}

export async function getTargetBytecode(target: Address): Promise<`0x${string}`> {
  const client = getPublicClient();
  const bytecode = await client.getCode({ address: target });
  return bytecode || '0x';
}

export async function computeReportHash(reportJson: string): Promise<`0x${string}`> {
  const canonical = JSON.stringify(JSON.parse(reportJson));
  return keccak256(toHex(canonical));
}

export interface CompletionParams {
  auditId: bigint;
  securityScore: number;
  reportURI: string;
  reportHash: `0x${string}`;
}

export async function simulateCompletion(params: CompletionParams): Promise<boolean> {
  const client = getPublicClient();
  const registry = getRegistryAddress();
  const auditor = getAuditorAddress();
  const chain = getChain();
  
  try {
    await client.simulateContract({
      address: registry,
      abi: AUDIT_REGISTRY_ABI,
      functionName: 'completeAudit',
      args: [params.auditId, params.securityScore, params.reportURI, params.reportHash],
      account: auditor,
      chain,
    });
    return true;
  } catch (err) {
    logger.error({ err, auditId: params.auditId.toString() }, 'Simulation failed');
    return false;
  }
}

export async function submitCompletion(params: CompletionParams): Promise<`0x${string}`> {
  const wallet = getWalletClient();
  const registry = getRegistryAddress();
  const chain = getChain();
  const auditor = getAuditorAddress();
  
  logger.info({ auditId: params.auditId.toString(), score: params.securityScore }, 'Submitting completeAudit');
  
  const hash = await wallet.writeContract({
    address: registry,
    abi: AUDIT_REGISTRY_ABI,
    functionName: 'completeAudit',
    args: [params.auditId, params.securityScore, params.reportURI, params.reportHash],
    chain,
    account: auditor,
  });
  
  logger.info({ hash }, 'completeAudit tx sent');
  
  const client = getPublicClient();
  const receipt = await client.waitForTransactionReceipt({ hash });
  
  if (receipt.status !== 'success') {
    throw new Error(`Transaction failed: ${hash}`);
  }
  
  logger.info({ hash, block: receipt.blockNumber }, 'completeAudit confirmed');
  return hash;
}

export async function getPendingWithdrawals(): Promise<bigint> {
  const client = getPublicClient();
  const registry = getRegistryAddress();
  const auditor = getAuditorAddress();
  
  return client.readContract({
    address: registry,
    abi: AUDIT_REGISTRY_ABI,
    functionName: 'pendingWithdrawals',
    args: [auditor],
  });
}

export async function withdraw(): Promise<`0x${string}`> {
  const wallet = getWalletClient();
  const registry = getRegistryAddress();
  const chain = getChain();
  const auditor = getAuditorAddress();
  
  logger.info('Submitting withdraw');
  
  const hash = await wallet.writeContract({
    address: registry,
    abi: AUDIT_REGISTRY_ABI,
    functionName: 'withdraw',
    chain,
    account: auditor,
  });
  
  const client = getPublicClient();
  await client.waitForTransactionReceipt({ hash });
  
  logger.info({ hash }, 'Withdraw confirmed');
  return hash;
}

export function decodeAuditRequestedEvent(log: { topics: readonly `0x${string}`[]; data: `0x${string}` }) {
  return decodeEventLog({
    abi: AUDIT_REGISTRY_ABI,
    eventName: 'AuditRequested',
    topics: log.topics as [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`],
    data: log.data,
  });
}

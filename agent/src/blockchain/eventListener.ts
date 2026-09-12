import { type Address, type Log, parseAbiItem } from 'viem';
import { getPublicClient } from './client.js';
import { AUDIT_REGISTRY_ABI } from './abi.js';
import { getRegistryAddress, decodeAuditRequestedEvent } from './registry.js';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';
import { getJobRepository, type JobState } from '../jobs/repository.js';

const logger = getLogger().child({ module: 'eventListener' });

export interface AuditRequestedEvent {
  auditId: bigint;
  requester: Address;
  target: Address;
  codeHash: `0x${string}`;
  fee: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
}

type EventHandler = (event: AuditRequestedEvent) => Promise<void>;

let lastProcessedBlock: bigint = 0n;
let isPolling = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

export function createEventKey(event: AuditRequestedEvent): string {
  return `${event.transactionHash}-${event.logIndex}`;
}

export async function startEventListener(handler: EventHandler): Promise<void> {
  const env = getEnv();
  const client = getPublicClient();
  const registry = getRegistryAddress();
  const repo = getJobRepository();
  
  const currentBlock = await client.getBlockNumber();
  lastProcessedBlock = currentBlock - BigInt(env.AUDIT_CONFIRMATIONS);
  
  logger.info({ 
    registry, 
    fromBlock: lastProcessedBlock.toString(),
    confirmations: env.AUDIT_CONFIRMATIONS,
  }, 'Event listener started');
  
  isPolling = true;
  pollLoop(handler);
}

async function pollLoop(handler: EventHandler): Promise<void> {
  if (!isPolling) return;
  
  const env = getEnv();
  
  try {
    await pollOnce(handler);
  } catch (err) {
    logger.error({ err }, 'Poll error');
  }
  
  if (isPolling) {
    pollTimer = setTimeout(() => pollLoop(handler), env.POLL_INTERVAL_MS);
  }
}

async function pollOnce(handler: EventHandler): Promise<void> {
  const env = getEnv();
  const client = getPublicClient();
  const registry = getRegistryAddress();
  const repo = getJobRepository();
  
  const currentBlock = await client.getBlockNumber();
  const safeBlock = currentBlock - BigInt(env.AUDIT_CONFIRMATIONS);
  
  if (safeBlock <= lastProcessedBlock) {
    return;
  }
  
  const fromBlock = lastProcessedBlock + 1n;
  const toBlock = safeBlock;
  
  logger.debug({ fromBlock: fromBlock.toString(), toBlock: toBlock.toString() }, 'Polling events');
  
  const auditRequestedEvent = parseAbiItem([
    'event AuditRequested(uint256 indexed auditId, address indexed requester, address indexed target, bytes32 codeHash, uint256 fee)'
  ]);
  
  const logs = await client.getLogs({
    address: registry,
    event: auditRequestedEvent,
    fromBlock,
    toBlock,
  });
  
  logger.info({ count: logs.length, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() }, 'Found logs');
  
  for (const log of logs) {
    try {
      const args = log.args as {
        auditId: bigint;
        requester: Address;
        target: Address;
        codeHash: `0x${string}`;
        fee: bigint;
      };
      
      const event: AuditRequestedEvent = {
        auditId: args.auditId,
        requester: args.requester,
        target: args.target,
        codeHash: args.codeHash,
        fee: args.fee,
        blockNumber: log.blockNumber!,
        transactionHash: log.transactionHash!,
        logIndex: log.logIndex!,
      };
      
      const key = createEventKey(event);
      
      if (repo.has(key)) {
        logger.debug({ key, auditId: event.auditId.toString() }, 'Event already processed, skipping');
        continue;
      }
      
      logger.info({
        auditId: event.auditId.toString(),
        requester: event.requester,
        target: event.target,
        fee: event.fee.toString(),
        txHash: event.transactionHash,
      }, 'New AuditRequested event detected');
      
      repo.create(event.auditId, key, {
        requester: event.requester,
        target: event.target,
        codeHash: event.codeHash,
        fee: event.fee.toString(),
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber.toString(),
      });
      
      await handler(event);
      
      repo.updateState(event.auditId, 'DETECTED');
      
    } catch (err) {
      logger.error({ err, logIndex: log.logIndex }, 'Failed to process log');
    }
  }
  
  lastProcessedBlock = toBlock;
}

export function stopEventListener(): void {
  isPolling = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  logger.info('Event listener stopped');
}

import { loadEnv } from './config/env.js';
import { getLogger } from './utils/logger.js';
import { getPublicClient, getWalletClient, getAuditorAddress } from './blockchain/client.js';
import { startEventListener, stopEventListener, type AuditRequestedEvent } from './blockchain/eventListener.js';
import { executeAudit } from './audit/auditEngine.js';
import { getJobRepository } from './jobs/repository.js';

const env = loadEnv();
const logger = getLogger();

async function main() {
  logger.info('='.repeat(60));
  logger.info('Decentralized Audit Oracle — Autonomous Agent');
  logger.info('='.repeat(60));
  
  logger.info({ network: env.NETWORK, registry: env.AUDIT_REGISTRY_ADDRESS }, 'Configuration loaded');
  
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();
  const auditorAddress = getAuditorAddress();
  
  const chainId = await publicClient.getChainId();
  logger.info({ chainId, auditor: auditorAddress }, 'Blockchain connected');
  
  const blockNumber = await publicClient.getBlockNumber();
  logger.info({ blockNumber }, 'Current block');
  
  logger.info('Starting event listener...');
  
  await startEventListener(async (event: AuditRequestedEvent) => {
    logger.info({
      auditId: event.auditId.toString(),
      target: event.target,
      fee: event.fee.toString(),
    }, 'Processing audit request');
    
    try {
      const result = await executeAudit(
        event.auditId,
        event.target,
        event.codeHash,
      );
      
      logger.info({
        auditId: result.auditId.toString(),
        score: result.score.score,
        riskLevel: result.score.riskLevel,
        findings: result.findings.length,
        completionTxHash: result.completionTxHash,
      }, '✓ Audit completed and settled on-chain');
      
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_COMPLETED') {
        logger.info({ auditId: event.auditId.toString() }, 'Audit was already completed');
        return;
      }
      
      logger.error({ err, auditId: event.auditId.toString() }, 'Audit processing failed');
    }
  });
  
  logger.info('Agent is running. Waiting for AuditRequested events...');
  logger.info('Press Ctrl+C to stop.');
  
  const shutdown = () => {
    logger.info('Shutting down...');
    stopEventListener();
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error');
  process.exit(1);
});

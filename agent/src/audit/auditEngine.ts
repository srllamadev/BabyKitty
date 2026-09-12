import { type Address, keccak256, toHex } from 'viem';
import { getPublicClient } from '../blockchain/client.js';
import { getTargetBytecode, computeReportHash, submitCompletion, getAudit } from '../blockchain/registry.js';
import { AuditStatus } from '../blockchain/abi.js';
import { runDeterministicRules } from './rules.js';
import { calculateScore, type ScoreResult } from './scoreEngine.js';
import { analyzeBytecode, type BytecodeMetadata } from './bytecodeAnalyzer.js';
import { analyzeWithLLM, isLLMAvailable, type Finding } from '../llm/provider.js';
import { generateReport, reportToMarkdown, type AuditReport } from '../reports/reportGenerator.js';
import { getStorageProvider } from '../reports/ipfs.js';
import { getJobRepository } from '../jobs/repository.js';
import { getLogger } from '../utils/logger.js';
import { getEnv } from '../config/env.js';

const logger = getLogger().child({ module: 'auditEngine' });

export interface AuditResult {
  auditId: bigint;
  score: ScoreResult;
  findings: Finding[];
  reportURI: string;
  reportHash: `0x${string}`;
  completionTxHash: `0x${string}`;
  report: AuditReport;
}

export async function executeAudit(auditId: bigint, target: Address, codeHash: `0x${string}`): Promise<AuditResult> {
  const repo = getJobRepository();
  const env = getEnv();
  
  try {
    const alreadyCompleted = await isAuditCompleted(auditId);
    if (alreadyCompleted) {
      logger.info({ auditId: auditId.toString() }, 'Audit already completed, skipping');
      repo.updateState(auditId, 'COMPLETED');
      throw new Error('ALREADY_COMPLETED');
    }
    
    repo.updateState(auditId, 'FETCHING');
    logger.info({ auditId: auditId.toString(), target }, 'Fetching target bytecode');
    
    const bytecode = await getTargetBytecode(target);
    repo.updateState(auditId, 'ANALYZING', { bytecode });
    
    logger.info({ auditId: auditId.toString(), bytecodeLength: bytecode.length }, 'Bytecode fetched');
    
    const bytecodeMetadata = analyzeBytecode(bytecode);
    
    logger.info({ auditId: auditId.toString() }, 'Running deterministic rules');
    const deterministicFindings = runDeterministicRules({ bytecode, auditId });
    logger.info({ auditId: auditId.toString(), count: deterministicFindings.length }, 'Deterministic findings');
    
    let llmFindings: Finding[] = [];
    let avalancheContext: Record<string, unknown> | undefined;
    
    if (isLLMAvailable()) {
      logger.info({ auditId: auditId.toString() }, 'Running LLM analysis');
      
      if (env.AVALANCHE_MCP_ENABLED) {
        avalancheContext = {
          mcpUsed: true,
          network: env.NETWORK,
          chainId: env.NETWORK === 'fuji' ? 43113 : env.NETWORK === 'avalanche' ? 43114 : 31337,
          note: 'Avalanche MCP provides read-only context. Transactions are signed by agent wallet.',
        };
      }
      
      try {
        const llmResult = await analyzeWithLLM({
          bytecode,
          deterministicFindings,
          avalancheContext,
        });
        
        if (llmResult) {
          llmFindings = llmResult.findings.map(f => ({
            ...f,
            source: [...new Set([...f.source, 'llm'])],
          }));
          logger.info({ auditId: auditId.toString(), llmFindings: llmFindings.length }, 'LLM findings');
        }
      } catch (err) {
        logger.error({ err, auditId: auditId.toString() }, 'LLM analysis failed, using deterministic-only');
      }
    } else {
      logger.info({ auditId: auditId.toString() }, 'LLM not available, using deterministic-only');
    }
    
    const allFindings = mergeFindings(deterministicFindings, llmFindings);
    
    repo.updateState(auditId, 'REPORTING', { findings: allFindings });
    
    const score = calculateScore(allFindings);
    
    const report = generateReport({
      auditId,
      target,
      codeHash,
      findings: allFindings,
      score,
      bytecodeMetadata,
      avalancheContext,
    });
    
    const reportJson = JSON.stringify(report, null, 2);
    const reportMd = reportToMarkdown(report);
    const reportHash = await computeReportHash(reportJson);
    
    report.integrity.reportHash = reportHash;
    
    const updatedReportJson = JSON.stringify(report, null, 2);
    
    repo.updateState(auditId, 'UPLOADING');
    
    logger.info({ auditId: auditId.toString() }, 'Uploading report');
    const storage = getStorageProvider();
    const { uri: reportURI } = await storage.upload(updatedReportJson, reportMd);
    
    logger.info({ auditId: auditId.toString(), reportURI }, 'Report uploaded');
    
    repo.updateState(auditId, 'SUBMITTING', { reportURI, reportHash, score: score.score });
    
    logger.info({ auditId: auditId.toString(), score: score.score, riskLevel: score.riskLevel }, 'Submitting to blockchain');
    
    const completionTxHash = await submitCompletion({
      auditId,
      securityScore: score.score as number,
      reportURI,
      reportHash,
    });
    
    repo.updateState(auditId, 'COMPLETED', { completionTxHash });
    
    logger.info({
      auditId: auditId.toString(),
      score: score.score,
      riskLevel: score.riskLevel,
      findings: allFindings.length,
      reportURI,
      completionTxHash,
    }, 'Audit completed successfully');
    
    return {
      auditId,
      score,
      findings: allFindings,
      reportURI,
      reportHash,
      completionTxHash,
      report,
    };
    
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_COMPLETED') {
      throw err;
    }
    
    const errorMsg = err instanceof Error ? err.message : String(err);
    repo.updateState(auditId, 'FAILED', { error: errorMsg });
    
    logger.error({ err, auditId: auditId.toString() }, 'Audit failed');
    throw err;
  }
}

function mergeFindings(deterministic: Finding[], llm: Finding[]): Finding[] {
  const merged = [...deterministic];
  
  for (const llmFinding of llm) {
    const isDuplicate = deterministic.some(d =>
      d.title.toLowerCase() === llmFinding.title.toLowerCase() ||
      d.category === llmFinding.category
    );
    
    if (!isDuplicate) {
      merged.push(llmFinding);
    } else {
      const existing = merged.find(d =>
        d.title.toLowerCase() === llmFinding.title.toLowerCase() ||
        d.category === llmFinding.category
      );
      if (existing) {
        existing.source = [...new Set([...existing.source, ...llmFinding.source])];
        existing.confidence = Math.min(1, existing.confidence + 0.1);
      }
    }
  }
  
  return merged;
}

async function isAuditCompleted(auditId: bigint): Promise<boolean> {
  try {
    const audit = await getAudit(auditId);
    return audit.status === AuditStatus.COMPLETED;
  } catch {
    return false;
  }
}

import { type Finding } from '../llm/schemas.js';
import { type ScoreResult } from '../audit/scoreEngine.js';
import { type BytecodeMetadata } from '../audit/bytecodeAnalyzer.js';
import { type Address } from 'viem';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ module: 'reportGenerator' });

export interface AuditReport {
  version: string;
  auditId: string;
  timestamp: string;
  contract: {
    address: Address;
    codeHash: string;
    bytecodeLength: number;
  };
  score: ScoreResult;
  findings: Finding[];
  methodology: string;
  limitations: string;
  disclaimer: string;
  avalancheContext?: Record<string, unknown>;
  integrity: {
    reportHash: string;
    generatedAt: string;
  };
}

export function generateReport(params: {
  auditId: bigint;
  target: Address;
  codeHash: string;
  findings: Finding[];
  score: ScoreResult;
  bytecodeMetadata: BytecodeMetadata;
  avalancheContext?: Record<string, unknown>;
}): AuditReport {
  const now = new Date().toISOString();
  
  const report: AuditReport = {
    version: '1.0.0',
    auditId: params.auditId.toString(),
    timestamp: now,
    contract: {
      address: params.target,
      codeHash: params.codeHash,
      bytecodeLength: params.bytecodeMetadata.bytecodeLength,
    },
    score: params.score,
    findings: params.findings,
    methodology: 'Automated analysis combining deterministic bytecode pattern detection, rule-based security checks, and optional AI-assisted reasoning. This is a preliminary assessment, not a comprehensive security audit.',
    limitations: 'This automated audit does not constitute a professional security audit. It may not detect all vulnerability classes, especially those requiring deep semantic analysis or economic modeling. LLM analysis is supplementary and may produce false positives or negatives.',
    disclaimer: 'Decentralized Audit Oracle provides automated preliminary security assessments and does not guarantee the absence of vulnerabilities. This report does not constitute ISO/IEC 27001 certification.',
    avalancheContext: params.avalancheContext,
    integrity: {
      reportHash: '',
      generatedAt: now,
    },
  };
  
  logger.info({
    auditId: params.auditId.toString(),
    findings: params.findings.length,
    score: params.score.score,
  }, 'Report generated');
  
  return report;
}

export function reportToMarkdown(report: AuditReport): string {
  const lines: string[] = [];
  
  lines.push('# Decentralized Audit Oracle — Security Report');
  lines.push('');
  lines.push(`**Audit ID:** ${report.auditId}`);
  lines.push(`**Date:** ${report.timestamp}`);
  lines.push(`**Contract:** \`${report.contract.address}\``);
  lines.push('');
  
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`**Security Score:** ${report.score.score} / 100`);
  lines.push(`**Risk Level:** ${report.score.riskLevel}`);
  lines.push('');
  
  lines.push('### Findings Breakdown');
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| Critical | ${report.score.breakdown.critical} |`);
  lines.push(`| High | ${report.score.breakdown.high} |`);
  lines.push(`| Medium | ${report.score.breakdown.medium} |`);
  lines.push(`| Low | ${report.score.breakdown.low} |`);
  lines.push(`| Informational | ${report.score.breakdown.informational} |`);
  lines.push('');
  
  if (report.findings.length > 0) {
    lines.push('## Detected Vulnerabilities');
    lines.push('');
    
    for (const f of report.findings) {
      lines.push(`### ${f.id}: ${f.title}`);
      lines.push('');
      lines.push(`- **Severity:** ${f.severity}`);
      lines.push(`- **Confidence:** ${(f.confidence * 100).toFixed(0)}%`);
      lines.push(`- **Category:** ${f.category}`);
      if (f.function) lines.push(`- **Function:** \`${f.function}\``);
      lines.push('');
      lines.push(`**Description:** ${f.description}`);
      lines.push('');
      lines.push(`**Evidence:** ${f.evidence}`);
      lines.push('');
      lines.push(`**Impact:** ${f.impact}`);
      lines.push('');
      if (f.attackScenario) {
        lines.push(`**Attack Scenario:** ${f.attackScenario}`);
        lines.push('');
      }
      lines.push(`**Recommendation:** ${f.recommendation}`);
      lines.push('');
      lines.push(`**Sources:** ${f.source.join(', ')}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  } else {
    lines.push('## No Vulnerabilities Detected');
    lines.push('');
    lines.push('No security issues were identified during this automated analysis.');
    lines.push('');
  }
  
  lines.push('## Methodology');
  lines.push('');
  lines.push(report.methodology);
  lines.push('');
  
  lines.push('## Limitations');
  lines.push('');
  lines.push(report.limitations);
  lines.push('');
  
  lines.push('## Disclaimer');
  lines.push('');
  lines.push(report.disclaimer);
  lines.push('');
  
  lines.push('## Integrity');
  lines.push('');
  lines.push(`- **Report Hash:** \`${report.integrity.reportHash}\``);
  lines.push(`- **Generated At:** ${report.integrity.generatedAt}`);
  lines.push(`- **Score Version:** ${report.score.scoreVersion}`);
  lines.push('');
  
  return lines.join('\n');
}

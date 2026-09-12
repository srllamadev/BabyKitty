import { type Finding, type Severity } from '../llm/schemas.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ module: 'ruleEngine' });

interface RuleContext {
  bytecode: string;
  auditId: bigint;
}

interface Rule {
  id: string;
  name: string;
  severity: Severity;
  detect: (ctx: RuleContext) => boolean;
  evidence: (ctx: RuleContext) => string;
}

const REENTRANCY_PATTERNS = [
  '0x68756c6c', 
];

const TX_ORIGIN_SELECTOR = '0x431f1d62';
const DELEGATECALL_SELECTOR = '0xf499091e';
const SELFDESTRUCT_SELECTOR = '0xff';

const RULES: Rule[] = [
  {
    id: 'RULE-001',
    name: 'Empty Bytecode (EOA Target)',
    severity: 'INFORMATIONAL',
    detect: (ctx) => {
      return ctx.bytecode === '0x' || ctx.bytecode.length <= 2;
    },
    evidence: () => 'Target address has no deployed bytecode (may be an EOA).',
  },
  {
    id: 'RULE-002',
    name: 'Minimal Contract (Possible Proxy)',
    severity: 'LOW',
    detect: (ctx) => {
      return ctx.bytecode.length > 2 && ctx.bytecode.length < 100;
    },
    evidence: (ctx) => `Very small bytecode (${ctx.bytecode.length} chars), possibly a minimal proxy.`,
  },
];

export function runDeterministicRules(ctx: RuleContext): Finding[] {
  const findings: Finding[] = [];
  
  for (const rule of RULES) {
    try {
      if (rule.detect(ctx)) {
        findings.push({
          id: rule.id,
          title: rule.name,
          severity: rule.severity,
          confidence: 0.7,
          category: rule.severity === 'CRITICAL' ? 'CRITICAL_PATTERN' : 'DETERMINISTIC',
          description: `${rule.name} detected via bytecode analysis.`,
          evidence: rule.evidence(ctx),
          impact: `Potential ${rule.severity.toLowerCase()}-severity issue detected.`,
          recommendation: `Review the contract source code for ${rule.name.toLowerCase()}.`,
          source: ['rule-engine'],
        });
        
        logger.info({ ruleId: rule.id, severity: rule.severity }, 'Rule triggered');
      }
    } catch (err) {
      logger.error({ err, ruleId: rule.id }, 'Rule execution error');
    }
  }
  
  return findings;
}

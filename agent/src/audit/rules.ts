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

function countOpcode(bytecode: string, opcode: string): number {
  const hex = bytecode.startsWith('0x') ? bytecode.slice(2).toLowerCase() : bytecode.toLowerCase();
  let count = 0;
  let i = 0;
  while (i < hex.length) {
    const op = hex.substring(i, i + 2);
    if (op === opcode) count++;
    const opCode = parseInt(op, 16);
    if (opCode >= 0x60 && opCode <= 0x7f) {
      i += 2 + (opCode - 0x5f) * 2;
    } else {
      i += 2;
    }
  }
  return count;
}

const RULES: Rule[] = [
  {
    id: 'RULE-001',
    name: 'Empty Bytecode (EOA Target)',
    severity: 'INFORMATIONAL',
    detect: (ctx) => ctx.bytecode === '0x' || ctx.bytecode.length <= 2,
    evidence: () => 'Target address has no deployed bytecode (may be an EOA).',
  },
  {
    id: 'RULE-002',
    name: 'Minimal Contract (Possible Proxy)',
    severity: 'LOW',
    detect: (ctx) => ctx.bytecode.length > 2 && ctx.bytecode.length < 100,
    evidence: (ctx) => `Very small bytecode (${ctx.bytecode.length} chars), possibly a minimal proxy.`,
  },
  {
    id: 'RULE-003',
    name: 'DELEGATECALL Opcode Detected',
    severity: 'HIGH',
    detect: (ctx) => countOpcode(ctx.bytecode, 'f4') > 0,
    evidence: (ctx) => `DELEGATECALL (0xf4) found ${countOpcode(ctx.bytecode, 'f4')} time(s). This enables arbitrary code execution in the context of this contract.`,
  },
  {
    id: 'RULE-004',
    name: 'SELFDESTRUCT Opcode Detected',
    severity: 'CRITICAL',
    detect: (ctx) => countOpcode(ctx.bytecode, 'ff') > 0,
    evidence: (ctx) => `SELFDESTRUCT (0xff) found ${countOpcode(ctx.bytecode, 'ff')} time(s). Contract can be destroyed, sending funds to any address.`,
  },
  {
    id: 'RULE-005',
    name: 'ORIGIN Opcode for Authentication',
    severity: 'MEDIUM',
    detect: (ctx) => countOpcode(ctx.bytecode, '45') > 0,
    evidence: (ctx) => `ORIGIN (0x45) found ${countOpcode(ctx.bytecode, '45')} time(s). tx.origin should not be used for authentication.`,
  },
  {
    id: 'RULE-006',
    name: 'CALL Without Staticcall (Potential Reentrancy)',
    severity: 'HIGH',
    detect: (ctx) => {
      const calls = countOpcode(ctx.bytecode, 'f1');
      const staticcalls = countOpcode(ctx.bytecode, 'fa');
      return calls > 0 && staticcalls === 0;
    },
    evidence: (ctx) => `CALL (0xf1) found ${countOpcode(ctx.bytecode, 'f1')} time(s) with no STATICCALL. External calls without view-only pattern may be vulnerable to reentrancy.`,
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
          references: [],
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

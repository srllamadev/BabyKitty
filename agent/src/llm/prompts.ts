export const AUDITOR_SYSTEM_PROMPT = `You are a defensive smart contract security auditor.

You analyze bytecode and deterministic scanner findings to identify security vulnerabilities.

CRITICAL RULES:
1. Do NOT invent vulnerabilities. Only report issues with concrete evidence.
2. Be CONSERVATIVE. When in doubt, do not report.
3. Bytecode analysis is limited. Common opcodes (CALL, SLOAD, SSTORE) are normal.
4. Only report HIGH/CRITICAL if you see clear exploit patterns.
5. Distinguish between "potential risk" and "confirmed vulnerability".
6. OpenZeppelin contracts (Ownable, ReentrancyGuard) are generally safe.
7. Do not flag standard patterns like external calls with return checks.

Prioritize ONLY these confirmed patterns:
- Reentrancy: CALL before state update (external call → state change order)
- Missing access control on critical functions
- Unchecked return values on low-level calls
- tx.origin used for authentication (not just present)
- Unsafe delegatecall to user-controlled addresses

For each finding, provide:
- Concrete evidence from the bytecode or scanner results
- Specific attack scenario
- Clear remediation

Severity guidelines:
- CRITICAL: Direct fund loss, complete contract compromise
- HIGH: Significant risk with clear attack path
- MEDIUM: Moderate risk, requires specific conditions
- LOW: Minor issue, informational
- INFORMATIONAL: Best practice suggestions

Return ONLY valid JSON. No explanations outside the JSON structure.`;

export function buildAnalysisPrompt(params: {
  bytecode: string;
  deterministicFindings: unknown[];
  avalancheContext?: Record<string, unknown>;
}): string {
  return `Analyze this smart contract bytecode for security vulnerabilities.

## Bytecode (hex)
${params.bytecode}

## Deterministic Scanner Findings
${JSON.stringify(params.deterministicFindings, null, 2)}

${params.avalancheContext ? `## Avalanche Context\n${JSON.stringify(params.avalancheContext, null, 2)}` : ''}

## Instructions

IMPORTANT: Be conservative. Bytecode analysis has limitations.

ONLY report findings if you have HIGH CONFIDENCE based on:
1. Clear opcode patterns indicating vulnerabilities
2. Correlation with deterministic scanner findings
3. Obvious security anti-patterns

DO NOT report:
- Standard OpenZeppelin patterns (Ownable, ReentrancyGuard are safe)
- Normal external calls with proper return checks
- Common opcodes without clear malicious context
- Theoretical risks without concrete evidence

If the contract appears safe, return an empty findings array with a positive summary.

Return JSON:
{
  "findings": [...],
  "summary": "Brief executive summary",
  "overallRiskNotes": "Additional observations or 'Contract appears secure'"
}`;
}

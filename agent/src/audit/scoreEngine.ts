import { type Finding, type Severity } from '../llm/schemas.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ module: 'scoreEngine' });

const SCORE_VERSION = '1.0';

const SEVERITY_PENALTY: Record<Severity, number> = {
  CRITICAL: 30,
  HIGH: 15,
  MEDIUM: 7,
  LOW: 2,
  INFORMATIONAL: 0,
};

export type RiskLevel = 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'HIGH RISK' | 'CRITICAL RISK';

function getRiskLevel(score: number): RiskLevel {
  if (score >= 90) return 'EXCELLENT';
  if (score >= 75) return 'GOOD';
  if (score >= 60) return 'MODERATE';
  if (score >= 40) return 'HIGH RISK';
  return 'CRITICAL RISK';
}

export interface ScoreResult {
  score: number;
  riskLevel: RiskLevel;
  scoreVersion: string;
  breakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
  totalPenalty: number;
}

export function calculateScore(findings: Finding[]): ScoreResult {
  const breakdown = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
  let totalPenalty = 0;
  
  for (const finding of findings) {
    const penalty = SEVERITY_PENALTY[finding.severity] ?? 0;
    totalPenalty += penalty;
    
    switch (finding.severity) {
      case 'CRITICAL': breakdown.critical++; break;
      case 'HIGH': breakdown.high++; break;
      case 'MEDIUM': breakdown.medium++; break;
      case 'LOW': breakdown.low++; break;
      case 'INFORMATIONAL': breakdown.informational++; break;
    }
  }
  
  const score = Math.max(0, 100 - totalPenalty);
  const riskLevel = getRiskLevel(score);
  
  logger.info({ score, riskLevel, totalPenalty, breakdown }, 'Score calculated');
  
  return {
    score,
    riskLevel,
    scoreVersion: SCORE_VERSION,
    breakdown,
    totalPenalty,
  };
}

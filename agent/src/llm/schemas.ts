import { z } from 'zod';

export const severitySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL']);

export const findingSchema = z.object({
  id: z.string().default('LLM-001'),
  title: z.string(),
  severity: severitySchema.default('MEDIUM'),
  confidence: z.number().min(0).max(1).default(0.5),
  category: z.string().default('GENERAL'),
  contract: z.string().optional(),
  function: z.string().optional(),
  lines: z.string().optional(),
  description: z.string(),
  evidence: z.string().default(''),
  impact: z.string().default('Potential security risk'),
  attackScenario: z.string().optional(),
  recommendation: z.string().default('Review and fix'),
  references: z.array(z.string()).optional().default([]),
  source: z.array(z.string()).default(['llm']),
});

export const llmAnalysisSchema = z.object({
  findings: z.array(findingSchema).default([]),
  summary: z.string().default(''),
  overallRiskNotes: z.string().optional(),
});

export type Finding = z.infer<typeof findingSchema>;
export type LLMAnalysis = z.infer<typeof llmAnalysisSchema>;
export type Severity = z.infer<typeof severitySchema>;

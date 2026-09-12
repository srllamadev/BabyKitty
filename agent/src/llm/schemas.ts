import { z } from 'zod';

export const severitySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL']);

export const findingSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: severitySchema,
  confidence: z.number().min(0).max(1),
  category: z.string(),
  contract: z.string().optional(),
  function: z.string().optional(),
  lines: z.string().optional(),
  description: z.string(),
  evidence: z.string(),
  impact: z.string(),
  attackScenario: z.string().optional(),
  recommendation: z.string(),
  references: z.array(z.string()).optional(),
  source: z.array(z.string()),
});

export const llmAnalysisSchema = z.object({
  findings: z.array(findingSchema),
  summary: z.string(),
  overallRiskNotes: z.string().optional(),
});

export type Finding = z.infer<typeof findingSchema>;
export type LLMAnalysis = z.infer<typeof llmAnalysisSchema>;
export type Severity = z.infer<typeof severitySchema>;

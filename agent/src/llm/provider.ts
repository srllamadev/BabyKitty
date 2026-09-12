import OpenAI from 'openai';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';
import { llmAnalysisSchema, type LLMAnalysis, type Finding } from './schemas.js';
export type { Finding } from './schemas.js';
import { AUDITOR_SYSTEM_PROMPT, buildAnalysisPrompt } from './prompts.js';

const logger = getLogger().child({ module: 'llmProvider' });

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const env = getEnv();
  
  if (!env.LLM_API_KEY) {
    return null;
  }
  
  if (!client) {
    client = new OpenAI({
      apiKey: env.LLM_API_KEY,
      baseURL: env.LLM_BASE_URL,
    });
  }
  
  return client;
}

export function isLLMAvailable(): boolean {
  return getClient() !== null;
}

export async function analyzeWithLLM(params: {
  bytecode: string;
  deterministicFindings: Finding[];
  avalancheContext?: Record<string, unknown>;
}): Promise<LLMAnalysis | null> {
  const openai = getClient();
  
  if (!openai) {
    logger.warn('LLM not available, skipping AI analysis');
    return null;
  }
  
  const env = getEnv();
  const userPrompt = buildAnalysisPrompt(params);
  
  const maxAttempts = 3;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info({ attempt, model: env.LLM_MODEL }, 'Calling LLM');
      
      const response = await openai.chat.completions.create({
        model: env.LLM_MODEL,
        messages: [
          { role: 'system', content: AUDITOR_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });
      
      const content = response.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('Empty LLM response');
      }
      
      const parsed = JSON.parse(content);
      const validated = llmAnalysisSchema.parse(parsed);
      
      logger.info({ findings: validated.findings.length }, 'LLM analysis complete');
      return validated;
      
    } catch (err) {
      logger.error({ err, attempt }, `LLM attempt ${attempt} failed`);
      
      if (attempt === maxAttempts) {
        logger.error('All LLM attempts failed, falling back to deterministic-only');
        return null;
      }
      
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  
  return null;
}

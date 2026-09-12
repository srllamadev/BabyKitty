import { type Address } from 'viem';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ module: 'jobRepository' });

export type JobState = 
  | 'DETECTED'
  | 'FETCHING'
  | 'ANALYZING'
  | 'REPORTING'
  | 'UPLOADING'
  | 'SUBMITTING'
  | 'COMPLETED'
  | 'FAILED';

export interface AuditJob {
  auditId: bigint;
  eventKey: string;
  state: JobState;
  target: Address;
  requester: Address;
  codeHash: `0x${string}`;
  fee: string;
  transactionHash: `0x${string}`;
  blockNumber: string;
  bytecode?: string;
  findings?: unknown[];
  score?: number;
  reportURI?: string;
  reportHash?: `0x${string}`;
  completionTxHash?: `0x${string}`;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

class JobRepository {
  private jobs = new Map<string, AuditJob>();
  private eventKeys = new Set<string>();

  has(eventKey: string): boolean {
    return this.eventKeys.has(eventKey);
  }

  create(auditId: bigint, eventKey: string, data: {
    requester: Address;
    target: Address;
    codeHash: `0x${string}`;
    fee: string;
    transactionHash: `0x${string}`;
    blockNumber: string;
  }): AuditJob {
    const job: AuditJob = {
      auditId,
      eventKey,
      state: 'DETECTED',
      target: data.target,
      requester: data.requester,
      codeHash: data.codeHash,
      fee: data.fee,
      transactionHash: data.transactionHash,
      blockNumber: data.blockNumber,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.jobs.set(auditId.toString(), job);
    this.eventKeys.add(eventKey);
    
    logger.info({ auditId: auditId.toString(), state: job.state }, 'Job created');
    return job;
  }

  get(auditId: bigint): AuditJob | undefined {
    return this.jobs.get(auditId.toString());
  }

  updateState(auditId: bigint, state: JobState, updates?: Partial<AuditJob>): void {
    const job = this.jobs.get(auditId.toString());
    if (!job) {
      logger.warn({ auditId: auditId.toString() }, 'Job not found for state update');
      return;
    }
    
    job.state = state;
    job.updatedAt = new Date();
    
    if (updates) {
      Object.assign(job, updates);
    }
    
    logger.info({ auditId: auditId.toString(), state }, 'Job state updated');
  }

  getAll(): AuditJob[] {
    return Array.from(this.jobs.values());
  }

  getByState(state: JobState): AuditJob[] {
    return this.getAll().filter(j => j.state === state);
  }
}

let instance: JobRepository | null = null;

export function getJobRepository(): JobRepository {
  if (!instance) {
    instance = new JobRepository();
  }
  return instance;
}

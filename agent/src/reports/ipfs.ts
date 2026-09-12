import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ module: 'ipfs' });

export interface StorageProvider {
  upload(json: string, markdown: string): Promise<{ uri: string; cid: string }>;
}

class LocalStorageProvider implements StorageProvider {
  private baseDir: string;
  
  constructor() {
    this.baseDir = join(process.cwd(), '.local-ipfs');
  }
  
  async upload(json: string, markdown: string): Promise<{ uri: string; cid: string }> {
    await mkdir(this.baseDir, { recursive: true });
    
    const hash = createHash('sha256').update(json).digest('hex');
    const cid = `Qm${hash.substring(0, 44)}`;
    
    const jsonPath = join(this.baseDir, `${cid}.json`);
    const mdPath = join(this.baseDir, `${cid}.md`);
    
    await writeFile(jsonPath, json, 'utf-8');
    await writeFile(mdPath, markdown, 'utf-8');
    
    const uri = `ipfs://${cid}`;
    
    logger.info({ cid, uri, jsonPath }, 'Report stored locally');
    
    return { uri, cid };
  }
}

class PinataStorageProvider implements StorageProvider {
  async upload(json: string, _markdown: string): Promise<{ uri: string; cid: string }> {
    const env = getEnv();
    
    if (!env.IPFS_PINNING_TOKEN) {
      throw new Error('IPFS_PINNING_TOKEN not set');
    }
    
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.IPFS_PINNING_TOKEN}`,
      },
      body: JSON.stringify({
        pinataContent: JSON.parse(json),
        pinataMetadata: { name: `audit-report-${Date.now()}` },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Pinata upload failed: ${response.statusText}`);
    }
    
    const data = await response.json() as { IpfsHash: string };
    const cid = data.IpfsHash;
    const uri = `ipfs://${cid}`;
    
    logger.info({ cid, uri }, 'Report pinned to IPFS via Pinata');
    
    return { uri, cid };
  }
}

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (provider) return provider;
  
  const env = getEnv();
  
  if (env.IPFS_PINNING_TOKEN) {
    provider = new PinataStorageProvider();
    logger.info('Using Pinata IPFS storage');
  } else {
    provider = new LocalStorageProvider();
    logger.info('Using local file storage (no IPFS_PINNING_TOKEN set)');
  }
  
  return provider;
}

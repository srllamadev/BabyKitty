import { spawn, type ChildProcess } from 'child_process';
import { execSync } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';
import { createPublicClient, createWalletClient, http, defineChain, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const LOCALHOST = defineChain({
  id: 31337,
  name: 'Hardhat Local',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const AUDITOR_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getAudit',
    stateMutability: 'view',
    inputs: [{ name: 'auditId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'id', type: 'uint256' },
        { name: 'requester', type: 'address' },
        { name: 'target', type: 'address' },
        { name: 'codeHash', type: 'bytes32' },
        { name: 'fee', type: 'uint256' },
        { name: 'requestedAt', type: 'uint64' },
        { name: 'completedAt', type: 'uint64' },
        { name: 'securityScore', type: 'uint8' },
        { name: 'status', type: 'uint8' },
        { name: 'reportURI', type: 'string' },
        { name: 'reportHash', type: 'bytes32' },
        { name: 'auditor', type: 'address' },
      ],
    }],
  },
  {
    type: 'function',
    name: 'requestAudit',
    stateMutability: 'payable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'codeHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'auditId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'pendingWithdrawals',
    stateMutability: 'view',
    inputs: [{ name: 'auditor', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'AUDITOR_ROLE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'grantRole',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
] as const;

let hardhatNode: ChildProcess | null = null;
let agentProcess: ChildProcess | null = null;

function log(msg: string) {
  console.log(`\n[E2E] ${msg}`);
}

async function startHardhatNode(): Promise<void> {
  log('Starting Hardhat node...');
  hardhatNode = spawn('npx', ['hardhat', 'node'], {
    cwd: '../contracts',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  
  let started = false;
  hardhatNode.stdout?.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('Listening') || msg.includes('Started HTTP')) {
      log('Hardhat node ready');
      started = true;
    }
  });
  
  let waited = 0;
  while (!started && waited < 15000) {
    await sleep(1000);
    waited += 1000;
  }
  
  await sleep(2000);
}

async function deployContracts(): Promise<{ registryAddress: string; vulnerableVault: string; safeVault: string }> {
  log('Deploying contracts...');
  
  const output = execSync('npx hardhat run scripts/deploy.ts --network localhost', {
    cwd: '../contracts',
    encoding: 'utf-8',
  });
  
  const registryMatch = output.match(/AuditRegistry deployed to: (0x[a-fA-F0-9]{40})/);
  const vulnerableMatch = output.match(/VulnerableVault deployed to: (0x[a-fA-F0-9]{40})/);
  const safeMatch = output.match(/SafeVault deployed to: (0x[a-fA-F0-9]{40})/);
  
  if (!registryMatch || !vulnerableMatch || !safeMatch) {
    throw new Error('Failed to parse deployment output');
  }
  
  return {
    registryAddress: registryMatch[1],
    vulnerableVault: vulnerableMatch[1],
    safeVault: safeMatch[1],
  };
}

async function startAgent(registryAddress: string): Promise<void> {
  log('Starting agent with DeepSeek LLM...');
  
  agentProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: '.',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      NETWORK: 'localhost',
      RPC_URL: 'http://127.0.0.1:8545',
      AUDIT_REGISTRY_ADDRESS: registryAddress,
      AUDITOR_PRIVATE_KEY: AUDITOR_KEY,
      AUDIT_CONFIRMATIONS: '0',
      POLL_INTERVAL_MS: '1000',
      LOG_LEVEL: 'info',
      AVALANCHE_MCP_ENABLED: 'false',
      LLM_API_KEY: 'sk-c0ea776ca0ea43b0b62dbb6d2e409faf',
      LLM_MODEL: 'deepseek-chat',
      LLM_BASE_URL: 'https://api.deepseek.com/v1',
    },
  });
  
  agentProcess.stdout?.on('data', (data) => {
    process.stdout.write(`[AGENT] ${data}`);
  });
  
  agentProcess.stderr?.on('data', (data) => {
    const msg = data.toString();
    if (!msg.includes('DEP0040')) {
      process.stderr.write(`[AGENT ERR] ${msg}`);
    }
  });
  
  await sleep(3000);
  log('Agent started');
}

async function requestAuditForContract(
  registryAddress: string, 
  vaultAddress: string, 
  contractName: string
): Promise<void> {
  log(`\n${'='.repeat(60)}`);
  log(`Requesting audit for ${contractName}...`);
  log('='.repeat(60));
  
  const deployerAccount = privateKeyToAccount(DEPLOYER_KEY as `0x${string}`);
  
  const walletClient = createWalletClient({
    account: deployerAccount,
    chain: LOCALHOST,
    transport: http('http://127.0.0.1:8545'),
  });
  
  const publicClient = createPublicClient({
    chain: LOCALHOST,
    transport: http('http://127.0.0.1:8545'),
  });
  
  const vaultCode = await publicClient.getCode({ address: vaultAddress as `0x${string}` });
  const hash = keccak256(toHex(vaultCode || '0x'));
  
  log(`Contract: ${contractName}`);
  log(`Address: ${vaultAddress}`);
  log(`Code hash: ${hash}`);
  
  const txHash = await walletClient.writeContract({
    address: registryAddress as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: 'requestAudit',
    args: [vaultAddress as `0x${string}`, hash],
    value: BigInt('10000000000000000'),
    chain: LOCALHOST,
    account: deployerAccount,
  });
  
  log(`requestAudit TX: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  log('requestAudit confirmed');
}

async function waitForCompletion(registryAddress: string, auditId: number, timeoutMs: number = 90000): Promise<{ completed: boolean; score: number; reportURI: string }> {
  log(`Waiting for audit #${auditId} completion...`);
  
  const publicClient = createPublicClient({
    chain: LOCALHOST,
    transport: http('http://127.0.0.1:8545'),
  });
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const audit = await publicClient.readContract({
      address: registryAddress as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'getAudit',
      args: [BigInt(auditId)],
    });
    
    const auditData = audit as unknown as { status: number; securityScore: number; reportURI: string };
    
    if (auditData.status === 2) {
      return { completed: true, score: auditData.securityScore, reportURI: auditData.reportURI };
    }
    
    await sleep(2000);
  }
  
  return { completed: false, score: 0, reportURI: '' };
}

async function verifyWithdrawal(registryAddress: string): Promise<void> {
  const publicClient = createPublicClient({
    chain: LOCALHOST,
    transport: http('http://127.0.0.1:8545'),
  });
  
  const auditorAccount = privateKeyToAccount(AUDITOR_KEY as `0x${string}`);
  
  const pending = await publicClient.readContract({
    address: registryAddress as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: 'pendingWithdrawals',
    args: [auditorAccount.address],
  });
  
  log(`\nAuditor pending withdrawals: ${pending.toString()} wei (${Number(pending) / 1e18} ETH)`);
}

async function cleanup(): Promise<void> {
  log('\nCleaning up...');
  
  if (agentProcess) {
    agentProcess.kill('SIGTERM');
    await sleep(1000);
  }
  
  if (hardhatNode) {
    hardhatNode.kill('SIGTERM');
    await sleep(1000);
  }
}

async function main(): Promise<void> {
  log('='.repeat(60));
  log('E2E Test: Full Audit Loop with DeepSeek LLM');
  log('='.repeat(60));
  
  try {
    await startHardhatNode();
    
    const { registryAddress, vulnerableVault, safeVault } = await deployContracts();
    log(`Registry: ${registryAddress}`);
    log(`VulnerableVault: ${vulnerableVault}`);
    log(`SafeVault: ${safeVault}`);
    
    const deployerAccount = privateKeyToAccount(DEPLOYER_KEY as `0x${string}`);
    const auditorAccount = privateKeyToAccount(AUDITOR_KEY as `0x${string}`);
    
    const publicClient = createPublicClient({
      chain: LOCALHOST,
      transport: http('http://127.0.0.1:8545'),
    });
    
    const walletClient = createWalletClient({
      account: deployerAccount,
      chain: LOCALHOST,
      transport: http('http://127.0.0.1:8545'),
    });
    
    const auditorRole = await publicClient.readContract({
      address: registryAddress as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'AUDITOR_ROLE',
    });
    
    log(`Granting AUDITOR_ROLE to ${auditorAccount.address}...`);
    await walletClient.writeContract({
      address: registryAddress as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'grantRole',
      args: [auditorRole, auditorAccount.address],
      chain: LOCALHOST,
      account: deployerAccount,
    });
    
    await startAgent(registryAddress);
    await sleep(2000);
    
    await requestAuditForContract(registryAddress, vulnerableVault, 'VulnerableVault');
    const result1 = await waitForCompletion(registryAddress, 1);
    
    await requestAuditForContract(registryAddress, safeVault, 'SafeVault');
    const result2 = await waitForCompletion(registryAddress, 2);
    
    log('\n' + '='.repeat(60));
    log('FINAL RESULTS');
    log('='.repeat(60));
    
    if (result1.completed) {
      log(`\n✓ VulnerableVault Audit #1`);
      log(`  Score: ${result1.score}/100`);
      log(`  Report: ${result1.reportURI}`);
      log(`  Risk Level: ${result1.score >= 90 ? 'EXCELLENT' : result1.score >= 75 ? 'GOOD' : result1.score >= 60 ? 'MODERATE' : result1.score >= 40 ? 'HIGH RISK' : 'CRITICAL RISK'}`);
    } else {
      log('\n✗ VulnerableVault audit failed');
    }
    
    if (result2.completed) {
      log(`\n✓ SafeVault Audit #2`);
      log(`  Score: ${result2.score}/100`);
      log(`  Report: ${result2.reportURI}`);
      log(`  Risk Level: ${result2.score >= 90 ? 'EXCELLENT' : result2.score >= 75 ? 'GOOD' : result2.score >= 60 ? 'MODERATE' : result2.score >= 40 ? 'HIGH RISK' : 'CRITICAL RISK'}`);
    } else {
      log('\n✗ SafeVault audit failed');
    }
    
    await verifyWithdrawal(registryAddress);
    
    if (result1.completed && result2.completed) {
      log('\n' + '='.repeat(60));
      log('✓ E2E TEST PASSED');
      log('='.repeat(60));
      log(`\nComparison:`);
      log(`  VulnerableVault: ${result1.score}/100 (should be LOW)`);
      log(`  SafeVault: ${result2.score}/100 (should be HIGH)`);
      
      if (result1.score < result2.score) {
        log('\n✓ Scoring correctly differentiates vulnerable vs safe contracts!');
      }
    } else {
      log('\n✗ E2E TEST FAILED');
      process.exit(1);
    }
    
  } catch (err) {
    log(`Error: ${err}`);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();

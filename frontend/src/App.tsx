import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { useState } from 'react';

const REGISTRY_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const REGISTRY_ABI = [
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
] as const;

function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  
  const [contractAddress, setContractAddress] = useState('');
  const [auditId, setAuditId] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [reportURI, setReportURI] = useState('');

  const handleConnect = () => {
    connect({ connector: injected() });
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const isCorrectNetwork = chainId === 43113 || chainId === 31337;

  const handleRequestAudit = async () => {
    if (!contractAddress) {
      setStatus('Please enter a contract address');
      return;
    }

    setStatus('Requesting audit...');
    
    try {
      const { writeContract } = await import('@wagmi/core');
      const { keccak256, toHex } = await import('viem');
      
      const codeHash = keccak256(toHex(contractAddress));
      
      const hash = await writeContract({
        address: REGISTRY_ADDRESS as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'requestAudit',
        args: [contractAddress as `0x${string}`, codeHash],
        value: BigInt('10000000000000000'),
      });
      
      setStatus(`Audit requested! TX: ${hash}`);
      setAuditId(1);
      
      setTimeout(() => pollAuditStatus(), 5000);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const pollAuditStatus = async () => {
    if (!auditId) return;
    
    setStatus('Polling audit status...');
    
    try {
      const { readContract } = await import('@wagmi/core');
      
      const audit = await readContract({
        address: REGISTRY_ADDRESS as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'getAudit',
        args: [BigInt(auditId)],
      });
      
      const auditData = audit as unknown as { status: number; securityScore: number; reportURI: string };
      
      if (auditData.status === 2) {
        setScore(auditData.securityScore);
        setReportURI(auditData.reportURI);
        setStatus('Audit completed!');
      } else {
        setStatus('Audit in progress...');
        setTimeout(() => pollAuditStatus(), 3000);
      }
    } catch (err) {
      setStatus(`Error polling: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const getRiskLevel = (score: number) => {
    if (score >= 90) return { label: 'EXCELLENT', color: 'text-green-400' };
    if (score >= 75) return { label: 'GOOD', color: 'text-green-300' };
    if (score >= 60) return { label: 'MODERATE', color: 'text-yellow-400' };
    if (score >= 40) return { label: 'HIGH RISK', color: 'text-orange-400' };
    return { label: 'CRITICAL RISK', color: 'text-red-400' };
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-avalanche-red to-red-400 bg-clip-text text-transparent">
            Decentralized Audit Oracle
          </h1>
          <p className="text-xl text-gray-300">
            Autonomous smart contract security settled on Avalanche
          </p>
          <div className="mt-4 inline-flex items-center gap-2 bg-avalanche-red/20 px-4 py-2 rounded-full">
            <div className="w-2 h-2 bg-avalanche-red rounded-full animate-pulse"></div>
            <span className="text-sm font-semibold">Powered by Avalanche</span>
          </div>
        </header>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8">
          {!isConnected ? (
            <div className="text-center">
              <p className="mb-4 text-gray-300">Connect your wallet to request an audit</p>
              <button
                onClick={handleConnect}
                className="bg-avalanche-red hover:bg-red-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
              >
                Connect Wallet
              </button>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <p className="text-sm text-gray-400">Connected</p>
                  <p className="font-mono text-sm">{address}</p>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  Disconnect
                </button>
              </div>

              {!isCorrectNetwork && (
                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 mb-6">
                  <p className="text-yellow-200">
                    Please switch to Avalanche Fuji or Hardhat Local network
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Contract Address to Audit
                  </label>
                  <input
                    type="text"
                    value={contractAddress}
                    onChange={(e) => setContractAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-black/30 border border-white/20 rounded-lg px-4 py-3 font-mono text-sm focus:outline-none focus:border-avalanche-red"
                  />
                </div>

                <div className="bg-black/20 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Network: {chainId === 43113 ? 'Avalanche Fuji' : chainId === 31337 ? 'Hardhat Local' : 'Unknown'}</p>
                  <p className="text-sm text-gray-400">Audit Fee: 0.01 AVAX/ETH</p>
                </div>

                <button
                  onClick={handleRequestAudit}
                  disabled={!isCorrectNetwork}
                  className="w-full bg-avalanche-red hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-8 rounded-lg transition-colors"
                >
                  Request Audit
                </button>
              </div>
            </div>
          )}
        </div>

        {status && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8">
            <h2 className="text-2xl font-bold mb-4">Status</h2>
            <p className="text-gray-300">{status}</p>
            
            {score !== null && (
              <div className="mt-6">
                <h3 className="text-xl font-bold mb-2">Security Score</h3>
                <div className="text-6xl font-bold mb-2">
                  {score} <span className="text-2xl text-gray-400">/ 100</span>
                </div>
                <div className={`text-2xl font-bold ${getRiskLevel(score).color}`}>
                  {getRiskLevel(score).label}
                </div>
                
                {reportURI && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-400">Report URI</p>
                    <p className="font-mono text-sm break-all">{reportURI}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <footer className="text-center text-gray-500 text-sm mt-12">
          <p>Decentralized Audit Oracle provides automated preliminary security assessments.</p>
          <p className="mt-2">This does not constitute a professional security audit.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;

export const AUDIT_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getAudit',
    stateMutability: 'view',
    inputs: [{ name: 'auditId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{
      type: 'tuple',
      internalType: 'struct AuditRegistry.Audit',
      name: '',
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
    name: 'completeAudit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'auditId', type: 'uint256' },
      { name: 'securityScore', type: 'uint8' },
      { name: 'reportURI', type: 'string' },
      { name: 'reportHash', type: 'bytes32' },
    ],
    outputs: [],
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
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'event',
    name: 'AuditRequested',
    inputs: [
      { name: 'auditId', type: 'uint256', indexed: true },
      { name: 'requester', type: 'address', indexed: true },
      { name: 'target', type: 'address', indexed: true },
      { name: 'codeHash', type: 'bytes32', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AuditCompleted',
    inputs: [
      { name: 'auditId', type: 'uint256', indexed: true },
      { name: 'securityScore', type: 'uint8', indexed: false },
      { name: 'reportURI', type: 'string', indexed: false },
      { name: 'reportHash', type: 'bytes32', indexed: false },
      { name: 'auditor', type: 'address', indexed: true },
    ],
  },
] as const;

export enum AuditStatus {
  NONE = 0,
  PENDING = 1,
  COMPLETED = 2,
  CANCELLED = 3,
}

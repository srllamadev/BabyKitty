import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ module: 'bytecodeAnalyzer' });

export interface BytecodeMetadata {
  bytecodeLength: number;
  hasConstructor: boolean;
  opcodes: Map<string, number>;
  uniqueSelectors: string[];
}

const OPCODE_NAMES: Record<string, string> = {
  '00': 'STOP', '01': 'ADD', '02': 'MUL', '03': 'SUB', '04': 'DIV',
  '10': 'LT', '11': 'GT', '14': 'EQ', '15': 'ISZERO', '16': 'AND',
  '20': 'SHA3', '30': 'ADDRESS', '31': 'BALANCE', '32': 'ORIGIN',
  '33': 'CALLER', '34': 'CALLVALUE', '35': 'CALLDATALOAD',
  '36': 'CALLDATASIZE', '37': 'CALLDATACOPY', '38': 'CODESIZE',
  '39': 'CODECOPY', '3a': 'GASPRICE', '3b': 'EXTCODESIZE',
  '3c': 'EXTCODECOPY', '3d': 'RETURNDATASIZE', '3e': 'RETURNDATACOPY',
  '40': 'BLOCKHASH', '41': 'COINBASE', '42': 'TIMESTAMP', '43': 'NUMBER',
  '50': 'POP', '51': 'MLOAD', '52': 'MSTORE', '53': 'MSTORE8',
  '54': 'SLOAD', '55': 'SSTORE', '56': 'JUMP', '57': 'JUMPI',
  '58': 'PC', '59': 'MSIZE', '5a': 'GAS', '5b': 'JUMPDEST',
  'f0': 'CREATE', 'f1': 'CALL', 'f2': 'CALLCODE', 'f3': 'RETURN',
  'f4': 'DELEGATECALL', 'fa': 'STATICCALL', 'fd': 'REVERT',
  'fe': 'INVALID', 'ff': 'SELFDESTRUCT',
};

export function analyzeBytecode(bytecode: string): BytecodeMetadata {
  const hex = bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode;
  
  if (hex.length === 0) {
    return {
      bytecodeLength: 0,
      hasConstructor: false,
      opcodes: new Map(),
      uniqueSelectors: [],
    };
  }
  
  const opcodes = new Map<string, number>();
  const selectors = new Set<string>();
  
  let i = 0;
  while (i < hex.length) {
    const op = hex.substring(i, i + 2).toLowerCase();
    opcodes.set(op, (opcodes.get(op) || 0) + 1);
    
    const opCode = parseInt(op, 16);
    
    if (opCode >= 0x60 && opCode <= 0x7f) {
      const pushSize = (opCode - 0x5f) * 2;
      
      if (opCode === 0x63 && i + 10 <= hex.length) {
        const selector = hex.substring(i + 2, i + 10);
        selectors.add(selector);
      }
      
      i += 2 + pushSize;
    } else {
      i += 2;
    }
  }
  
  const hasConstructor = hex.length > 100;
  
  logger.debug({
    bytecodeLength: hex.length,
    uniqueOpcodes: opcodes.size,
    selectors: selectors.size,
  }, 'Bytecode analyzed');
  
  return {
    bytecodeLength: hex.length,
    hasConstructor,
    opcodes,
    uniqueSelectors: Array.from(selectors),
  };
}

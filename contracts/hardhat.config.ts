import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const AUDITOR_PRIVATE_KEY = process.env.AUDITOR_PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    fuji: {
      url: FUJI_RPC_URL,
      chainId: 43113,
      accounts: DEPLOYER_PRIVATE_KEY && AUDITOR_PRIVATE_KEY
        ? [DEPLOYER_PRIVATE_KEY, AUDITOR_PRIVATE_KEY]
        : [],
    },
    avalanche: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts: DEPLOYER_PRIVATE_KEY && AUDITOR_PRIVATE_KEY
        ? [DEPLOYER_PRIVATE_KEY, AUDITOR_PRIVATE_KEY]
        : [],
    },
  },
  etherscan: {
    apiKey: {
      avalancheFujiTestnet: "snowtrace",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;

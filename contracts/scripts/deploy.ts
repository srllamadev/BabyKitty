import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with:", deployer.address);

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH/AVAX");

    const MIN_FEE = ethers.parseEther("0.01");
    const CANCEL_TIMEOUT = 3600;

    console.log("\n--- Deploying AuditRegistry ---");
    const AuditRegistry = await ethers.getContractFactory("AuditRegistry");
    const registry = await AuditRegistry.deploy(MIN_FEE, CANCEL_TIMEOUT);
    await registry.waitForDeployment();

    const registryAddress = await registry.getAddress();
    console.log("AuditRegistry deployed to:", registryAddress);

    console.log("\n--- Deploying VulnerableVault ---");
    const VulnerableVault = await ethers.getContractFactory("VulnerableVault");
    const vulnerableVault = await VulnerableVault.deploy();
    await vulnerableVault.waitForDeployment();
    console.log("VulnerableVault deployed to:", await vulnerableVault.getAddress());

    console.log("\n--- Deploying SafeVault ---");
    const SafeVault = await ethers.getContractFactory("SafeVault");
    const safeVault = await SafeVault.deploy();
    await safeVault.waitForDeployment();
    console.log("SafeVault deployed to:", await safeVault.getAddress());

    console.log("\n--- Deployment Summary ---");
    console.log({
        AuditRegistry: registryAddress,
        VulnerableVault: await vulnerableVault.getAddress(),
        SafeVault: await safeVault.getAddress(),
        Network: (await ethers.provider.getNetwork()).name,
        ChainId: (await ethers.provider.getNetwork()).chainId,
    });

    console.log("\n--- Configuration for .env ---");
    console.log(`AUDIT_REGISTRY_ADDRESS=${registryAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

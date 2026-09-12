import { ethers } from "hardhat";

async function main() {
    const [deployer, auditor] = await ethers.getSigners();
    const registryAddress = process.env.AUDIT_REGISTRY_ADDRESS;

    if (!registryAddress) {
        throw new Error("AUDIT_REGISTRY_ADDRESS not set");
    }

    console.log("Using registry at:", registryAddress);
    console.log("Deployer:", deployer.address);
    console.log("Auditor:", auditor.address);

    const registry = await ethers.getContractAt("AuditRegistry", registryAddress);

    const AUDITOR_ROLE = await registry.AUDITOR_ROLE();
    const hasRole = await registry.hasRole(AUDITOR_ROLE, auditor.address);

    if (!hasRole) {
        console.log("Granting AUDITOR_ROLE to", auditor.address);
        await registry.grantRole(AUDITOR_ROLE, auditor.address);
        console.log("AUDITOR_ROLE granted");
    } else {
        console.log("AUDITOR_ROLE already granted");
    }

    console.log("\n--- Seeding VulnerableVault audit ---");
    const VulnerableVault = await ethers.getContractFactory("VulnerableVault");
    const vulnerableVault = await VulnerableVault.deploy();
    await vulnerableVault.waitForDeployment();
    const vulnerableAddr = await vulnerableVault.getAddress();
    const vulnerableCode = await ethers.provider.getCode(vulnerableAddr);
    const vulnerableHash = ethers.keccak256(vulnerableCode);

    console.log("VulnerableVault at:", vulnerableAddr);
    console.log("Code hash:", vulnerableHash);

    const fee = ethers.parseEther("0.01");
    const tx1 = await registry.requestAudit(vulnerableAddr, vulnerableHash, { value: fee });
    const receipt1 = await tx1.wait();
    console.log("requestAudit TX:", receipt1?.hash);

    console.log("\n--- Seeding SafeVault audit ---");
    const SafeVault = await ethers.getContractFactory("SafeVault");
    const safeVault = await SafeVault.deploy();
    await safeVault.waitForDeployment();
    const safeAddr = await safeVault.getAddress();
    const safeCode = await ethers.provider.getCode(safeAddr);
    const safeHash = ethers.keccak256(safeCode);

    console.log("SafeVault at:", safeAddr);
    console.log("Code hash:", safeHash);

    const tx2 = await registry.requestAudit(safeAddr, safeHash, { value: fee });
    const receipt2 = await tx2.wait();
    console.log("requestAudit TX:", receipt2?.hash);

    console.log("\n--- Seed Summary ---");
    console.log("Audit #1: VulnerableVault (expect low score)");
    console.log("Audit #2: SafeVault (expect high score)");
    console.log("Registry:", registryAddress);
    console.log("Pending audits:", await registry.audits(1).then(a => a.status), await registry.audits(2).then(a => a.status));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

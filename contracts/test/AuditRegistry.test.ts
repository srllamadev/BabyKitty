import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("AuditRegistry", function () {
    const MIN_FEE = ethers.parseEther("0.01");
    const CANCEL_TIMEOUT = 3600;

    async function deployRegistryFixture() {
        const [admin, auditor, requester, attacker] = await ethers.getSigners();

        const AuditRegistry = await ethers.getContractFactory("AuditRegistry");
        const registry = await AuditRegistry.deploy(MIN_FEE, CANCEL_TIMEOUT);

        const AUDITOR_ROLE = await registry.AUDITOR_ROLE();
        await registry.grantRole(AUDITOR_ROLE, auditor.address);

        const VulnerableVault = await ethers.getContractFactory("VulnerableVault");
        const vault = await VulnerableVault.deploy();

        const codeHash = ethers.keccak256(await ethers.provider.getCode(await vault.getAddress()));

        return { registry, admin, auditor, requester, attacker, vault, codeHash, AUDITOR_ROLE };
    }

    describe("Deployment", function () {
        it("should set deployer as admin", async function () {
            const { registry, admin } = await loadFixture(deployRegistryFixture);
            const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
            expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
        });

        it("should set initial minFee", async function () {
            const { registry } = await loadFixture(deployRegistryFixture);
            expect(await registry.minFee()).to.equal(MIN_FEE);
        });

        it("should set initial cancelTimeout", async function () {
            const { registry } = await loadFixture(deployRegistryFixture);
            expect(await registry.cancelTimeout()).to.equal(CANCEL_TIMEOUT);
        });
    });

    describe("requestAudit", function () {
        it("should create audit with correct state", async function () {
            const { registry, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            const tx = await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            await expect(tx).to.emit(registry, "AuditRequested");

            const audit = await registry.getAudit(1);
            expect(audit.requester).to.equal(requester.address);
            expect(audit.target).to.equal(await vault.getAddress());
            expect(audit.codeHash).to.equal(codeHash);
            expect(audit.fee).to.equal(MIN_FEE);
            expect(audit.status).to.equal(1);
        });

        it("should reject fee below minimum", async function () {
            const { registry, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(requester).requestAudit(
                    await vault.getAddress(),
                    codeHash,
                    { value: ethers.parseEther("0.001") }
                )
            ).to.be.revertedWith("AuditRegistry: fee too low");
        });

        it("should reject zero address target", async function () {
            const { registry, requester, codeHash } = await loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(requester).requestAudit(
                    ethers.ZeroAddress,
                    codeHash,
                    { value: MIN_FEE }
                )
            ).to.be.revertedWith("AuditRegistry: invalid target");
        });

        it("should reject zero code hash", async function () {
            const { registry, requester, vault } = await loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(requester).requestAudit(
                    await vault.getAddress(),
                    ethers.ZeroHash,
                    { value: MIN_FEE }
                )
            ).to.be.revertedWith("AuditRegistry: invalid code hash");
        });

        it("should increment audit IDs", async function () {
            const { registry, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const audit1 = await registry.getAudit(1);
            const audit2 = await registry.getAudit(2);

            expect(audit1.id).to.equal(1);
            expect(audit2.id).to.equal(2);
        });
    });

    describe("completeAudit", function () {
        it("should complete audit successfully", async function () {
            const { registry, auditor, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const reportURI = "ipfs://QmTest123";
            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report"));

            await expect(
                registry.connect(auditor).completeAudit(1, 75, reportURI, reportHash)
            ).to.emit(registry, "AuditCompleted");

            const audit = await registry.getAudit(1);
            expect(audit.status).to.equal(2);
            expect(audit.securityScore).to.equal(75);
            expect(audit.reportURI).to.equal(reportURI);
            expect(audit.reportHash).to.equal(reportHash);
            expect(audit.auditor).to.equal(auditor.address);
        });

        it("should credit fee to auditor", async function () {
            const { registry, auditor, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report"));
            await registry.connect(auditor).completeAudit(1, 80, "ipfs://test", reportHash);

            expect(await registry.pendingWithdrawals(auditor.address)).to.equal(MIN_FEE);
        });

        it("should reject score > 100", async function () {
            const { registry, auditor, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report"));

            await expect(
                registry.connect(auditor).completeAudit(1, 101, "ipfs://test", reportHash)
            ).to.be.revertedWith("AuditRegistry: invalid score");
        });

        it("should reject empty report URI", async function () {
            const { registry, auditor, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report"));

            await expect(
                registry.connect(auditor).completeAudit(1, 80, "", reportHash)
            ).to.be.revertedWith("AuditRegistry: empty report URI");
        });

        it("should reject empty report hash", async function () {
            const { registry, auditor, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            await expect(
                registry.connect(auditor).completeAudit(1, 80, "ipfs://test", ethers.ZeroHash)
            ).to.be.revertedWith("AuditRegistry: empty report hash");
        });

        it("should reject non-pending audit", async function () {
            const { registry, auditor, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report"));
            await registry.connect(auditor).completeAudit(1, 80, "ipfs://test", reportHash);

            await expect(
                registry.connect(auditor).completeAudit(1, 80, "ipfs://test2", reportHash)
            ).to.be.revertedWith("AuditRegistry: not pending");
        });

        it("should reject unauthorized auditor", async function () {
            const { registry, attacker, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report"));

            await expect(
                registry.connect(attacker).completeAudit(1, 80, "ipfs://test", reportHash)
            ).to.be.reverted;
        });

        it("cannot complete audit twice", async function () {
            const { registry, auditor, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report"));
            await registry.connect(auditor).completeAudit(1, 80, "ipfs://test", reportHash);

            await expect(
                registry.connect(auditor).completeAudit(1, 90, "ipfs://test2", reportHash)
            ).to.be.revertedWith("AuditRegistry: not pending");
        });
    });

    describe("withdraw", function () {
        it("should allow auditor to withdraw", async function () {
            const { registry, auditor, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report"));
            await registry.connect(auditor).completeAudit(1, 80, "ipfs://test", reportHash);

            const balanceBefore = await ethers.provider.getBalance(auditor.address);
            const tx = await registry.connect(auditor).withdraw();
            const receipt = await tx.wait();
            const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
            const balanceAfter = await ethers.provider.getBalance(auditor.address);

            expect(balanceAfter - balanceBefore + gasUsed).to.equal(MIN_FEE);
            expect(await registry.pendingWithdrawals(auditor.address)).to.equal(0);
        });

        it("should reject withdraw with zero balance", async function () {
            const { registry, auditor } = await loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(auditor).withdraw()
            ).to.be.revertedWith("AuditRegistry: nothing to withdraw");
        });

        it("should prevent double withdrawal", async function () {
            const { registry, auditor, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report"));
            await registry.connect(auditor).completeAudit(1, 80, "ipfs://test", reportHash);
            await registry.connect(auditor).withdraw();

            await expect(
                registry.connect(auditor).withdraw()
            ).to.be.revertedWith("AuditRegistry: nothing to withdraw");
        });
    });

    describe("cancelAudit", function () {
        it("should cancel after timeout", async function () {
            const { registry, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            await time.increase(CANCEL_TIMEOUT + 1);

            const balanceBefore = await ethers.provider.getBalance(requester.address);
            const tx = await registry.connect(requester).cancelAudit(1);
            const receipt = await tx.wait();
            const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
            const balanceAfter = await ethers.provider.getBalance(requester.address);

            expect(balanceAfter - balanceBefore + gasUsed).to.equal(MIN_FEE);

            const audit = await registry.getAudit(1);
            expect(audit.status).to.equal(3);
        });

        it("should reject cancel before timeout", async function () {
            const { registry, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            await expect(
                registry.connect(requester).cancelAudit(1)
            ).to.be.revertedWith("AuditRegistry: timeout not reached");
        });

        it("should reject cancel by non-requester", async function () {
            const { registry, attacker, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            await time.increase(CANCEL_TIMEOUT + 1);

            await expect(
                registry.connect(attacker).cancelAudit(1)
            ).to.be.revertedWith("AuditRegistry: not requester");
        });
    });

    describe("Access Control", function () {
        it("only AUDITOR_ROLE can finalize", async function () {
            const { registry, attacker, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(requester).requestAudit(
                await vault.getAddress(),
                codeHash,
                { value: MIN_FEE }
            );

            const reportHash = ethers.keccak256(ethers.toUtf8Bytes("report"));

            await expect(
                registry.connect(attacker).completeAudit(1, 80, "ipfs://test", reportHash)
            ).to.be.reverted;
        });

        it("admin can pause and unpause", async function () {
            const { registry, admin } = await loadFixture(deployRegistryFixture);

            await registry.connect(admin).pause();
            expect(await registry.paused()).to.be.true;

            await registry.connect(admin).unpause();
            expect(await registry.paused()).to.be.false;
        });

        it("non-admin cannot pause", async function () {
            const { registry, attacker } = await loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(attacker).pause()
            ).to.be.reverted;
        });

        it("paused contract rejects requests", async function () {
            const { registry, admin, requester, vault, codeHash } = await loadFixture(deployRegistryFixture);

            await registry.connect(admin).pause();

            await expect(
                registry.connect(requester).requestAudit(
                    await vault.getAddress(),
                    codeHash,
                    { value: MIN_FEE }
                )
            ).to.be.reverted;
        });
    });

    describe("Admin functions", function () {
        it("admin can update minFee", async function () {
            const { registry, admin } = await loadFixture(deployRegistryFixture);
            const newFee = ethers.parseEther("0.05");

            await registry.connect(admin).setMinFee(newFee);
            expect(await registry.minFee()).to.equal(newFee);
        });

        it("non-admin cannot update minFee", async function () {
            const { registry, attacker } = await loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(attacker).setMinFee(ethers.parseEther("0.05"))
            ).to.be.reverted;
        });

        it("admin can update cancelTimeout", async function () {
            const { registry, admin } = await loadFixture(deployRegistryFixture);

            await registry.connect(admin).setCancelTimeout(7200);
            expect(await registry.cancelTimeout()).to.equal(7200);
        });
    });
});

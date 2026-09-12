// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract AuditRegistry is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    enum AuditStatus {
        NONE,
        PENDING,
        COMPLETED,
        CANCELLED
    }

    struct Audit {
        uint256 id;
        address requester;
        address target;
        bytes32 codeHash;
        uint256 fee;
        uint64 requestedAt;
        uint64 completedAt;
        uint8 securityScore;
        AuditStatus status;
        string reportURI;
        bytes32 reportHash;
        address auditor;
    }

    uint256 private _nextAuditId;
    uint256 public minFee;
    uint256 public cancelTimeout;
    mapping(uint256 => Audit) public audits;
    mapping(address => uint256) public pendingWithdrawals;

    event AuditRequested(
        uint256 indexed auditId,
        address indexed requester,
        address indexed target,
        bytes32 codeHash,
        uint256 fee
    );

    event AuditCompleted(
        uint256 indexed auditId,
        uint8 securityScore,
        string reportURI,
        bytes32 reportHash,
        address indexed auditor
    );

    event AuditCancelled(
        uint256 indexed auditId,
        address indexed requester
    );

    event Withdrawal(
        address indexed auditor,
        uint256 amount
    );

    event MinFeeUpdated(uint256 oldFee, uint256 newFee);
    event CancelTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);

    constructor(uint256 _minFee, uint256 _cancelTimeout) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(AUDITOR_ROLE, msg.sender);
        minFee = _minFee;
        cancelTimeout = _cancelTimeout;
        _nextAuditId = 1;
    }

    function requestAudit(
        address target,
        bytes32 codeHash
    ) external payable whenNotPaused returns (uint256 auditId) {
        require(msg.value >= minFee, "AuditRegistry: fee too low");
        require(target != address(0), "AuditRegistry: invalid target");
        require(codeHash != bytes32(0), "AuditRegistry: invalid code hash");

        auditId = _nextAuditId++;

        audits[auditId] = Audit({
            id: auditId,
            requester: msg.sender,
            target: target,
            codeHash: codeHash,
            fee: msg.value,
            requestedAt: uint64(block.timestamp),
            completedAt: 0,
            securityScore: 0,
            status: AuditStatus.PENDING,
            reportURI: "",
            reportHash: bytes32(0),
            auditor: address(0)
        });

        emit AuditRequested(auditId, msg.sender, target, codeHash, msg.value);
    }

    function completeAudit(
        uint256 auditId,
        uint8 securityScore,
        string calldata reportURI,
        bytes32 reportHash
    ) external onlyRole(AUDITOR_ROLE) whenNotPaused nonReentrant {
        Audit storage audit = audits[auditId];

        require(audit.status == AuditStatus.PENDING, "AuditRegistry: not pending");
        require(securityScore <= 100, "AuditRegistry: invalid score");
        require(bytes(reportURI).length > 0, "AuditRegistry: empty report URI");
        require(reportHash != bytes32(0), "AuditRegistry: empty report hash");

        audit.status = AuditStatus.COMPLETED;
        audit.completedAt = uint64(block.timestamp);
        audit.securityScore = securityScore;
        audit.reportURI = reportURI;
        audit.reportHash = reportHash;
        audit.auditor = msg.sender;

        pendingWithdrawals[msg.sender] += audit.fee;

        emit AuditCompleted(auditId, securityScore, reportURI, reportHash, msg.sender);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "AuditRegistry: nothing to withdraw");

        pendingWithdrawals[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "AuditRegistry: withdrawal failed");

        emit Withdrawal(msg.sender, amount);
    }

    function cancelAudit(uint256 auditId) external nonReentrant {
        Audit storage audit = audits[auditId];

        require(audit.status == AuditStatus.PENDING, "AuditRegistry: not pending");
        require(msg.sender == audit.requester, "AuditRegistry: not requester");
        require(
            block.timestamp >= uint256(audit.requestedAt) + cancelTimeout,
            "AuditRegistry: timeout not reached"
        );

        audit.status = AuditStatus.CANCELLED;

        uint256 fee = audit.fee;
        address requester = audit.requester;

        (bool success, ) = requester.call{value: fee}("");
        require(success, "AuditRegistry: refund failed");

        emit AuditCancelled(auditId, requester);
    }

    function getAudit(uint256 auditId) external view returns (Audit memory) {
        return audits[auditId];
    }

    function setMinFee(uint256 _minFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldFee = minFee;
        minFee = _minFee;
        emit MinFeeUpdated(oldFee, _minFee);
    }

    function setCancelTimeout(uint256 _cancelTimeout) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldTimeout = cancelTimeout;
        cancelTimeout = _cancelTimeout;
        emit CancelTimeoutUpdated(oldTimeout, _cancelTimeout);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}

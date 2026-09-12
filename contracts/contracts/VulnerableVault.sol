// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VulnerableVault {
    mapping(address => uint256) public balances;
    address public owner;

    constructor() payable {
        owner = msg.sender;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        balances[msg.sender] -= amount;
    }

    function setOwner(address newOwner) external {
        require(tx.origin == owner, "Not owner");
        owner = newOwner;
    }

    function emergencyWithdraw() external {
        require(tx.origin == owner, "Not owner");
        payable(owner).transfer(address(this).balance);
    }

    function execute(address target, bytes calldata data) external {
        (bool success, ) = target.delegatecall(data);
        require(success, "Delegatecall failed");
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        balances[msg.sender] += msg.value;
    }
}

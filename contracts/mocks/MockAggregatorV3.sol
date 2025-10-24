// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockAggregatorV3 is AggregatorV3Interface {
    int256 private answer;
    uint8 private decimals_;
    uint256 private updatedAt_;

    constructor(int256 _initialAnswer, uint8 _decimals) {
        answer = _initialAnswer;
        decimals_ = _decimals;
        updatedAt_ = block.timestamp;
    }

    function decimals() external view override returns (uint8) {
        return decimals_;
    }

    function description() external pure override returns (string memory) {
        return "Mock Chainlink Aggregator";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer_, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (0, answer, updatedAt_, updatedAt_, 0);
    }

    function getRoundData(uint80) external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (0, answer, updatedAt_, updatedAt_, 0);
    }

    /// @notice manually update the price
    function updateAnswer(int256 _newAnswer) external {
        answer = _newAnswer;
        updatedAt_ = block.timestamp;
    }

    /// @notice manually set a custom updatedAt for staleness testing
    function setUpdatedAt(uint256 _timestamp) external {
        updatedAt_ = _timestamp;
    }

    function getUpdatedAt() external view returns (uint256) {
        return updatedAt_;
    }
}

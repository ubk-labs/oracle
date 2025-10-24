// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

//Mocked interface for IERC-4626 behavior.
//This is far more minimal and easy to work with for testing purposes.
//Will be used to impart 4626 functionality to sDAI in tests.
interface MockIERC4626 {
    function setExchangeRate(uint256 newRate) external;
    function convertToAssets(uint256 shares) external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
}

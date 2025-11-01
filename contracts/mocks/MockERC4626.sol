// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockERC20.sol";
import "./MockIERC4626.sol";

contract Mock4626 is MockERC20, MockIERC4626 {
    uint256 public exchangeRate = 1e18; // 1:1 default
    address private _asset; // underlying ERC20 asset
    uint8 private immutable _assetDecimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_, // vault decimals (e.g. 18)
        uint256 initialSupply,
        address asset_
    )
        MockERC20(name_, symbol_, decimals_, initialSupply)
    {
        _asset = asset_;
        _assetDecimals = MockERC20(asset_).decimals();
    }

    /// @notice sets a mock exchange rate for testing
    function setExchangeRate(uint256 newRate) external {
        exchangeRate = newRate;
    }

    /// @notice mock conversion (shares → assets)
    function convertToAssets(uint256 shares) external view override returns (uint256) {
        uint8 vaultDecimals = decimals();

        // Normalize shares → assets
        // assets = shares * 10^(assetDecimals) / 10^(vaultDecimals) * exchangeRate / 1e18
        uint256 assets = (shares * (10 ** _assetDecimals)) / (10 ** vaultDecimals);
        return (assets * exchangeRate) / 1e18;
    }

    /// @notice ERC-4626 required function
    function asset() external view override returns (address) {
        return _asset;
    }

    /// @notice Deposit assets and mint shares to `receiver`
    /// @notice Deposit assets and mint shares to `receiver`
    function deposit(uint256 assets, address receiver) external override returns (uint256 shares) {
        require(assets > 0, "Zero deposit");

        // Compute shares using convertToShares()
        shares = this.convertToShares(assets);

        // Pull underlying from sender
        IERC20(_asset).transferFrom(msg.sender, address(this), assets);

        // Mint vault shares (this ERC20) to receiver
        _mint(receiver, shares);
    }

    /// @notice mock conversion (assets → shares)
    function convertToShares(uint256 assets) external view returns (uint256) {
        uint8 vaultDecimals = decimals();

        // Normalize: assets → shares
        uint256 normalized = (assets * (10 ** vaultDecimals)) / (10 ** _assetDecimals);

        return (normalized * 1e18) / exchangeRate;
    }
}

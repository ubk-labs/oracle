// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IOracle {
    /// @notice Operational state of the oracle.
    enum OracleMode {
        NORMAL,
        PAUSED
    }

    event ChainlinkFeedSet(address indexed token, address indexed feed);
    event ERC4626Registered(address indexed vault, address indexed underlying);
    event ManualPriceSet(address indexed token, uint256 price);
    event ManualModeEnabled(address indexed token, bool enabled);
    event StalePeriodUpdated(uint256 newPeriod);
    event OracleModeChanged(OracleMode oldMode, OracleMode newMode);
    event FallbackStalePeriodUpdated(uint256 newPeriod);
    event VaultRateBoundsSet(
        address indexed vault,
        uint256 minRate,
        uint256 maxRate
    );

    // View Functions
    function getPrice(address token) external view returns (uint256);

    // Mutators
    function fetchAndUpdatePrice(address token) external returns (uint256);
}

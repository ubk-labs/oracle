// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library Constants {
    // WAD constants
    uint256 public constant WAD = 1e18;                              // Fixed-point math base
    uint256 public constant MANUAL_PRICE_MAX_DELTA_WAD = 0.1e18;     // 10%
    uint256 public constant MIN_ABSOLUTE_PRICE_WAD = 1e10;           // 0.00000001
    uint256 public constant MAX_ABSOLUTE_PRICE_WAD = 1e24;           // 1,000,000
    uint256 public constant DEFAULT_MIN_VAULT_RATE_WAD = 0.2e18;     // 0.2x (20%)
    uint256 public constant DEFAULT_MAX_VAULT_RATE_WAD = 3e18;       // 3x (300%)

    // Time based
    uint256 public constant ORACLE_DEFAULT_STALE_HOURS = 1 hours;
    uint256 internal constant MIN_STALE_HOURS = 1 hours;
    uint256 internal constant MAX_STALE_HOURS = 3 hours;

    // Misc
    uint256 public constant MAX_RECURSION_DEPTH = 1;
}

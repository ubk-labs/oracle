// ───────────── Errors ─────────────
error ZeroAddress(string functionName, string field);
error InvalidManualPrice(address token, uint256 price);
error InvalidStalePeriod(uint256 period);
error InvalidVaultBounds(address vault, uint256 minRate, uint256 maxRate);
error InvalidFeedContract(address feed);
error InvalidFeedDecimals(address feed, uint8 decimals);
error InvalidERC4626Vault(address vault);
error InvalidVaultExchangeRate(address vault, uint256 rate);
error InvalidOraclePrice(address token, address feed);
error NoPriceFeed(address token);
error StalePrice(address token, uint256 updatedAt, uint256 currentTime);
error StaleFallback(address token);
error NoFallbackPrice(address token);
error SuspiciousVaultRate(address vault, uint256 rate);
error RecursiveResolution(address token);
error OraclePaused(address oracle, uint256 timestamp);

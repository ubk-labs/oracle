## Overview

The Oracle contract is a robust, production-grade price oracle system for decentralized financial applications. It provides normalized 1e18-precision prices for all supported assets through a flexible, multi-source architecture with comprehensive safety mechanisms.

## Key Features

### Multi-Source Price Resolution

The Oracle resolves prices using a priority-based system:

1. **Manual Override** - Admin-set prices with ±10% bounds from last valid price
2. **ERC4626 Vault Pricing** - Derives vault share prices via `convertToAssets()` × underlying asset price
3. **Chainlink Feeds** - Industry-standard oracle feeds normalized to 1e18 precision

### Safety Features

- **Recursion Guard** - Prevents infinite loops in nested ERC4626 vaults (max depth: 5)
- **Staleness Enforcement** - Configurable time thresholds for price freshness
- **Vault Rate Bounds** - Min/max sanity checks per vault to prevent manipulation
- **Manual Price Limits** - ±10% bound enforcement when recent valid prices exist
- **Circuit Breaker** - Pausable mode for emergency situations
- **Fallback Mechanism** - Falls back to last valid price within extended window if feeds fail

### Gas-Efficient Design

- `getPrice()` - Returns cached prices (view function, minimal gas)
- `fetchAndUpdatePrice()` - Pulls fresh on-chain data (keeper/contract callable)
- `isPriceFresh()` / `getPriceAge()` - Helper functions for UI/subgraph safety checks

## Architecture

### Price Caching System

The Oracle maintains a `lastValidPrice` mapping that stores:
- Most recent valid price (1e18 precision)
- Timestamp of last update

This enables gas-efficient reads while maintaining data freshness guarantees.

### ERC4626 Vault Support

The Oracle can price vault shares by:
1. Calling `convertToAssets()` on the vault
2. Fetching the underlying asset price (recursively if needed)
3. Computing: `vaultPrice = (assetsPerShare × underlyingPrice) / scalingFactor`

**Note:** The underlying asset doesn't need to match `.asset()` - this flexibility allows for depeg protection strategies (e.g., pricing sUSDe against USDC).

### Chainlink Integration

- Normalizes all Chainlink feeds to 1e18 precision
- Validates feed responses (positive values, recent updates)
- Enforces staleness thresholds
- Falls back to cached prices on feed failure

## Usage

### Reading Prices

```solidity
// Get cached price (reverts if stale)
uint256 price = oracle.getPrice(tokenAddress);

// Check price freshness
bool isFresh = oracle.isPriceFresh(tokenAddress);
uint256 age = oracle.getPriceAge(tokenAddress);

// Fetch and update price
uint256 freshPrice = oracle.fetchAndUpdatePrice(tokenAddress);
```

### Admin Configuration

```solidity
// Set Chainlink feed
oracle.setChainlinkFeed(token, feedAddress);

// Register ERC4626 vault
oracle.setERC4626Vault(vaultToken, underlyingAsset);

// Configure vault rate bounds
oracle.setVaultRateBounds(vault, 0.2e18, 3e18); // 0.2x to 3x

// Set manual price (±10% bounded)
oracle.setManualPrice(token, priceIn1e18);

// Configure staleness periods
oracle.setStalePeriod(3600); // 1 hour
oracle.setFallbackStalePeriod(7200); // 2 hours

// Emergency pause
oracle.setOracleMode(OracleMode.PAUSED);
```

## Configuration Constants

| Parameter | Default | Description |
|-----------|---------|-------------|
| `stalePeriod` | 3600s (1h) | Max age for Chainlink feeds |
| `fallbackStalePeriod` | 7200s (2h) | Max age for fallback prices |
| Max Recursion Depth | 5 | Nested ERC4626 vault limit |
| Manual Price Delta | ±10% | Max deviation from last valid |
| Min Absolute Price | Configurable | Lower bound sanity check |
| Max Absolute Price | Configurable | Upper bound sanity check |

## Security Considerations

### Chainlink Feed Validation

- Verifies feed contract has code
- Checks decimals ≤ 18
- Validates positive answers with timestamps
- Enforces staleness thresholds

### Vault Rate Protection

```solidity
// Example: Prevent flash loan attacks
oracle.setVaultRateBounds(
    stETH_vault,
    0.95e18,  // Min rate: 0.95x
    1.05e18   // Max rate: 1.05x
);
```

### Manual Price Safeguards

Manual prices are bounded to prevent governance attacks:
- If recent valid price exists (< stalePeriod): ±10% bound enforced
- If no recent price: Full range within min/max absolute bounds
- Requires `whenNotPaused` modifier

## Events

```solidity
event LastValidPriceUpdated(address indexed token, uint256 price, uint256 timestamp);
event OracleFallbackUsed(address indexed token, uint256 lastValid, uint256 at, string reason);
event ChainlinkFeedSet(address indexed token, address feed);
event ERC4626Registered(address indexed vault, address underlying);
event ManualPriceSet(address indexed token, uint256 price);
event OracleModeChanged(OracleMode oldMode, OracleMode newMode);
event VaultRateBoundsSet(address indexed vault, uint256 minRate, uint256 maxRate);
```

## Error Handling

The Oracle reverts with descriptive errors:
- `ZeroAddress` - Invalid address parameter
- `NoPriceFeed` - No price source configured
- `StalePrice` - Cached price too old
- `NoFallbackPrice` - No valid fallback available
- `StaleFallback` - Fallback price exceeded tolerance
- `InvalidVaultExchangeRate` - Suspicious vault conversion
- `SuspiciousVaultRate` - Rate outside configured bounds
- `RecursiveResolution` - Exceeded max recursion depth
- `OraclePaused` - Oracle in emergency pause mode

## License

MIT

## Dependencies

- OpenZeppelin Contracts (Ownable, IERC4626, IERC20Metadata)
- Chainlink Contracts (AggregatorV3Interface)
- Solidity ^0.8.20

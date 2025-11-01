// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../../interfaces/IOracle.sol";
import "../errors/Errors.sol";
import "../constants/Constants.sol";

/**
 * @title Oracle
 * @notice This contract is an implementation of the IOracle interface.
 *
 * @dev
 *  The oracle computes normalized 1e18 prices for all supported assets,
 *  combining manual overrides, ERC4626 vault conversions, and Chainlink feeds.
 *
 *  === PRICE RESOLUTION ORDER ===
 *  1️⃣ Manual override (±10% bound from last valid)
 *  2️⃣ ERC4626 vault-derived (convertToAssets * underlying price)
 *  3️⃣ Chainlink feed (normalized to 1e18)
 *
 *  === SAFETY FEATURES ===
 *  - Recursion guard (nested ERC4626 depth ≤ 5)
 *  - Chainlink stale-period enforcement
 *  - Vault rate sanity bounds (min/max rate per vault)
 *  - Manual mode ±10% limit if last valid < stalePeriod
 *  - Circuit breaker (paused mode)
 *  - Fallback to last valid price (if feed fails but within fallback window)
 *
 *  === DESIGN PHILOSOPHY ===
 *  - `getPrice()` returns cached prices only (for gas efficiency).
 *  - `fetchAndUpdatePrice()` pulls fresh on-chain data (keeper or contract call).
 *  - UI / Subgraphs can use `isPriceFresh()` and `getPriceAge()` for safety checks.
 *
 */
contract Oracle is IOracle, Ownable {
    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    /// @notice Chainlink feed address per token.
    mapping(address => address) public chainlinkFeeds;

    /// @notice ERC4626 vault underlying token mapping.
    mapping(address => address) public erc4626Underlying;

    /// @notice Manual price overrides (scaled to 1e18).
    mapping(address => uint256) public manualPrices;

    /// @notice Manual mode flags.
    mapping(address => bool) public isManual;

    /// @notice Cache for last valid price lookup.
    mapping(address => LastValidPrice) public lastValidPrice;

    /// @notice Mapping to track vault rate bounds.
    mapping(address => VaultRateBounds) public vaultRateBounds;

    /// @notice Maximum staleness period for Chainlink feeds (seconds).
    uint256 public stalePeriod = Constants.ORACLE_DEFAULT_STALE_PERIOD;

    /// @notice Staleness tolerance for fallback prices (seconds).
    uint256 public fallbackStalePeriod =
        Constants.ORACLE_DEFAULT_STALE_PERIOD * 2;

    OracleMode public mode = OracleMode.NORMAL;

    /// @notice Recursion tracking for nested ERC4626 vaults.
    uint256 private _recursionDepth;

    /// @notice Array to track supported tokens.
    address[] public supportedTokens;

    /// @notice Mapping to track supported tokens.
    mapping(address => bool) public isSupported;

    // -----------------------------------------------------------------------
    // Constructor & Modifiers
    // -----------------------------------------------------------------------

    /**
     * @notice Deploys the Oracle contract.
     * @param _owner The address to assign as the owner (governance or deployer).
     */
    constructor(address _owner) Ownable(_owner) {
        if (_owner == address(0))
            revert ZeroAddress("Oracle:constructor", "owner");
    }

    /// @notice Ensures oracle is not paused.
    modifier whenNotPaused() {
        if (mode == OracleMode.PAUSED)
            revert OraclePaused(address(this), block.timestamp);
        _;
    }

    /// @notice Prevents infinite recursion when resolving nested ERC4626 vaults.
    modifier checkRecursion() {
        if (_recursionDepth >= Constants.MAX_RECURSION_DEPTH)
            revert RecursiveResolution(address(0));
        _recursionDepth++;
        _;
        _recursionDepth--;
    }

    // -----------------------------------------------------------------------
    // Admin / Configuration
    // -----------------------------------------------------------------------

    /**
     * @notice Switches oracle operating mode (NORMAL ↔ PAUSED).
     * @dev Paused mode halts all fetchAndUpdatePrice() calls.
     */
    function setOracleMode(OracleMode newMode) external onlyOwner {
        OracleMode oldMode = mode;
        mode = newMode;
        emit OracleModeChanged(oldMode, newMode);
    }

    /**
     * @notice Sets the maximum time (in seconds) a Chainlink feed value is valid.
     * @param period The new staleness threshold.
     * @dev Must lie within [Constants.ORACLE_MIN_STALE_PERIOD, Constants.ORACLE_MAX_STALE_PERIOD].
     */
    function setStalePeriod(uint256 period) external onlyOwner {
        if (
            period < Constants.ORACLE_MIN_STALE_PERIOD ||
            period > Constants.ORACLE_MAX_STALE_PERIOD
        ) revert InvalidStalePeriod(period);
        stalePeriod = period;
        emit StalePeriodUpdated(period);
    }

    /**
     * @notice Sets the fallback staleness tolerance for lastValidPrice().
     * @param period Maximum allowed seconds for fallback validity.
     * @dev Must be ≥ stalePeriod to remain meaningful.
     */
    function setFallbackStalePeriod(uint256 period) external onlyOwner {
        if (period < stalePeriod) revert InvalidStalePeriod(period);
        fallbackStalePeriod = period;
        emit FallbackStalePeriodUpdated(period);
    }

    /**
     * @notice Configures acceptable min/max conversion rates for a specific ERC4626 vault.
     * @param vault ERC4626 vault token address.
     * @param minRate Minimum acceptable rate (e.g., 0.2e18 = 0.2x).
     * @param maxRate Maximum acceptable rate (e.g., 3e18 = 3x).
     * @dev Prevents mispriced vaults or flash-manipulated convertToAssets().
     */
    function setVaultRateBounds(
        address vault,
        uint256 minRate,
        uint256 maxRate
    ) external onlyOwner {
        if (vault == address(0))
            revert ZeroAddress("Oracle:setVaultRateBounds", "vault");
        if (minRate == 0 || maxRate <= minRate || maxRate > 100e18)
            revert InvalidVaultBounds(vault, minRate, maxRate);

        vaultRateBounds[vault] = VaultRateBounds(minRate, maxRate);
        emit VaultRateBoundsSet(vault, minRate, maxRate);
    }

    /**
     * @notice Manually sets a price for a token, bounded by ±10% of last valid.
     * @param token Token address.
     * @param price Manual price in 1e18 precision.
     * @dev Enforces bounds if a valid recent price (< stalePeriod) exists.
     *      Enables manual mode until disabled.
     */
    function setManualPrice(
        address token,
        uint256 price
    ) external onlyOwner whenNotPaused {
        if (token == address(0))
            revert ZeroAddress("Oracle:setManualPrice", "token");
        if (
            price < Constants.ORACLE_MIN_ABSOLUTE_PRICE_WAD ||
            price > Constants.ORACLE_MAX_ABSOLUTE_PRICE_WAD
        ) revert InvalidManualPrice(token, price);

        LastValidPrice memory lv = lastValidPrice[token];
        if (lv.price > 0 && block.timestamp - lv.timestamp <= stalePeriod) {
            uint256 lowerBound = (lv.price *
                (Constants.WAD - Constants.ORACLE_MANUAL_PRICE_MAX_DELTA_WAD)) /
                Constants.WAD;
            uint256 upperBound = (lv.price *
                (Constants.WAD + Constants.ORACLE_MANUAL_PRICE_MAX_DELTA_WAD)) /
                Constants.WAD;
            if (price < lowerBound || price > upperBound)
                revert InvalidManualPrice(token, price);
        }

        manualPrices[token] = price;
        isManual[token] = true;
        lastValidPrice[token] = LastValidPrice(price, block.timestamp);

        emit ManualPriceSet(token, price);
        emit ManualModeEnabled(token, true);
        emit LastValidPriceUpdated(token, price, block.timestamp);
    }

    /**
     * @notice Disables manual pricing for a token.
     * @param token The token address.
     */
    function disableManualPrice(address token) external onlyOwner {
        if (token == address(0))
            revert ZeroAddress("Oracle:disableManualPrice", "token");
        isManual[token] = false;
        emit ManualModeEnabled(token, false);
    }

    /**
     * @notice Registers a Chainlink feed and validates its response.
     * @param token Asset token address.
     * @param feed Chainlink AggregatorV3 feed address.
     * @dev Ensures decimals ≤ 18 and feed returns a nonzero updatedAt value.
     */
    function setChainlinkFeed(address token, address feed) external onlyOwner {
        if (token == address(0) || feed == address(0))
            revert ZeroAddress("Oracle:setChainlinkFeed", "input");
        if (feed.code.length == 0) revert InvalidFeedContract(feed);

        AggregatorV3Interface agg = AggregatorV3Interface(feed);
        uint8 decimals = agg.decimals();
        if (decimals > 18) revert InvalidFeedDecimals(feed, decimals);

        try agg.latestRoundData() returns (
            uint80,
            int256 answer,
            uint256,
            uint256 updatedAt,
            uint80
        ) {
            if (answer <= 0 || updatedAt == 0) revert InvalidFeedContract(feed);
        } catch {
            revert InvalidFeedContract(feed);
        }

        chainlinkFeeds[token] = feed;
        isManual[token] = false;
        _addSupportedToken(token);
        emit ChainlinkFeedSet(token, feed);
    }

    /**
     * @notice Registers an ERC4626 vault and its underlying asset.
     * @param vault ERC4626 vault token.
     * @param underlying Reference underlying asset used for pricing.
     * @dev Does not enforce .asset() == underlying for flexibility
     *      (e.g., sUSDe → USDC pegging for depeg protection).
     */
    function setERC4626Vault(
        address vault,
        address underlying
    ) external onlyOwner {
        if (vault == address(0) || underlying == address(0))
            revert ZeroAddress("Oracle:setERC4626Vault", "input");
        try IERC4626(vault).asset() returns (address) {} catch {
            revert("Invalid ERC4626 vault");
        }
        erc4626Underlying[vault] = underlying;
        _addSupportedToken(vault);
        emit ERC4626Registered(vault, underlying);
    }

    // -----------------------------------------------------------------------
    // External / Public API
    // -----------------------------------------------------------------------

    /**
     * @notice Returns the cached price for a token (1e18 precision).
     * @dev Reverts if no valid price or if staleness > stalePeriod.
     * @param token Asset token address.
     * @return price Cached price in 1e18 precision.
     */
    function getPrice(address token) external view returns (uint256 price) {
        if (token == address(0)) revert ZeroAddress("Oracle:getPrice", "token");
        LastValidPrice memory lv = lastValidPrice[token];
        if (lv.price == 0) revert NoFallbackPrice(token);
        if (!this.isPriceFresh(token))
            revert StalePrice(token, lv.timestamp, block.timestamp);
        return lv.price;
    }

    /**
     * @notice Fetches, resolves, and caches the latest token price.
     * @param token Asset token address.
     * @return price Fresh price in 1e18 precision.
     * @dev Pulls live data from Chainlink or ERC4626 vaults.
     *      Should be called by protocol keepers or critical functions.
     */
    function fetchAndUpdatePrice(
        address token
    ) external whenNotPaused returns (uint256) {
        if (token == address(0))
            revert ZeroAddress("Oracle:fetchAndUpdatePrice", "token");
        return _fetchAndUpdatePrice(token);
    }

    /**
     * @notice Returns age of last cached price in seconds.
     * @param token Token address.
     * @return age Time since lastValidPrice update.
     */
    function getPriceAge(address token) external view returns (uint256 age) {
        LastValidPrice memory lv = lastValidPrice[token];
        if (lv.timestamp == 0) return type(uint256).max;
        return block.timestamp - lv.timestamp;
    }

    /**
     * @notice Checks if cached price is within freshness threshold.
     * @param token Token address.
     * @return isFresh True if price updated ≤ stalePeriod ago.
     */
    function isPriceFresh(address token) external view returns (bool isFresh) {
        LastValidPrice memory lv = lastValidPrice[token];
        return (lv.timestamp != 0 &&
            block.timestamp - lv.timestamp <= stalePeriod);
    }

    /**
     * @notice Returns the list of all supported token addresses.
     * @dev The returned array is stored in contract state and may grow over time
     *      as new tokens are registered via admin configuration functions.
     * @return tokens An array of all currently supported token addresses.
     */
    function getSupportedTokens()
        external
        view
        returns (address[] memory tokens)
    {
        return supportedTokens;
    }

    // -----------------------------------------------------------------------
    // Internal Helpers
    // -----------------------------------------------------------------------

    /**
     * @notice Resolves the fair price of an ERC4626 vault share.
     * @param vault ERC4626 vault token address.
     * @param underlying Underlying asset used for valuation.
     * @return price Vault share price (1e18 precision).
     * @dev Derives price via convertToAssets() * underlying price.
     *      Ensures vault rate lies within acceptable bounds.
     */
    function _getVaultPrice(
        address vault,
        address underlying
    ) internal checkRecursion returns (uint256 price) {
        uint8 shareDecimals = IERC20Metadata(vault).decimals();
        uint8 underlyingDecimals = IERC20Metadata(underlying).decimals();

        uint256 oneShare = 10 ** shareDecimals;
        uint256 assetsPerShare = IERC4626(vault).convertToAssets(oneShare);
        if (assetsPerShare == 0 || assetsPerShare > 1e36)
            revert InvalidVaultExchangeRate(vault, assetsPerShare);

        uint256 scaledAssets = (assetsPerShare * Constants.WAD) /
            (10 ** underlyingDecimals);
        uint256 scaledShare = (oneShare * Constants.WAD) /
            (10 ** shareDecimals);
        uint256 rate = (scaledAssets * Constants.WAD) / scaledShare;

        VaultRateBounds memory bounds = vaultRateBounds[vault];
        uint256 minRate = bounds.minRate == 0
            ? Constants.ORACLE_MIN_VAULT_RATE_WAD
            : bounds.minRate;
        uint256 maxRate = bounds.maxRate == 0
            ? Constants.ORACLE_MAX_VAULT_RATE_WAD
            : bounds.maxRate;
        if (rate > maxRate || rate < minRate)
            revert SuspiciousVaultRate(vault, rate);

        uint256 underlyingPrice = resolvePrice(underlying);
        return (underlyingPrice * rate) / Constants.WAD;
    }

    /**
     * @notice Fetches and validates the latest Chainlink feed price.
     * @param feed The address of the Chainlink AggregatorV3 feed.
     * @return price The normalized price (1e18 precision).
     * @return valid Boolean indicating whether the feed result is valid.
     *
     * @dev
     *  - Fetches `latestRoundData()` from the feed.
     *  - Checks for nonzero `answer` and `updatedAt` values.
     *  - Rejects stale prices older than `stalePeriod`.
     *  - Normalizes feed decimals to 18.
     *  - Ensures price lies within absolute oracle bounds.
     *
     *  If any condition fails or the feed call reverts, returns `(0, false)`.
     */
    function _getChainlinkPrice(
        address feed
    ) internal view returns (uint256 price, bool valid) {
        try AggregatorV3Interface(feed).latestRoundData() returns (
            uint80,
            int256 answer,
            uint256,
            uint256 updatedAt,
            uint80
        ) {
            if (
                answer <= 0 ||
                updatedAt == 0 ||
                block.timestamp - updatedAt > stalePeriod
            ) return (0, false);

            uint8 feedDecimals = AggregatorV3Interface(feed).decimals();
            uint256 raw = uint256(answer);

            // normalize to 1e18
            uint256 clPrice = feedDecimals == 18
                ? raw
                : feedDecimals < 18
                    ? raw * (10 ** (18 - feedDecimals))
                    : raw / (10 ** (feedDecimals - 18));

            if (
                clPrice < Constants.ORACLE_MIN_ABSOLUTE_PRICE_WAD ||
                clPrice > Constants.ORACLE_MAX_ABSOLUTE_PRICE_WAD
            ) return (0, false);

            return (clPrice, true);
        } catch {
            return (0, false);
        }
    }

    /**
     * @notice Resolves a token's price using manual, ERC4626, or Chainlink sources.
     * @param token Token to resolve.
     * @return price Resolved fair price in 1e18 precision.
     * @dev May trigger state updates if underlying vaults are resolved.
     */
    function resolvePrice(address token) public returns (uint256 price) {
        if (isManual[token]) return manualPrices[token];

        address underlying = erc4626Underlying[token];
        if (underlying != address(0)) return _getVaultPrice(token, underlying);

        address feed = chainlinkFeeds[token];
        if (feed == address(0)) revert NoPriceFeed(token);

        (uint256 clPrice, bool valid) = _getChainlinkPrice(feed);
        if (valid) return clPrice;

        LastValidPrice memory lv = lastValidPrice[token];
        if (lv.price == 0) revert NoFallbackPrice(token);
        if (block.timestamp - lv.timestamp > fallbackStalePeriod)
            revert StaleFallback(token);

        emit OracleFallbackUsed(
            token,
            lv.price,
            block.timestamp,
            "Chainlink failure"
        );
        return lv.price;
    }

    /**
     * @notice Fetches, validates, and stores the latest token price.
     * @param token Token address.
     * @return price Resolved and persisted price (1e18 precision).
     * @dev Updates lastValidPrice mapping and emits event.
     */
    function _fetchAndUpdatePrice(
        address token
    ) internal returns (uint256 price) {
        price = resolvePrice(token);
        if (
            price < Constants.ORACLE_MIN_ABSOLUTE_PRICE_WAD ||
            price > Constants.ORACLE_MAX_ABSOLUTE_PRICE_WAD
        ) revert InvalidOraclePrice(token, address(0));

        lastValidPrice[token] = LastValidPrice(price, block.timestamp);
        emit LastValidPriceUpdated(token, price, block.timestamp);
        return price;
    }

    /**
     * @notice Adds a token to the supported tokens list if not already present.
     * @dev
     *  - Internal helper to register newly configured assets.
     *  - Ensures uniqueness via `isSupported` mapping.
     *  - Called from setup functions such as `setChainlinkFeed` or `setERC4626Vault`.
     * @param token The address of the token to add.
     *
     * Emits a {TokenSupportAdded} event upon successful addition.
     */
    function _addSupportedToken(address token) internal {
        if (!isSupported[token]) {
            supportedTokens.push(token);
            isSupported[token] = true;
            emit TokenSupportAdded(token);
        }
    }
}

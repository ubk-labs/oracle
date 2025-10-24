# Oracle

The **Oracle** contract provides a unified, gas-efficient, and reliable pricing mechanism for the **UNBRK / Clear.Fi** protocol. It aggregates on-chain data from three primary sources — **manual governance overrides**, **ERC-4626 vault conversions**, and **Chainlink price feeds** — to produce normalized `1e18` asset prices for both ERC-20 tokens and yield-bearing vaults (e.g., sDAI, sFRAX, sUSDe).

The Oracle enforces strict safety guarantees, including staleness thresholds, recursion depth limits, vault rate bounds, and fallback logic. It is designed to operate safely in production environments under a capped-V1 model while remaining modular and extensible for future integrations.

---

## Build Instructions

1. **Install dependencies**
   ```
   npm install
   ```

2. **Compile contracts**
   ```
   npx hardhat compile
   ```

3. **Run tests**
   ```
   npx hardhat test
   ```

---

## Learn More

For detailed documentation, including architecture, configuration parameters, and integration examples, see the **[Wiki](../../wiki)**.

---

**License:** MIT

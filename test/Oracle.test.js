const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Oracle", function () {
  let deployer, user, oracle, usdc, dai, sdai, feed;

  before(async () => {
    [deployer, user] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const Oracle = await ethers.getContractFactory("Oracle");
    oracle = await Oracle.deploy(deployer.address);

    // Mock ERC20 tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6, ethers.parseUnits("1000000", 6));
    dai = await MockERC20.deploy("DAI Stablecoin", "DAI", 18, ethers.parseUnits("1000000", 18));

    // Mock ERC4626 vault (sDAI)
    const Mock4626 = await ethers.getContractFactory("Mock4626");
    const mockRate = ethers.parseUnits("1.02", 18); // simulate 2% yield
    sdai = await Mock4626.deploy("Savings DAI", "sDAI", 18, ethers.parseUnits("1000000", 18), dai.target);
    await sdai.setExchangeRate(mockRate);

    // Mock Chainlink feed (8 decimals)
    const MockAggregator = await ethers.getContractFactory("MockAggregatorV3");
    feed = await MockAggregator.deploy(1e8, 8); // $1.00
  });

  // --- Constructor ---
  describe("Constructor", function () {
    it("should revert if owner is zero address (via Ownable)", async () => {
      const Oracle = await ethers.getContractFactory("Oracle");
      await expect(Oracle.deploy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(Oracle, "OwnableInvalidOwner");
    });
  });


  describe("Admin", function () {
    // --- setChainlinkFeed ---
    describe("setChainlinkFeed", function () {
      it("should allow owner to set feed", async () => {
        await expect(oracle.connect(deployer).setChainlinkFeed(usdc.target, feed.target))
          .to.emit(oracle, "ChainlinkFeedSet")
          .withArgs(usdc.target, feed.target);

        expect(await oracle.chainlinkFeeds(usdc.target)).to.equal(feed.target);
      });

      it("should update lastValidPrice when fetchAndUpdatePrice is called", async () => {
        await oracle.setChainlinkFeed(usdc.target, feed.target);

        // Call fetchAndUpdatePrice()
        const tx = await oracle.fetchAndUpdatePrice(usdc.target);
        const receipt = await tx.wait();

        // --- verify return value ---
        const price = await oracle.getPrice(usdc.target);
        expect(price).to.equal(ethers.parseUnits("1", 18));

        // --- verify lastValidPrice updated ---
        const last = await oracle.lastValidPrice(usdc.target);
        expect(last.price).to.equal(price);
        expect(last.timestamp).to.be.gt(0);

        // --- verify event emitted ---
        await expect(oracle.fetchAndUpdatePrice(usdc.target))
          .to.emit(oracle, "LastValidPriceUpdated")
          .withArgs(usdc.target, ethers.parseUnits("1", 18), anyValue);
      });

      it("should reset manual mode when feed is set", async () => {
        await oracle.setManualPrice(usdc.target, ethers.parseUnits("2", 18));
        expect(await oracle.isManual(usdc.target)).to.be.true;

        await oracle.setChainlinkFeed(usdc.target, feed.target);
        expect(await oracle.isManual(usdc.target)).to.be.false;
      });

      it("should revert if token is zero", async () => {
        await expect(oracle.setChainlinkFeed(ethers.ZeroAddress, feed.target))
          .to.be.revertedWithCustomError(oracle, "ZeroAddress");
      });

      it("should revert if feed is zero", async () => {
        await expect(oracle.setChainlinkFeed(usdc.target, ethers.ZeroAddress))
          .to.be.revertedWithCustomError(oracle, "ZeroAddress");
      });

      it("should not allow non-owner to set feed", async () => {
        await expect(oracle.connect(user).setChainlinkFeed(usdc.target, feed.target))
          .to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
      });
    });

    // --- setERC4626Vault ---
    describe("setERC4626Vault", function () {
      it("should register vault and underlying", async () => {
        await expect(oracle.setERC4626Vault(sdai.target, dai.target))
          .to.emit(oracle, "ERC4626Registered")
          .withArgs(sdai.target, dai.target);

        expect(await oracle.erc4626Underlying(sdai.target)).to.equal(dai.target);
      });

      it("should revert if vault is zero", async () => {
        await expect(oracle.setERC4626Vault(ethers.ZeroAddress, dai.target))
          .to.be.revertedWithCustomError(oracle, "ZeroAddress");
      });

      it("should revert if underlying is zero", async () => {
        await expect(oracle.setERC4626Vault(sdai.target, ethers.ZeroAddress))
          .to.be.revertedWithCustomError(oracle, "ZeroAddress");
      });

      it("should not allow non-owner to call", async () => {
        await expect(oracle.connect(user).setERC4626Vault(sdai.target, dai.target))
          .to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
      });
    });

    describe("setManualPrice()", function () {
      it("should allow owner to set a manual price", async () => {
        const manualPrice = ethers.parseUnits("2", 18);

        await expect(oracle.setManualPrice(usdc.target, manualPrice))
          .to.emit(oracle, "ManualPriceSet")
          .withArgs(usdc.target, manualPrice);

        expect(await oracle.manualPrices(usdc.target)).to.equal(manualPrice);
        expect(await oracle.isManual(usdc.target)).to.be.true;
      });

      it("should emit ManualModeEnabled when enabling manual price mode", async () => {
        const manualPrice = ethers.parseUnits("5", 18);

        await expect(oracle.setManualPrice(usdc.target, manualPrice))
          .to.emit(oracle, "ManualModeEnabled")
          .withArgs(usdc.target, true);
      });

      it("should revert if token address is zero", async () => {
        await expect(
          oracle.setManualPrice(ethers.ZeroAddress, ethers.parseUnits("1", 18))
        ).to.be.revertedWithCustomError(oracle, "ZeroAddress");
      });

      it("should revert if price is zero", async () => {
        await expect(
          oracle.setManualPrice(usdc.target, 0)
        ).to.be.revertedWithCustomError(oracle, "InvalidManualPrice");
      });

      it("should overwrite existing manual price when called again", async () => {
        const firstPrice = ethers.parseUnits("1", 18);
        const newPrice = ethers.parseUnits("1.10", 18);

        await oracle.setManualPrice(usdc.target, firstPrice);
        await oracle.setManualPrice(usdc.target, newPrice);

        expect(await oracle.manualPrices(usdc.target)).to.equal(newPrice);
      });

      it("should revert if manual price deviates >10% from last valid price", async () => {
        await oracle.setChainlinkFeed(usdc.target, feed.target);
        await oracle.fetchAndUpdatePrice(usdc.target); // establishes baseline = $1
        const invalidHigh = ethers.parseUnits("1.20", 18); // +20%
        await expect(oracle.setManualPrice(usdc.target, invalidHigh))
          .to.be.revertedWithCustomError(oracle, "InvalidManualPrice");
      });

      it("should disable manual mode and emit event", async () => {
        await oracle.setManualPrice(usdc.target, ethers.parseUnits("2", 18));
        await expect(oracle.disableManualPrice(usdc.target))
          .to.emit(oracle, "ManualModeEnabled")
          .withArgs(usdc.target, false);
        expect(await oracle.isManual(usdc.target)).to.be.false;
      });

      describe("disableManualPrice()", function () {
        beforeEach(async () => {
          // Ensure manual mode is active before disabling
          await oracle.setManualPrice(usdc.target, ethers.parseUnits("1.00", 18));
          expect(await oracle.isManual(usdc.target)).to.be.true;
        });

        it("should allow owner to disable manual mode", async () => {
          await expect(oracle.disableManualPrice(usdc.target))
            .to.emit(oracle, "ManualModeEnabled")
            .withArgs(usdc.target, false);

          expect(await oracle.isManual(usdc.target)).to.be.false;
        });

        it("should disable manual mode and emit event", async () => {
          await oracle.setManualPrice(usdc.target, ethers.parseUnits("0.93", 18));
          await expect(oracle.disableManualPrice(usdc.target))
            .to.emit(oracle, "ManualModeEnabled")
            .withArgs(usdc.target, false);
          expect(await oracle.isManual(usdc.target)).to.be.false;
        });

        it("should still maintain the manual price mapping after disablement", async () => {
          await oracle.disableManualPrice(usdc.target);
          const price = await oracle.manualPrices(usdc.target);
          expect(price).to.equal(ethers.parseUnits("1.00", 18));
        });

        it("should revert if token is zero address", async () => {
          await expect(oracle.disableManualPrice(ethers.ZeroAddress))
            .to.be.revertedWithCustomError(oracle, "ZeroAddress");
        });

        it("should not allow non-owner to disable manual mode", async () => {
          await expect(oracle.connect(user).disableManualPrice(usdc.target))
            .to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
        });
      });

    });

    describe("setStalePeriod()", function () {
      it("should allow owner to update the stale period", async () => {
        const newPeriod = 7200; // 2 hours

        await expect(oracle.setStalePeriod(newPeriod))
          .to.emit(oracle, "StalePeriodUpdated")
          .withArgs(newPeriod);

        expect(await oracle.stalePeriod()).to.equal(newPeriod);
      });

      it("should overwrite stalePeriod if called multiple times", async () => {
        const firstPeriod = 3600;
        const secondPeriod = 3600 * 3;

        await oracle.setStalePeriod(firstPeriod);
        await oracle.setStalePeriod(secondPeriod);

        expect(await oracle.stalePeriod()).to.equal(secondPeriod);
      });

      it("should revert if non-owner tries to update stale period", async () => {
        await expect(
          oracle.connect(user).setStalePeriod(9999)
        ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
      });

      it("should revert if stalePeriod < 1h or > 3h", async () => {
        await expect(oracle.setStalePeriod(3599))
          .to.be.revertedWithCustomError(oracle, "InvalidStalePeriod");
        await expect(oracle.setStalePeriod(10801))
          .to.be.revertedWithCustomError(oracle, "InvalidStalePeriod");
      });
    });

    describe("setOracleMode()", function () {
      it("should allow owner to change mode from NORMAL to PAUSED", async () => {
        const PAUSED = 1; // enum OracleMode.PAUSED
        const NORMAL = 0;

        await expect(oracle.setOracleMode(PAUSED))
          .to.emit(oracle, "OracleModeChanged")
          .withArgs(NORMAL, PAUSED);

        expect(await oracle.mode()).to.equal(PAUSED);
      });

      it("should allow switching back from PAUSED to NORMAL", async () => {
        const PAUSED = 1;
        const NORMAL = 0;

        await oracle.setOracleMode(PAUSED);

        await expect(oracle.setOracleMode(NORMAL))
          .to.emit(oracle, "OracleModeChanged")
          .withArgs(PAUSED, NORMAL);

        expect(await oracle.mode()).to.equal(NORMAL);
      });

      it("should revert if called by non-owner", async () => {
        const PAUSED = 1;
        await expect(oracle.connect(user).setOracleMode(PAUSED))
          .to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount")
          .withArgs(user.address);
      });
    });

    describe("setFallbackStalePeriod()", function () {
      it("should allow owner to set fallback stale period ≥ stalePeriod", async () => {
        const stale = 3600; // 1 hour
        const fallback = 5400; // 1.5 hours

        await oracle.setStalePeriod(stale);
        await expect(oracle.setFallbackStalePeriod(fallback))
          .to.emit(oracle, "FallbackStalePeriodUpdated")
          .withArgs(fallback);

        expect(await oracle.fallbackStalePeriod()).to.equal(fallback);
      });

      it("should revert if fallback period < stalePeriod", async () => {
        await oracle.setStalePeriod(7200); // 2 hours
        await expect(oracle.setFallbackStalePeriod(3600))
          .to.be.revertedWithCustomError(oracle, "InvalidStalePeriod");
      });

      it("should revert if called by non-owner", async () => {
        await expect(
          oracle.connect(user).setFallbackStalePeriod(4000)
        ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
      });
    });

    describe("setVaultRateBounds()", function () {
      const min = ethers.parseUnits("0.5", 18);
      const max = ethers.parseUnits("2", 18);
      const defaultMin = ethers.parseUnits("0.2", 18); // from Constants.DEFAULT_MIN_VAULT_RATE
      const defaultMax = ethers.parseUnits("3", 18);   // from Constants.DEFAULT_MAX_VAULT_RATE

      it("should allow owner to set min and max bounds for a vault", async () => {
        await expect(oracle.setVaultRateBounds(sdai.target, min, max))
          .to.emit(oracle, "VaultRateBoundsSet")
          .withArgs(sdai.target, min, max);

        const bounds = await oracle.vaultRateBounds(sdai.target);
        expect(bounds.minRate).to.equal(min);
        expect(bounds.maxRate).to.equal(max);
      });

      it("should revert if vault is zero address", async () => {
        await expect(
          oracle.setVaultRateBounds(ethers.ZeroAddress, min, max)
        ).to.be.revertedWithCustomError(oracle, "ZeroAddress");
      });

      it("should revert if min is zero", async () => {
        await expect(
          oracle.setVaultRateBounds(sdai.target, 0, max)
        ).to.be.revertedWithCustomError(oracle, "InvalidVaultBounds");
      });

      it("should revert if max ≤ min", async () => {
        await expect(
          oracle.setVaultRateBounds(sdai.target, max, min)
        ).to.be.revertedWithCustomError(oracle, "InvalidVaultBounds");
      });

      it("should revert if max > 100e18", async () => {
        const hugeMax = ethers.parseUnits("101", 18); // exceeds hardcoded limit
        await expect(
          oracle.setVaultRateBounds(sdai.target, min, hugeMax)
        ).to.be.revertedWithCustomError(oracle, "InvalidVaultBounds");
      });

      it("should revert if called by non-owner", async () => {
        await expect(
          oracle.connect(user).setVaultRateBounds(sdai.target, min, max)
        ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
      });

      it("should use default min/max bounds in _getVaultPrice() if none are set", async () => {
        // Only set ERC4626 mapping and feed for underlying
        await oracle.setERC4626Vault(sdai.target, dai.target);
        await oracle.setChainlinkFeed(dai.target, feed.target);

        // Now fetch and verify that the defaults are accepted (rate = 1.02)
        const tx = await oracle.fetchAndUpdatePrice(sdai.target);
        const receipt = await tx.wait();

        const price = await oracle.getPrice(sdai.target);
        expect(price).to.equal(ethers.parseUnits("1.02", 18));

        // Internally this passes: defaultMin = 0.2e18, defaultMax = 3e18
      });
    });

  })

  describe("External API", function () {

  })
});

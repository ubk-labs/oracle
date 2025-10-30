const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Mock4626", function () {
    let deployer, user;
    let underlying, vault;

    beforeEach(async () => {
        [deployer, user] = await ethers.getSigners();

        // Deploy underlying token (6 decimals like USDC)
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        underlying = await MockERC20.deploy("USD Coin", "USDC", 6, 0);

        // Mint some underlying to user
        await underlying.mint(user.address, ethers.parseUnits("1000", 6));

        // Deploy Mock4626 vault (18 decimals)
        const Mock4626 = await ethers.getContractFactory("Mock4626");
        vault = await Mock4626.deploy(
            "Savings DAI",
            "sDAI",
            18,
            ethers.parseUnits("0", 18),
            underlying.target
        );

        // Default exchangeRate = 1e18 (1:1)
        await vault.setExchangeRate(ethers.parseUnits("1", 18));
    });

    describe("Constructor", function () {
        it("should return correct underlying asset address", async () => {
            expect(await vault.asset()).to.equal(underlying.target);
        });

    })

    describe("deposit()", function () {
        it("should handle vault and asset both 18 decimals (no normalization)", async () => {
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const erc18 = await MockERC20.deploy("Mock18", "M18", 18, 0);

            const Mock4626 = await ethers.getContractFactory("Mock4626");
            const vault18 = await Mock4626.deploy(
                "Vault18",
                "v18",
                18,
                0,
                erc18.target
            );

            await erc18.mint(user.address, ethers.parseUnits("1000", 18));
            await erc18.connect(user).approve(vault18.target, ethers.parseUnits("1000", 18));

            await vault18.connect(user).deposit(ethers.parseUnits("100", 18), user.address);
            const shares = await vault18.balanceOf(user.address);

            expect(shares).to.equal(ethers.parseUnits("100", 18));
            expect(await vault18.convertToAssets(shares)).to.equal(ethers.parseUnits("100", 18));
        });

        it("should update vault’s underlying balance after deposit", async () => {
            const depositAmount = ethers.parseUnits("10", 6);
            await underlying.connect(user).approve(vault.target, depositAmount);

            await vault.connect(user).deposit(depositAmount, user.address);

            const vaultUnderlyingBalance = await underlying.balanceOf(vault.target);
            expect(vaultUnderlyingBalance).to.equal(depositAmount);
        });

        it("should revert on zero deposit", async () => {
            await expect(
                vault.connect(user).deposit(0, user.address)
            ).to.be.revertedWith("Zero deposit");
        });

        it("should handle vault 18d, asset 6d (already covered, check round-trip)", async () => {
            await underlying.mint(user.address, ethers.parseUnits("123456", 6));

            const depositAmount = ethers.parseUnits("123456", 6); // 123,456 USDC
            await underlying.connect(user).approve(vault.target, depositAmount);
            await vault.connect(user).deposit(depositAmount, user.address);

            const shares = await vault.balanceOf(user.address);
            const assets = await vault.convertToAssets(shares);

            // Round-trip equality
            expect(assets).to.equal(depositAmount);
        });

        it("should handle vault 6d, asset 18d", async () => {
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const erc18 = await MockERC20.deploy("Mock18", "M18", 18, 0);

            const Mock4626 = await ethers.getContractFactory("Mock4626");
            const vault6 = await Mock4626.deploy(
                "Vault6",
                "v6",
                6,
                0,
                erc18.target
            );

            await erc18.mint(user.address, ethers.parseUnits("1", 18)); // 1 token
            await erc18.connect(user).approve(vault6.target, ethers.parseUnits("1", 18));

            await vault6.connect(user).deposit(ethers.parseUnits("1", 18), user.address);
            const shares = await vault6.balanceOf(user.address);

            // shares minted in 6 decimals
            expect(shares).to.equal(ethers.parseUnits("1", 6));

            // round-trip back to 18 decimals
            const assets = await vault6.convertToAssets(shares);
            expect(assets).to.equal(ethers.parseUnits("1", 18));
        });

        it("should handle tiny deposit (dust rounding)", async () => {
            const dustAmount = 1n; // 1 unit of 6-decimal USDC
            await underlying.connect(user).approve(vault.target, dustAmount);
            await vault.connect(user).deposit(dustAmount, user.address);

            const shares = await vault.balanceOf(user.address);
            expect(shares).to.be.gt(0);

            const assets = await vault.convertToAssets(shares);
            expect(assets).to.be.lte(dustAmount); // rounding down possible
        });

        it("should handle large deposit without overflow", async () => {
            const bigAmount = ethers.parseUnits("1000000000", 6); // 1 billion USDC
            await underlying.mint(user.address, bigAmount);
            await underlying.connect(user).approve(vault.target, bigAmount);

            await expect(vault.connect(user).deposit(bigAmount, user.address)).to.not.be.reverted;
            const shares = await vault.balanceOf(user.address);
            expect(shares).to.be.gt(0);
        });

        it("should mint 18d shares for 6d deposits at 1:1 exchange rate", async () => {
            const depositAmount = ethers.parseUnits("100", 6); // 100 USDC
            await underlying.connect(user).approve(vault.target, depositAmount);

            // Deposit 100 USDC → expect 100 shares (18 decimals)
            const tx = await vault.connect(user).deposit(depositAmount, user.address);
            const receipt = await tx.wait();

            const balance = await vault.balanceOf(user.address);
            expect(balance).to.equal(ethers.parseUnits("100", 18));
        });
    });

    describe("setExchangeRate()", function () {
        it("should handle exchangeRate < 1e18 (0.5x)", async () => {
            await vault.setExchangeRate(ethers.parseUnits("0.5", 18)); // 0.5
            const depositAmount = ethers.parseUnits("100", 6); // 100 USDC
            await underlying.connect(user).approve(vault.target, depositAmount);

            // 100 assets → 200 shares
            await vault.connect(user).deposit(depositAmount, user.address);
            const shares = await vault.balanceOf(user.address);
            expect(shares).to.equal(ethers.parseUnits("200", 18));

            // convertToAssets should map back to 100 USDC
            const assets = await vault.convertToAssets(shares);
            expect(assets).to.equal(depositAmount);
        });

        it("should handle exchangeRate > 1e18 (2x)", async () => {
            await vault.setExchangeRate(ethers.parseUnits("2", 18)); // 2.0
            const depositAmount = ethers.parseUnits("100", 6);
            await underlying.connect(user).approve(vault.target, depositAmount);

            // 100 assets → 50 shares
            await vault.connect(user).deposit(depositAmount, user.address);
            const shares = await vault.balanceOf(user.address);
            expect(shares).to.equal(ethers.parseUnits("50", 18));

            const assets = await vault.convertToAssets(shares);
            expect(assets).to.equal(depositAmount);
        });

        it("should handle non-round exchangeRate (1.2345x)", async () => {
            const rate = ethers.parseUnits("1.2345", 18);
            await vault.setExchangeRate(rate);

            const depositAmount = ethers.parseUnits("1000", 6); // 1000 USDC
            await underlying.connect(user).approve(vault.target, depositAmount);

            // Deposit → get shares
            await vault.connect(user).deposit(depositAmount, user.address);
            const shares = await vault.balanceOf(user.address);

            // Manual expected shares (with integer math)
            const vaultDecimals = await vault.decimals();
            const assetDecimals = await underlying.decimals();
            const normalizedAssets =
                (depositAmount * 10n ** BigInt(vaultDecimals)) /
                (10n ** BigInt(assetDecimals));
            const expectedShares = (normalizedAssets * 10n ** 18n) / rate;

            // Allow off-by-1 tolerance due to integer truncation
            expect(
                shares === expectedShares || shares === expectedShares + 1n
            ).to.be.true;

            // Round-trip check: convert shares → assets should be close to original
            const assets = await vault.convertToAssets(shares);

            // Difference should be <= 1 unit of underlying
            const diff = assets > depositAmount ? assets - depositAmount : depositAmount - assets;
            expect(diff).to.be.lte(1n);
        });

        it("should handle very high exchangeRate (10x)", async () => {
            await vault.setExchangeRate(ethers.parseUnits("10", 18));
            const depositAmount = ethers.parseUnits("500", 6);
            await underlying.connect(user).approve(vault.target, depositAmount);

            // 500 assets → 50 shares
            await vault.connect(user).deposit(depositAmount, user.address);
            const shares = await vault.balanceOf(user.address);
            expect(shares).to.equal(ethers.parseUnits("50", 18));

            const assets = await vault.convertToAssets(shares);
            expect(assets).to.equal(depositAmount);
        });

        it("should handle tiny exchangeRate (1e-6)", async () => {
            await vault.setExchangeRate(ethers.parseUnits("0.000001", 18)); // 1e-6
            const depositAmount = ethers.parseUnits("1", 6); // 1 USDC
            await underlying.connect(user).approve(vault.target, depositAmount);

            // 1 USDC → 1,000,000 shares
            await vault.connect(user).deposit(depositAmount, user.address);
            const shares = await vault.balanceOf(user.address);
            expect(shares).to.equal(ethers.parseUnits("1000000", 18));

            const assets = await vault.convertToAssets(shares);
            expect(assets).to.equal(depositAmount);
        });

        it("should scale shares correctly if exchange rate changes", async () => {
            const depositAmount = ethers.parseUnits("100", 6); // 100 USDC
            await underlying.connect(user).approve(vault.target, depositAmount);

            // Set exchange rate = 2 USDC per share
            await vault.setExchangeRate(ethers.parseUnits("2", 18));

            // Deposit 100 USDC → expect 50 shares
            await vault.connect(user).deposit(depositAmount, user.address);

            const balance = await vault.balanceOf(user.address);
            expect(balance).to.equal(ethers.parseUnits("50", 18));
        });
    });

    describe("convertToAssets() <-> convertToShares()", function () {
        it("should return 0 when input is 0", async () => {
            expect(await vault.convertToAssets(0)).to.equal(0);
            expect(await vault.convertToShares(0)).to.equal(0);
        });

        it("should mint fewer shares than assets when exchangeRate > 1e18", async () => {
            // Set exchange rate = 1.5 (each share worth 1.5 underlying)
            await vault.setExchangeRate(ethers.parseUnits("1.5", 18));

            const depositAmount = ethers.parseUnits("1000", 6); // 1,000 USDC
            await underlying.mint(user.address, depositAmount);
            await underlying.connect(user).approve(vault.target, depositAmount);

            // Deposit and check shares
            await vault.connect(user).deposit(depositAmount, user.address);
            const shares = await vault.balanceOf(user.address);

            // Convert assets into 18d for comparison
            const vaultDecimals = await vault.decimals();
            const assetDecimals = await underlying.decimals();
            const normalizedAssets =
                (depositAmount * 10n ** BigInt(vaultDecimals)) /
                (10n ** BigInt(assetDecimals));

            expect(shares).to.be.lt(normalizedAssets); // shares strictly less than assets
        });



        it("should correctly convert shares → assets", async () => {
            const depositAmount = ethers.parseUnits("200", 6); // 200 USDC
            await underlying.connect(user).approve(vault.target, depositAmount);

            await vault.connect(user).deposit(depositAmount, user.address);

            const shares = await vault.balanceOf(user.address);
            const assets = await vault.convertToAssets(shares);

            // With 1:1 rate, expect assets = 200e6
            expect(assets).to.equal(depositAmount);
        });

        it("should round-trip correctly at 1:1 exchange rate", async () => {
            const assets = ethers.parseUnits("100", 6); // 100 USDC
            const shares = await vault.convertToShares(assets);
            const backToAssets = await vault.convertToAssets(shares);

            // Assets → Shares → Assets should be within ±1
            const diff = assets > backToAssets ? assets - backToAssets : backToAssets - assets;
            expect(diff).to.lte(1n);
        });

        it("should round-trip correctly when exchangeRate < 1 (0.5x)", async () => {
            await vault.setExchangeRate(ethers.parseUnits("0.5", 18));
            const assets = ethers.parseUnits("100", 6);

            const shares = await vault.convertToShares(assets);
            const backToAssets = await vault.convertToAssets(shares);

            const diff = assets > backToAssets ? assets - backToAssets : backToAssets - assets;
            expect(diff).to.lte(1n);
        });

        it("should round-trip correctly when exchangeRate > 1 (2x)", async () => {
            await vault.setExchangeRate(ethers.parseUnits("2", 18));
            const assets = ethers.parseUnits("100", 6);

            const shares = await vault.convertToShares(assets);
            const backToAssets = await vault.convertToAssets(shares);

            const diff = assets > backToAssets ? assets - backToAssets : backToAssets - assets;
            expect(diff).to.lte(1n);
        });

        it("should round-trip correctly with non-round exchangeRate (1.2345x)", async () => {
            const rate = ethers.parseUnits("1.2345", 18);
            await vault.setExchangeRate(rate);

            const assets = ethers.parseUnits("1000", 6);
            const shares = await vault.convertToShares(assets);
            const backToAssets = await vault.convertToAssets(shares);

            const diff = assets > backToAssets ? assets - backToAssets : backToAssets - assets;
            expect(diff).to.lte(1n);
        });

        it("should handle dust assets (1 unit)", async () => {
            const assets = 1n; // smallest possible USDC unit
            const shares = await vault.convertToShares(assets);
            expect(shares).to.be.gt(0);

            const backToAssets = await vault.convertToAssets(shares);
            expect(backToAssets).to.be.lte(assets);
        });

        it("should handle very large assets safely", async () => {
            const assets = ethers.parseUnits("1000000000", 6); // 1 billion USDC
            const shares = await vault.convertToShares(assets);
            const backToAssets = await vault.convertToAssets(shares);

            const diff = assets > backToAssets ? assets - backToAssets : backToAssets - assets;
            expect(diff).to.lte(1n);
        });
    });

});

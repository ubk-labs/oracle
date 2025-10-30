const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockERC20", function () {
    let deployer, user, other;
    let token;

    beforeEach(async () => {
        [deployer, user, other] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        token = await MockERC20.deploy("Mock Token", "MTK", 6, ethers.parseUnits("1000", 6));
    });

    describe("Constructor", function () {
        it("should set name, symbol, decimals correctly", async () => {
            expect(await token.name()).to.equal("Mock Token");
            expect(await token.symbol()).to.equal("MTK");
            expect(await token.decimals()).to.equal(6);
        });

        it("should mint initial supply to deployer", async () => {
            const balance = await token.balanceOf(deployer.address);
            expect(balance).to.equal(ethers.parseUnits("1000", 6));
        });
    });

    describe("mint()", function () {
        it("should mint tokens to a recipient", async () => {
            await token.mint(user.address, ethers.parseUnits("100", 6));
            expect(await token.balanceOf(user.address)).to.equal(ethers.parseUnits("100", 6));
        });

        it("should increase total supply", async () => {
            const before = await token.totalSupply();
            await token.mint(user.address, 1_000);
            const after = await token.totalSupply();
            expect(after).to.equal(before + 1000n);
        });
    });

    describe("burn()", function () {
        it("should burn tokens from a holder", async () => {
            await token.mint(user.address, ethers.parseUnits("50", 6));
            await token.burn(user.address, ethers.parseUnits("20", 6));
            expect(await token.balanceOf(user.address)).to.equal(ethers.parseUnits("30", 6));
        });

        it("should reduce total supply", async () => {
            await token.mint(user.address, ethers.parseUnits("40", 6));
            const before = await token.totalSupply();
            await token.burn(user.address, ethers.parseUnits("10", 6));
            const after = await token.totalSupply();
            expect(after).to.equal(before - ethers.parseUnits("10", 6));
        });

        it("should revert if burn amount exceeds balance", async () => {
            await expect(
                token.burn(user.address, ethers.parseUnits("1", 6))
            ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
        });
    });

    describe("transferFrom()", function () {
        it("should transfer tokens between accounts", async () => {
            await token.transfer(user.address, ethers.parseUnits("200", 6));
            expect(await token.balanceOf(user.address)).to.equal(ethers.parseUnits("200", 6));
            expect(await token.balanceOf(deployer.address)).to.equal(ethers.parseUnits("800", 6));
        });

        it("should revert if sender has insufficient balance", async () => {
            await expect(
                token.connect(user).transfer(other.address, ethers.parseUnits("1", 6))
            ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
        });

        it("should allow transferFrom with allowance", async () => {
            await token.approve(user.address, ethers.parseUnits("100", 6));
            await token.connect(user).transferFrom(deployer.address, other.address, ethers.parseUnits("50", 6));

            expect(await token.balanceOf(other.address)).to.equal(ethers.parseUnits("50", 6));
        });

        it("should revert transferFrom without enough allowance", async () => {
            await expect(
                token.connect(user).transferFrom(deployer.address, other.address, 1)
            ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
        });
    });
});

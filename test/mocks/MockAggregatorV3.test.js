const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockAggregatorV3", function () {
    let deployer;
    let aggregator;

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();

        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        aggregator = await MockAggregatorV3.deploy(ethers.parseUnits("1000", 8), 8);
    });

    describe("Constructor", function () {
        it("should set initial answer and decimals correctly", async () => {
            const roundData = await aggregator.latestRoundData();
            expect(roundData.answer_).to.equal(ethers.parseUnits("1000", 8));
            expect(await aggregator.decimals()).to.equal(8);
        });

        it("should set description and version properly", async () => {
            expect(await aggregator.description()).to.equal("Mock Chainlink Aggregator");
            expect(await aggregator.version()).to.equal(1);
        });

        it("should set initial updatedAt timestamp", async () => {
            const block = await ethers.provider.getBlock("latest");
            const updatedAt = await aggregator.getUpdatedAt();
            // Allow slight difference due to test timing
            expect(updatedAt).to.be.closeTo(block.timestamp, 5);
        });
    });

    describe("latestRoundData()", function () {
        it("should return consistent round data fields", async () => {
            const round = await aggregator.latestRoundData();
            expect(round.roundId).to.equal(0);
            expect(round.startedAt).to.equal(round.updatedAt);
            expect(round.answeredInRound).to.equal(0);
        });
    });

    describe("updateAnswer()", function () {
        it("should update the answer and timestamp", async () => {
            const oldRound = await aggregator.latestRoundData();
            const newAnswer = ethers.parseUnits("1234", 8);

            await ethers.provider.send("evm_increaseTime", [10]);
            await aggregator.updateAnswer(newAnswer);

            const updatedRound = await aggregator.latestRoundData();

            expect(updatedRound.answer_).to.equal(newAnswer);
            expect(updatedRound.updatedAt).to.be.greaterThan(oldRound.updatedAt);
        });
    });

    describe("setUpdatedAt()", function () {
        it("should manually override updatedAt timestamp", async () => {
            const customTimestamp = (await ethers.provider.getBlock("latest")).timestamp - 5000;
            await aggregator.setUpdatedAt(customTimestamp);
            expect(await aggregator.getUpdatedAt()).to.equal(customTimestamp);
        });
    });

    describe("getRoundData()", function () {
        it("should mirror latestRoundData()", async () => {
            const latest = await aggregator.latestRoundData();
            const round = await aggregator.getRoundData(0);

            // tuple form: [ roundId, answer, startedAt, updatedAt, answeredInRound ]
            expect(round[1]).to.equal(latest[1]); // answer
            expect(round[3]).to.equal(latest[3]); // updatedAt
        });
    });

});

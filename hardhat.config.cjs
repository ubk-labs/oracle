require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("solidity-coverage");

const { PRIVATE_KEY, RPC_URL } = process.env;

module.exports = {
    solidity: {
        version: "0.8.21",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {},
        localhost: {
            url: "http://127.0.0.1:8545"
        },
        sepolia: {
            url: RPC_URL || "",
            accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
        }
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY || ""
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    },
    mocha: {
        timeout: 30000
    }
};
// Hardhat config placeholder
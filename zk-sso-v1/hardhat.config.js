require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// 이제 process.env에서 안전하게 값을 불러옵니다.
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io";
const BASE_SEPOLIA_RPC_URL = process.env.OPTIMISM_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const ZKSYNC_SEPOLIA_RPC_URL = process.env.ZKSYNC_SEPOLIA_RPC_URL || "https://sepolia.era.zksync.dev";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      // 로컬 테스트용 설정
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    zksyncSepolia: {
      url: ZKSYNC_SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

// scripts/deploy.js
/* eslint-disable no-console */
const { writeFileSync } = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  console.log("======================================");
  console.log(" Network :", network);
  console.log(" ChainId :", chainId.toString());
  console.log(" Deployer:", deployer.address);
  console.log(" Balance :", (await hre.ethers.provider.getBalance(deployer.address)).toString());
  console.log("======================================\n");

  // 1) Verifier 배포 (회로에 맞는 vk로 빌드된 verifier.sol이어야 함)
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("✅ Verifier deployed  :", verifierAddr);

  // 2) IdentityNFT 배포
  const IdentityNFT = await hre.ethers.getContractFactory("IdentityNFT");
  const nft = await IdentityNFT.deploy();
  await nft.waitForDeployment();
  const nftAddr = await nft.getAddress();
  console.log("✅ IdentityNFT deployed:", nftAddr);

  // 오픈 발급 모드 ON (PoC)
  {
    const tx = await nft.setOpenIssuerMode(true);
    const rc = await tx.wait(1);
    console.log("   ↳ setOpenIssuerMode(true)  tx:", rc.hash);
  }

  // 3) PolicyVerifier 배포
  const PolicyVerifier = await hre.ethers.getContractFactory("PolicyVerifier");
  const pv = await PolicyVerifier.deploy(verifierAddr, nftAddr);
  await pv.waitForDeployment();
  const pvAddr = await pv.getAddress();
  console.log("✅ PolicyVerifier deployed:", pvAddr);

  // issuer allowlist 비활성 (PoC)
  if (pv.setRequireIssuerAllowlist) {
    const tx = await pv.setRequireIssuerAllowlist(false);
    const rc = await tx.wait(1);
    console.log("   ↳ setRequireIssuerAllowlist(false) tx:", rc.hash);
  }

  // 배포 블록
  const latest = await hre.ethers.provider.getBlock("latest");
  const blockNumber = latest.number;

  // 4) 저장물: deployments.json (백엔드/스크립트용)
  const deployments = {
    network,
    chainId: chainId.toString(),
    deployer: deployer.address,
    blockNumber,
    verifier: verifierAddr,
    identityNFT: nftAddr,
    policyVerifier: pvAddr,
    mode: {
      openIssuerMode: true,
      requireIssuerAllowlist: false
    },
    notes: "PoC: publicSignals = 11 (정책 10 + root 1), nullifier 미사용"
  };
  const outPath = path.join(process.cwd(), "deployments.json");
  writeFileSync(outPath, JSON.stringify(deployments, null, 2));
  console.log("\n📝 deployments.json written:", outPath);

  // 5) 프론트에서 그대로 읽어 쓸 수 있는 경량 JSON (선택)
  const front = {
    chainId: Number(chainId),
    IdentityNFT: nftAddr,
    PolicyVerifier: pvAddr
  };
  const frontPath = path.join(process.cwd(), "frontend.deployments.json");
  writeFileSync(frontPath, JSON.stringify(front, null, 2));
  console.log("📝 frontend.deployments.json written:", frontPath);

  console.log("\n✅ Done.");
  console.log("   Use these in your HTML:");
  console.log(`   IdentityNFT:    ${nftAddr}`);
  console.log(`   PolicyVerifier: ${pvAddr}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

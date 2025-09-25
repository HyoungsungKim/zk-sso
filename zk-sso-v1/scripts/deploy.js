// pnpm hardhat run  scripts/deploy.js --network sepolia
const { writeFileSync } = require("fs");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1. Verifier 배포
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  console.log("Verifier deployed to:", await verifier.getAddress());

  // 2. IdentityNFT 배포 (오픈 issuer 모드)
  const IdentityNFT = await hre.ethers.getContractFactory("IdentityNFT");
  const nft = await IdentityNFT.deploy();
  await nft.waitForDeployment();
  console.log("IdentityNFT deployed to:", await nft.getAddress());

  // 3. PolicyVerifierA 배포
  const PolicyVerifierA = await hre.ethers.getContractFactory("PolicyVerifier");
  const pv = await PolicyVerifierA.deploy(
    await verifier.getAddress(),
    await nft.getAddress()
  );
  await pv.waitForDeployment();
  console.log("PolicyVerifierA deployed to:", await pv.getAddress());

  // 4. PoC에서는 issuer 등록/허용 스킵
  console.log("Open mode: no issuer registration required");

  // 5. deployments.json 저장
  const deployments = {
    network: hre.network.name,
    verifier: await verifier.getAddress(),
    identityNFT: await nft.getAddress(),
    policyVerifier: await pv.getAddress(),
    deployer: deployer.address,
    mode: "open"
  };

  writeFileSync("deployments.json", JSON.stringify(deployments, null, 2));
  console.log("Deployments written to deployments.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

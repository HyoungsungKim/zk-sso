// test/policyVerifier.test.js  (ESM)
import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("PolicyVerifierA (logic with MockVerifier)", function () {
  let owner, issuer, user, other;
  let nft, pv, mock;

  beforeEach(async () => {
    [owner, issuer, user, other] = await ethers.getSigners();

    const NFT = await ethers.getContractFactory("IdentityNFT");
    nft = await NFT.deploy();
    await nft.waitForDeployment();

    const Mock = await ethers.getContractFactory("MockVerifier");
    mock = await Mock.deploy();
    await mock.waitForDeployment();

    const PV = await ethers.getContractFactory("PolicyVerifierA");
    pv = await PV.deploy(await mock.getAddress(), await nft.getAddress());
    await pv.waitForDeployment();

    await pv.connect(owner).setRequireIssuerAllowlist(true);

    await nft.connect(owner).setIssuer(issuer.address, true);
    await pv.connect(owner).setIssuerAllowed(issuer.address, true);

    const exp = Math.floor(Date.now()/1000) + 86400*30;
    await nft.connect(issuer).mint(user.address, exp, ethers.ZeroHash);
  });

  function dummyProofAndInputs() {
    const a = [1, 2];
    const b = [[3, 4], [5, 6]];
    const c = [7, 8];
    const publicInputs = [1,19,1,0,1, 410,840,0,0,0];
    return { a, b, c, publicInputs };
  }

  it("happy: owner & issuerAllowed & not expired & not revoked & proof ok -> emits", async () => {
    const { a, b, c, publicInputs } = dummyProofAndInputs();
    const policyHash = ethers.keccak256(ethers.toUtf8Bytes("age>=19&KRorUS"));
    const nullifier = ethers.ZeroHash;

    await expect(
      pv.connect(user).verifyAndEmit(1, publicInputs, { a, b, c }, policyHash, nullifier)
    ).to.emit(pv, "Verified").withArgs(user.address, 1, policyHash, nullifier);
  });

  it("revert: not owner", async () => {
    const { a, b, c, publicInputs } = dummyProofAndInputs();
    await expect(
      pv.connect(other).verifyAndEmit(1, publicInputs, { a, b, c }, ethers.ZeroHash, ethers.ZeroHash)
    ).to.be.revertedWith("NOT_OWNER");
  });

  it("revert: issuer not allowed", async () => {
    const { a, b, c, publicInputs } = dummyProofAndInputs();
    await pv.connect(owner).setIssuerAllowed(issuer.address, false);
    await expect(
      pv.connect(user).verifyAndEmit(1, publicInputs, { a, b, c }, ethers.ZeroHash, ethers.ZeroHash)
    ).to.be.revertedWith("ISSUER_NOT_ALLOWED");
  });

  it("revert: expired", async () => {
    const now = Math.floor(Date.now()/1000);
    const expSoon = now + 1;
    await nft.connect(issuer).mint(user.address, expSoon, ethers.ZeroHash); // tokenId=2
    await new Promise(r => setTimeout(r, 1500));
    const { a, b, c, publicInputs } = dummyProofAndInputs();
    await expect(
      pv.connect(user).verifyAndEmit(2, publicInputs, { a, b, c }, ethers.ZeroHash, ethers.ZeroHash)
    ).to.be.revertedWith("EXPIRED");
  });

  it("revert: revoked", async () => {
    await nft.connect(issuer).revoke(1);
    const { a, b, c, publicInputs } = dummyProofAndInputs();
    await expect(
      pv.connect(user).verifyAndEmit(1, publicInputs, { a, b, c }, ethers.ZeroHash, ethers.ZeroHash)
    ).to.be.revertedWith("REVOKED");
  });

  it("revert: proof invalid", async () => {
    await mock.setResult(false);
    const { a, b, c, publicInputs } = dummyProofAndInputs();
    await expect(
      pv.connect(user).verifyAndEmit(1, publicInputs, { a, b, c }, ethers.ZeroHash, ethers.ZeroHash)
    ).to.be.revertedWith("INVALID_PROOF");
  });

  it("nullifier reuse blocked (optional path)", async () => {
    const { a, b, c, publicInputs } = dummyProofAndInputs();
    const nul = ethers.keccak256(ethers.toUtf8Bytes("session1"));
    await pv.connect(user).verifyAndEmit(1, publicInputs, { a, b, c }, ethers.ZeroHash, nul);
    await expect(
      pv.connect(user).verifyAndEmit(1, publicInputs, { a, b, c }, ethers.ZeroHash, nul)
    ).to.be.revertedWith("NULLIFIER_USED");
  });
});

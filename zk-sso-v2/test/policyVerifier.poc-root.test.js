// test/policyVerifier.poc-root.test.js  (ESM)
import { expect } from "chai";
import hre from "hardhat";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
const { ethers } = hre;

/** calldata 문자열 -> a,b,c,inputs 파싱 */
function parseSolidityCalldata(calldata) {
  const argv = calldata.replace(/["[\]\s]/g, "").split(",").map(x => BigInt(x).toString());
  const a = [argv[0], argv[1]].map(v => BigInt(v));
  const b = [
    [argv[2], argv[3]].map(v => BigInt(v)),
    [argv[4], argv[5]].map(v => BigInt(v)),
  ];
  const c = [argv[6], argv[7]].map(v => BigInt(v));
  const inputs = argv.slice(8).map(v => BigInt(v).toString()); // string[] 유지
  return { a, b, c, inputs };
}

// --- PoC: 경로 없는 단순 Merkle(=집계) 규칙 ---
// leaf_age   = Poseidon2(age,   salt_age)
// leaf_gender= Poseidon2(gender,salt_gender)
// leaf_nat   = Poseidon2(nation,salt_nat)
// root       = Poseidon3(leaf_age, leaf_gender, leaf_nat)
// ↆ 회로에서도 정확히 이 순서/산식이어야 함!
async function computeRootOffchain({ age, gender, nation, sAge, sGender, sNation }) {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const H = (arr) => F.toObject(poseidon(arr)); // 가변 길이 Poseidon

  // 회로와 동일: LeafHash3(tag, val, salt)
  const leafAge    = H([1n, BigInt(age),    BigInt(sAge)]);
  const leafGender = H([2n, BigInt(gender), BigInt(sGender)]);
  const leafNation = H([3n, BigInt(nation), BigInt(sNation)]);

  // 회로와 동일: agg = Poseidon(3)(leafAge, leafGender, leafNation)
  const root = H([leafAge, leafGender, leafNation]);

  return "0x" + BigInt(root).toString(16).padStart(64, "0");
}


describe("PolicyVerifier PoC (root 바인딩, 경로 없음)", function () {
  this.timeout(60_000);

  let owner, issuer, user;
  let nft, pv, verifier;

  // 네 프로젝트 구조에 맞게 wasm/zkey 경로 고정
  const WASM = "./zk/access_control.wasm";
  const ZKEY = "./zk/access_control_0001.zkey";

  beforeEach(async () => {
    [owner, issuer, user] = await ethers.getSigners();

    // 1) Verifier.sol: 반드시 ZKEY에서 export된 동일 파일
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    // 2) IdentityNFT
    const NFT = await ethers.getContractFactory("IdentityNFT");
    nft = await NFT.deploy();
    await nft.waitForDeployment();

    // 오픈 발급(테스트 편의)
    await nft.connect(owner).setOpenIssuerMode(true);

    // 3) PolicyVerifier (여기서 root == NFT.root 비교 로직이 있어야 함!)
    const PV = await ethers.getContractFactory("PolicyVerifier");
    pv = await PV.deploy(await verifier.getAddress(), await nft.getAddress());
    await pv.waitForDeployment();

    // PoC: allowlist 검사 off
    await pv.connect(owner).setRequireIssuerAllowlist(false);
  });

  it("happy: publicSignals의 root가 NFT의 attrCommitRoot와 일치하면 통과", async () => {
    // --- 0) 속성 & 솔트(고정값) ---
    const age = 23n, gender = 0n, nation = 410n; // KOR
    const sAge = 1111n, sGender = 2222n, sNation = 3333n;

    const offchainRoot = await computeRootOffchain({ age, gender, nation, sAge, sGender, sNation });

    // --- 1) NFT 민팅(root 바인딩) ---
    const exp = Math.floor(Date.now()/1000) + 86400*30;
    await nft.connect(issuer).mint(user.address, exp, offchainRoot);

    // --- 2) 정책(public) + 개인(private) 입력 구성 (UI와 동일) ---
    const publicInputsObj = {
      age_check_flag: "1",
      required_age: "19",
      gender_check_flag: "1",
      required_gender: "0",
      nationality_check_flag: "1",
      required_country_codes: ["410","840","0","0","0"]
    };
    const priv = {
      prover_age: age.toString(),
      prover_gender: gender.toString(),
      prover_country_code: nation.toString(),
      // PoC(경로 없음): 솔트를 private로 회로에 넣음
      salt_age: sAge.toString(),
      salt_gender: sGender.toString(),
      salt_nation: sNation.toString()
    };

    // --- 3) 증명 생성 ---
    const input = {
      // private
      prover_age: priv.prover_age,
      prover_gender: priv.prover_gender,
      prover_country_code: priv.prover_country_code,
      salt_age: priv.salt_age,
      salt_gender: priv.salt_gender,
      salt_nation: priv.salt_nation,
      // public (회로 public 순서와 동일)
      age_check_flag: publicInputsObj.age_check_flag,
      required_age: publicInputsObj.required_age,
      gender_check_flag: publicInputsObj.gender_check_flag,
      required_gender: publicInputsObj.required_gender,
      nationality_check_flag: publicInputsObj.nationality_check_flag,
      required_country_codes: publicInputsObj.required_country_codes,
      // 회로가 root를 public에 포함하도록 수정되어 있어야 함
      root: offchainRoot
    };
    const toHex32 = (decStr) => '0x' + BigInt(decStr).toString(16).padStart(64, '0')

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
    // 길이는 환경마다 다를 수 있으므로, 마지막 항목을 root로 사용(네 회로가 그렇게 export되었다고 가정)
    const ROOT_IDX = publicSignals.length - 1;
    //expect(publicSignals[ROOT_IDX].toLowerCase()).to.equal(offchainRoot.toLowerCase());
    expect(toHex32(publicSignals[ROOT_IDX]).toLowerCase()).to.equal(offchainRoot.toLowerCase());

    // --- 4) 솔리디티 형식 변환 + 로컬 검증 ---
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const { a, b, c, inputs } = parseSolidityCalldata(calldata);

    const ok = await verifier.verifyProof.staticCall(a, b, c, inputs);
    expect(ok).to.equal(true);

    // --- 5) PolicyVerifier 경유 on-chain 검증 ---
    const policyHash = ethers.keccak256(ethers.toUtf8Bytes("age>=19&KRorUS"));
    const nullifier = ethers.ZeroHash;

    await expect(
      pv.connect(user).verifyAndEmit(1, inputs, { a, b, c }, policyHash, nullifier)
    ).to.emit(pv, "Verified").withArgs(user.address, 1, policyHash, nullifier);
  });

  it("revert: NFT에 다른 root가 바인딩되어 있으면 ROOT_MISMATCH", async () => {
    // 다른 root로 민팅(엉뚱한 값)
    const wrongRoot = "0x" + "12".padStart(64, "0");
    const exp = Math.floor(Date.now()/1000) + 86400*30;
    await nft.connect(issuer).mint(user.address, exp, wrongRoot);

    // 증명은 정상 root로 생성
    const age = 23n, gender = 0n, nation = 410n;
    const sAge = 1111n, sGender = 2222n, sNation = 3333n;
    const offchainRoot = await computeRootOffchain({ age, gender, nation, sAge, sGender, sNation });

    const publicInputsObj = {
      age_check_flag: "1",
      required_age: "19",
      gender_check_flag: "1",
      required_gender: "0",
      nationality_check_flag: "1",
      required_country_codes: ["410","840","0","0","0"]
    };
    const input = {
      prover_age: age.toString(),
      prover_gender: gender.toString(),
      prover_country_code: nation.toString(),
      salt_age: sAge.toString(),
      salt_gender: sGender.toString(),
      salt_nation: sNation.toString(),
      age_check_flag: publicInputsObj.age_check_flag,
      required_age: publicInputsObj.required_age,
      gender_check_flag: publicInputsObj.gender_check_flag,
      required_gender: publicInputsObj.required_gender,
      nationality_check_flag: publicInputsObj.nationality_check_flag,
      required_country_codes: publicInputsObj.required_country_codes,
      root: offchainRoot
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const { a, b, c, inputs } = parseSolidityCalldata(calldata);

    const policyHash = ethers.keccak256(ethers.toUtf8Bytes("age>=19&KRorUS"));
    await expect(
      pv.connect(user).verifyAndEmit(1, inputs, { a, b, c }, policyHash, ethers.ZeroHash)
    ).to.be.revertedWith("ROOT_MISMATCH");
  });
});

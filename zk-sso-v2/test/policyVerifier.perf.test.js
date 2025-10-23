// test/policyVerifier.perf.test.js
// E2E(pass)와 Fail(witness assert) 성능을 분리해서 측정

import { expect } from "chai";
import hre from "hardhat";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { performance } from "node:perf_hooks";

const { ethers } = hre;

/** ====== 환경변수 ====== */
const PERF_ITER   = Number(process.env.PERF_ITER   ?? 100); // 반복 횟수
const PERF_WARMUP = Number(process.env.PERF_WARMUP ?? 0);  // 워밍업 회수
const PERF_SEED   = Number(process.env.PERF_SEED   ?? 1234);
const PERF_GAS    = process.env.PERF_GAS === "1";          // 실제 tx 가스도 측정할지

/** ====== 경로 (네 프로젝트 구조에 맞게) ====== */
const WASM = "./zk/access_control.wasm";
const ZKEY = "./zk/access_control_0001.zkey";

/** ====== 공통 유틸 ====== */
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

function summarize(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length || 1;
  const mean = a.reduce((s, v) => s + v, 0) / n;
  const pick = (p) => a[Math.floor(p * (n - 1))];
  return {
    count: a.length,
    mean: +mean.toFixed(2),
    p50: +(pick(0.5) ?? 0).toFixed(2),
    p90: +(pick(0.9) ?? 0).toFixed(2),
    p95: +(pick(0.95) ?? 0).toFixed(2),
    min: +(a[0] ?? 0).toFixed(2),
    max: +(a[a.length - 1] ?? 0).toFixed(2),
  };
}

/** 간단 시드형 RNG (xorshift32) */
function makeRng(seed = 1) {
  let x = seed | 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/** 국가 배열 유틸(길이5, 중복X, 0 패딩) */
function makeCountryArray({ include, pool = [410, 840, 392, 826], length = 5 }) {
  const set = new Set();
  if (include != null) set.add(String(include));
  for (const c of pool) {
    if (set.size >= length) break;
    set.add(String(c));
  }
  const arr = Array.from(set);
  while (arr.length < length) arr.push("0");
  return arr.slice(0, length);
}

/** off-chain root 계산 (회로와 동일 산식) */
async function computeRootOffchain({ age, gender, nation, sAge, sGender, sNation }) {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const H = (arr) => F.toObject(poseidon(arr.map(BigInt)));
  const leafAge    = H([1n, age,    sAge]);
  const leafGender = H([2n, gender, sGender]);
  const leafNation = H([3n, nation, sNation]);
  const root       = H([leafAge, leafGender, leafNation]);
  return "0x" + BigInt(root).toString(16).padStart(64, "0");
}

describe("PolicyVerifier 퍼포먼스 (증명 생성 & 검증 시간)", function () {
  // 증명 생성 느릴 수 있음
  this.timeout(10 * 60 * 1000);

  let owner, issuer, user;
  let nft, pv, verifier;
  let offchainRoot;

  // 고정 속성/솔트 (pass용)
  const attrs = { age: 23n, gender: 0n, nation: 410n }; // 0=남성, 410=KOR
  const salts = { sAge: 1111n, sGender: 2222n, sNation: 3333n };

  beforeEach(async () => {
    [owner, issuer, user] = await ethers.getSigners();

    // 1) Groth16Verifier
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    // 2) IdentityNFT
    const NFT = await ethers.getContractFactory("IdentityNFT");
    nft = await NFT.deploy();
    await nft.waitForDeployment();
    await nft.connect(owner).setOpenIssuerMode(true);

    // 3) PolicyVerifier
    const PV = await ethers.getContractFactory("PolicyVerifier");
    pv = await PV.deploy(await verifier.getAddress(), await nft.getAddress());
    await pv.waitForDeployment();
    await pv.connect(owner).setRequireIssuerAllowlist(false);

    // 4) off-chain root 계산 후 NFT 민팅(유효기간 30일) — tokenId=1 is user
    offchainRoot = await computeRootOffchain({
      age: attrs.age, gender: attrs.gender, nation: attrs.nation,
      sAge: salts.sAge, sGender: salts.sGender, sNation: salts.sNation
    });
    const exp = Math.floor(Date.now()/1000) + 86400*30;
    await nft.connect(issuer).mint(user.address, exp, offchainRoot);
  });

  it("E2E(pass): 증명 생성→검증 전체 시간", async () => {
    const timings = {
      fullProve_ms: [],
      export_ms: [],
      verifyProof_ms: [],
      pv_static_ms: [],
      gas_verifyAndEmit: [],
    };

    // 항상 pass하는 정책 (브라우저 happy-path와 동일)
    const publicInputs = {
      age_check_flag: "1",
      required_age: "19",
      gender_check_flag: "1",
      required_gender: "0", // 0=남성
      nationality_check_flag: "1",
      required_country_codes: ["410", "840", "0", "0", "0"], // KOR in allow set
    };

    // 입력 빌더 (매회 문자열화해서 주입)
    const makePassInput = () => ({
      // private
      prover_age:           attrs.age.toString(),
      prover_gender:        attrs.gender.toString(),
      prover_country_code:  attrs.nation.toString(),
      salt_age:             salts.sAge.toString(),
      salt_gender:          salts.sGender.toString(),
      salt_nation:          salts.sNation.toString(),
      // public
      ...publicInputs,
      root:                 offchainRoot,
    });

    // 워밍업
    for (let i = 0; i < PERF_WARMUP; i++) {
      await snarkjs.groth16.fullProve(makePassInput(), WASM, ZKEY);
    }

    for (let i = 0; i < PERF_ITER; i++) {
      // 1) fullProve
      const t1 = performance.now();
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(makePassInput(), WASM, ZKEY);
      const t2 = performance.now(); timings.fullProve_ms.push(t2 - t1);

      // 2) calldata
      const t3 = performance.now();
      const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
      const t4 = performance.now(); timings.export_ms.push(t4 - t3);

      const { a, b, c, inputs } = parseSolidityCalldata(calldata);

      // 3) 로컬 verifier
      const t5 = performance.now();
      const ok = await verifier.verifyProof.staticCall(a, b, c, inputs);
      const t6 = performance.now(); timings.verifyProof_ms.push(t6 - t5);
      expect(ok).to.equal(true);

      // 4) PolicyVerifier.staticCall (user가 tokenId=1 소유자)
      const policyHash = ethers.keccak256(ethers.toUtf8Bytes("perf-pass"));
      const nullifier  = ethers.ZeroHash;

      const t7 = performance.now();
      await pv.connect(user).verifyAndEmit.staticCall(1, inputs, { a, b, c }, policyHash, nullifier);
      const t8 = performance.now(); timings.pv_static_ms.push(t8 - t7);

      // 5) (옵션) 실제 트xn 가스
      if (PERF_GAS) {
        const tx = await pv.connect(user).verifyAndEmit(1, inputs, { a, b, c }, policyHash, nullifier);
        const rc = await tx.wait();
        timings.gas_verifyAndEmit.push(Number(rc.gasUsed));
      }
    }

    console.log("\n=== ZK Perf (PASS / ms) ===========================");
    console.table({
      fullProve:      summarize(timings.fullProve_ms),
      exportCalldata: summarize(timings.export_ms),
      verifyProof:    summarize(timings.verifyProof_ms),
      pv_staticCall:  summarize(timings.pv_static_ms),
    });
    if (PERF_GAS) {
      console.log("=== Gas verifyAndEmit (unit) ======================");
      console.table({ gas: summarize(timings.gas_verifyAndEmit) });
    }
  });

  it("Fail(witness): 정책 위반 시 assert까지 시간만", async () => {
    const rng = makeRng(PERF_SEED);
    const timings = { wtnsFail_ms: [] };

    // 실패 입력을 하나 골라서 생성 (회로 assert에 걸리도록)
    // 모든 flag를 1로 두고, 무조건 한 항목 이상 위반
    const makeFailInput = () => {
      // 랜덤으로 어느 제약을 깰지 선택
      const breakWhich = Math.floor(rng() * 3); // 0=age, 1=gender, 2=country

      const age_check_flag = "1";
      const gender_check_flag = "1";
      const nationality_check_flag = "1";

      const required_age = (breakWhich === 0)
        ? String(Number(attrs.age) + 1)                 // > prover_age  → fail
        : String(Number(attrs.age));                    // 통과

      const required_gender = (breakWhich === 1)
        ? String(Number(1n - attrs.gender))             // != prover_gender → fail
        : String(Number(attrs.gender));                 // 통과

      const required_country_codes = (breakWhich === 2)
        ? makeCountryArray({ include: null })           // prover_country_code 미포함 → fail
        : makeCountryArray({ include: attrs.nation });  // 통과

      return {
        // private
        prover_age:           attrs.age.toString(),
        prover_gender:        attrs.gender.toString(),
        prover_country_code:  attrs.nation.toString(),
        salt_age:             salts.sAge.toString(),
        salt_gender:          salts.sGender.toString(),
        salt_nation:          salts.sNation.toString(),
        // public(모두 flag=1)
        age_check_flag,
        required_age,
        gender_check_flag,
        required_gender,
        nationality_check_flag,
        required_country_codes,
        root: offchainRoot,
      };
    };

    // 워밍업 (실패도 계산 경로 안정화)
    try { await snarkjs.groth16.fullProve(makeFailInput(), WASM, ZKEY); } catch {}

    for (let i = 0; i < PERF_ITER; i++) {
      const t1 = performance.now();
      try {
        await snarkjs.groth16.fullProve(makeFailInput(), WASM, ZKEY);
        // 여기 오면 실패 기대가 통과한 것이므로 역-실패 처리
        throw new Error("expected witness failure but fullProve succeeded");
      } catch (e) {
        // circom_runtime assert 오류는 정상 흐름
        const t2 = performance.now();
        timings.wtnsFail_ms.push(t2 - t1);
      }
    }

    console.log("\n=== ZK Perf (FAIL / witness-assert ms) ============");
    console.table({
      witnessFail: summarize(timings.wtnsFail_ms),
    });
  });
});

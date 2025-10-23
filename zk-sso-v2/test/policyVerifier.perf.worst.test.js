// test/policyVerifier.perf.worst.test.js
import { expect } from "chai";
import hre from "hardhat";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { performance } from "node:perf_hooks";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";

const { ethers } = hre;

/** ---------------- 공통 유틸 ---------------- */
function parseSolidityCalldata(calldata) {
  const argv = calldata.replace(/["[\]\s]/g, "").split(",").map(x => BigInt(x).toString());
  const a = [argv[0], argv[1]].map(v => BigInt(v));
  const b = [
    [argv[2], argv[3]].map(v => BigInt(v)),
    [argv[4], argv[5]].map(v => BigInt(v)),
  ];
  const c = [argv[6], argv[7]].map(v => BigInt(v));
  const inputs = argv.slice(8).map(v => BigInt(v).toString());
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
    p50: +(pick(0.50) ?? 0).toFixed(2),
    p90: +(pick(0.90) ?? 0).toFixed(2),
    p95: +(pick(0.95) ?? 0).toFixed(2),
    min: +(a[0] ?? 0).toFixed(2),
    max: +(a[a.length - 1] ?? 0).toFixed(2),
  };
}

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

/** ---------------- 포크 워커 실행기 ---------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const HELPER = pathResolve(__dirname, "./zk_prove_worker.cjs");

// perWork=1 이면 cold 1회, 그 이상이면 해당 횟수만큼 연속 실행
function runProveViaFork({ input, wasm, zkey, perWork }) {
  return new Promise((resolve, reject) => {
    const child = fork(HELPER, {
      stdio: ["ignore", "ignore", "inherit", "ipc"],
      env: {
        ...process.env,
        input: JSON.stringify(input),
        wasm,
        zkey,
        perWork: String(perWork ?? 1),
      },
    });
    child.on("message", (m) => {
      if (m?.error) return reject(new Error(m.error));
      // m.ms (perWork==1) 또는 m.times (배열)
      if ('ms' in m) return resolve([m.ms]);
      if (Array.isArray(m.times)) return resolve(m.times);
      reject(new Error("Unexpected worker message"));
    });
    child.on("error", reject);
  });
}

/** ---------------- 하드햇 셋업 & 테스트 ---------------- */
describe("PolicyVerifier 퍼포먼스 (증명 생성 & 검증 시간) — worst-case 포함", function () {
  this.timeout(10 * 60 * 1000);

  const WASM = "./zk/access_control.wasm";
  const ZKEY = "./zk/access_control_0001.zkey";

  let owner, issuer, user;
  let nft, pv, verifier;
  let offchainRoot;
  const attrs = { age: 23n, gender: 0n, nation: 410n };
  const salts = { sAge: 1111n, sGender: 2222n, sNation: 3333n };

  beforeEach(async () => {
    [owner, issuer, user] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const NFT = await ethers.getContractFactory("IdentityNFT");
    nft = await NFT.deploy();
    await nft.waitForDeployment();
    await nft.connect(owner).setOpenIssuerMode(true);

    const PV = await ethers.getContractFactory("PolicyVerifier");
    pv = await PV.deploy(await verifier.getAddress(), await nft.getAddress());
    await pv.waitForDeployment();
    await pv.connect(owner).setRequireIssuerAllowlist(false);

    offchainRoot = await computeRootOffchain({
      age: attrs.age, gender: attrs.gender, nation: attrs.nation,
      sAge: salts.sAge, sGender: salts.sGender, sNation: salts.sNation
    });
    const exp = Math.floor(Date.now()/1000) + 86400*30;
    await nft.connect(issuer).mint(user.address, exp, offchainRoot);
  });

  it("E2E(pass): 현재 회로의 hot 경로(재현성) 측정", async () => {
    const ITER = 10;
    const timings = { fullProve_ms: [], export_ms: [], verify_ms: [], pv_static_ms: [], gas: [] };

    const publicInputsObj = {
      age_check_flag: "1",
      required_age: "19",
      gender_check_flag: "1",
      required_gender: "0",
      nationality_check_flag: "1",
      required_country_codes: ["410", "840", "0", "0", "0"],
    };

    for (let i = 0; i < ITER; i++) {
      const input = {
        // private
        prover_age:           attrs.age.toString(),
        prover_gender:        attrs.gender.toString(),
        prover_country_code:  attrs.nation.toString(),
        salt_age:             salts.sAge.toString(),
        salt_gender:          salts.sGender.toString(),
        salt_nation:          salts.sNation.toString(),
        // public
        age_check_flag:           publicInputsObj.age_check_flag,
        required_age:             publicInputsObj.required_age,
        gender_check_flag:        publicInputsObj.gender_check_flag,
        required_gender:          publicInputsObj.required_gender,
        nationality_check_flag:   publicInputsObj.nationality_check_flag,
        required_country_codes:   publicInputsObj.required_country_codes,
        root:                     offchainRoot,
      };

      // 1) fullProve
      const t1 = performance.now();
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
      const t2 = performance.now();
      timings.fullProve_ms.push(t2 - t1);

      // 2) export calldata
      const t3 = performance.now();
      const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
      const t4 = performance.now();
      timings.export_ms.push(t4 - t3);

      const { a, b, c, inputs } = parseSolidityCalldata(calldata);

      // 3) 로컬 verifier
      const t5 = performance.now();
      const ok = await verifier.verifyProof.staticCall(a, b, c, inputs);
      const t6 = performance.now();
      expect(ok).to.equal(true);
      timings.verify_ms.push(t6 - t5);

      // 4) PolicyVerifier.staticCall
      const policyHash = ethers.keccak256(ethers.toUtf8Bytes("age>=19&KRorUS"));
      const nullifier  = ethers.ZeroHash;

      const t7 = performance.now();
      await pv.connect(user).verifyAndEmit.staticCall(1, inputs, { a, b, c }, policyHash, nullifier);
      const t8 = performance.now();
      timings.pv_static_ms.push(t8 - t7);

      // 5) 실제 가스
      const tx = await pv.connect(user).verifyAndEmit(1, inputs, { a, b, c }, policyHash, nullifier);
      const rc = await tx.wait();
      timings.gas.push(Number(rc.gasUsed));
    }

    console.log("\n=== ZK Perf (PASS / ms) ===========================");
    console.table({
      fullProve:      summarize(timings.fullProve_ms),
      exportCalldata: summarize(timings.export_ms),
      verifyProof:    summarize(timings.verify_ms),
      pv_staticCall:  summarize(timings.pv_static_ms),
    });
    console.log("=== Gas verifyAndEmit (unit) =====================");
    console.table({ gas: summarize(timings.gas) });
  });

  it("WORST-CASE: Cold start + Concurrent load (tail latency 확대)", async () => {
    // 환경 파라미터
    const COLD_ITER = 6;   // cold 시작: 매번 새 프로세스 1회씩
    const WORKERS   = 4;   // 동시 포크 수
    const PER_WORK  = 5;   // 각 포크에서 연속 실행 횟수

    const baseInput = {
      prover_age:           attrs.age.toString(),
      prover_gender:        attrs.gender.toString(),
      prover_country_code:  attrs.nation.toString(),
      salt_age:             salts.sAge.toString(),
      salt_gender:          salts.sGender.toString(),
      salt_nation:          salts.sNation.toString(),
      age_check_flag:       "1",
      required_age:         "19",
      gender_check_flag:    "1",
      required_gender:      "0",
      nationality_check_flag:"1",
      required_country_codes: makeCountryArray({ include: attrs.nation }),
      root:                 offchainRoot,
    };

    // 1) Cold start: perWork=1, 프로세스 새로 띄워 1회만
    const coldTimes = [];
    for (let i = 0; i < COLD_ITER; i++) {
      const arr = await runProveViaFork({ input: baseInput, wasm: WASM, zkey: ZKEY, perWork: 1 });
      coldTimes.push(arr[0]);
    }

    // 2) Concurrent load: WORKERS개 프로세스 * PER_WORK회 반복
    const batches = await Promise.all(
      Array.from({ length: WORKERS }, () =>
        runProveViaFork({ input: baseInput, wasm: WASM, zkey: ZKEY, perWork: PER_WORK })
      )
    );
    const flatHot = batches.flat();

    console.log("\n=== Worst-Case: Cold start fullProve (ms) ========");
    console.table({ cold: summarize(coldTimes) });

    console.log("=== Worst-Case: Concurrent fullProve (ms) ========");
    console.table({ hotUnderLoad: summarize(flatHot) });

    expect(coldTimes.length).to.equal(COLD_ITER);
    expect(flatHot.length).to.equal(WORKERS * PER_WORK);
    // 보통 cold가 더 느리다(환경에 따라 아닐 수도 있지만 sanity check로 둠)
    expect(Math.max(...coldTimes)).to.be.greaterThan(Math.min(...flatHot));
  });
});

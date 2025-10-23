// test/policyVerifier.perf.securekdf.test.js
// ESM 기반 하드햇 테스트: 증명 생성/검증 시간 + KDF 부하 + cold/concurrent (fork 기반)

import { expect } from "chai";
import hre from "hardhat";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { pbkdf2Sync, createHash } from "node:crypto";
import { fork } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { ethers } = hre;
const requireCjs = createRequire(import.meta.url);
const SNARKJS_PATH = requireCjs.resolve("snarkjs"); // CJS snarkjs 경로(포크 프로세스에서 require)

//
// 환경 변수로 부하·동시성 조절
//
const KDF_ITER   = Number(process.env.PERF_KDF_ITER   ?? 3_000_000); // 0.03~0.1s 정도(머신차)
const KDF_KEYLEN = Number(process.env.PERF_KDF_KEYLEN ?? 32);
const KDF_DIGEST = String(process.env.PERF_KDF_DIGEST ?? "sha256");
const KDF_SALT   = String(process.env.PERF_KDF_SALT   ?? Buffer.from("zk-ssso-salt").toString("hex"));

const COLD_ITER  = Number(process.env.PERF_COLD_ITER  ?? 100);
const WORKERS    = Number(process.env.PERF_WORKERS    ?? 4);
const PER_WORK   = Number(process.env.PERF_PER_WORK   ?? 5);

//
// 공통 유틸
//
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

function kdfCostOnce({ iter = KDF_ITER, keylen = KDF_KEYLEN, digest = KDF_DIGEST, saltHex = KDF_SALT }) {
  const key = pbkdf2Sync(Buffer.from("zk-ssso"), Buffer.from(saltHex, "hex"), iter, keylen, digest);
  return createHash("sha256").update(key).digest("hex"); // 사용해서 JIT 최적화 방지
}

//
// 포크 워커(별도 프로세스) 스크립트 생성
//
function makeForkHelperPath() {
  const dir = mkdtempSync(join(tmpdir(), "zk-perf-"));
  const p = join(dir, "fork_helper.cjs"); // CJS 로 생성
  const code = `
    // fork_helper.cjs (Node CJS)
    const { pbkdf2Sync, createHash } = require('node:crypto');
    const snarkjs = require(process.env.SNARKJS_PATH);
    function runKdf(iter, keylen, digest, saltHex) {
      const key = pbkdf2Sync(Buffer.from('zk-ssso'), Buffer.from(saltHex, 'hex'), iter, keylen, digest);
      createHash('sha256').update(key).digest('hex');
    }
    async function main() {
      const cfg = JSON.parse(process.argv[2]);
      const { mode, input, wasm, zkey, iter, keylen, digest, saltHex, perWork } = cfg;
      if (mode === 'cold') {
        const t1 = Date.now();
        runKdf(iter, keylen, digest, saltHex);
        await snarkjs.groth16.fullProve(input, wasm, zkey);
        const t2 = Date.now();
        if (process.send) process.send({ ms: t2 - t1 });
      } else if (mode === 'batch') {
        const times = [];
        for (let i = 0; i < perWork; i++) {
          const t1 = Date.now();
          runKdf(iter, keylen, digest, saltHex);
          await snarkjs.groth16.fullProve(input, wasm, zkey);
          const t2 = Date.now();
          times.push(t2 - t1);
        }
        if (process.send) process.send({ times });
      } else {
        if (process.send) process.send({ error: 'unknown mode' });
      }
    }
    main().catch(e => process.send && process.send({ error: e && (e.message || String(e)) }));
  `;
  writeFileSync(p, code, "utf8");
  return p;
}

function forkOnce(helperPath, payload) {
  return new Promise((resolve, reject) => {
    const child = fork(helperPath, [JSON.stringify(payload)], {
      env: { ...process.env, SNARKJS_PATH }, stdio: ["ignore", "ignore", "inherit", "ipc"]
    });
    child.on("message", (m) => m?.error ? reject(new Error(m.error)) : resolve(m));
    child.on("error", reject);
  });
}

//
// 하드햇 테스트
//
describe("PolicyVerifier 퍼포먼스 (+ KDF hardening) — hot/cold/concurrent", function () {
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

  it("E2E(pass)+KDF: 현재 회로의 hot 경로(재현성) 측정", async () => {
    const ITER = 100;
    const timings = { kdf_ms: [], fullProve_ms: [], export_ms: [], verify_ms: [], pv_static_ms: [], gas: [] };

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
        prover_age: attrs.age.toString(),
        prover_gender: attrs.gender.toString(),
        prover_country_code: attrs.nation.toString(),
        salt_age: salts.sAge.toString(),
        salt_gender: salts.sGender.toString(),
        salt_nation: salts.sNation.toString(),
        age_check_flag: publicInputsObj.age_check_flag,
        required_age: publicInputsObj.required_age,
        gender_check_flag: publicInputsObj.gender_check_flag,
        required_gender: publicInputsObj.required_gender,
        nationality_check_flag: publicInputsObj.nationality_check_flag,
        required_country_codes: publicInputsObj.required_country_codes,
        root: offchainRoot,
      };

      // KDF 부하 (증명 입력엔 영향 없음)
      const k1 = performance.now();
      kdfCostOnce({});
      const k2 = performance.now();
      timings.kdf_ms.push(k2 - k1);

      // 증명 생성
      const t1 = performance.now();
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
      const t2 = performance.now();
      timings.fullProve_ms.push(t2 - t1);

      // calldata 변환
      const t3 = performance.now();
      const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
      const t4 = performance.now();
      timings.export_ms.push(t4 - t3);

      const { a, b, c, inputs } = parseSolidityCalldata(calldata);

      // 로컬 verifier
      const t5 = performance.now();
      const ok = await verifier.verifyProof.staticCall(a, b, c, inputs);
      const t6 = performance.now();
      expect(ok).to.equal(true);
      timings.verify_ms.push(t6 - t5);

      // on-chain static
      const policyHash = ethers.keccak256(ethers.toUtf8Bytes("age>=19&KRorUS"));
      const nullifier  = ethers.ZeroHash;
      const t7 = performance.now();
      await pv.connect(user).verifyAndEmit.staticCall(1, inputs, { a, b, c }, policyHash, nullifier);
      const t8 = performance.now();
      timings.pv_static_ms.push(t8 - t7);

      // on-chain tx (가스만 수집)
      const tx = await pv.connect(user).verifyAndEmit(1, inputs, { a, b, c }, policyHash, nullifier);
      const rc = await tx.wait();
      timings.gas.push(Number(rc.gasUsed));
    }

    console.log("\n=== ZK Perf + KDF (PASS / ms) ====================");
    console.table({
      KDF:            summarize(timings.kdf_ms),
      fullProve:      summarize(timings.fullProve_ms),
      exportCalldata: summarize(timings.export_ms),
      verifyProof:    summarize(timings.verify_ms),
      pv_staticCall:  summarize(timings.pv_static_ms),
    });
    console.log("=== Gas verifyAndEmit (unit) =====================");
    console.table({ gas: summarize(timings.gas) });
  });

  it("WORST-CASE(+KDF): Cold start + Concurrent load", async () => {
    const helperPath = makeForkHelperPath();

    const baseInput = {
      prover_age: attrs.age.toString(),
      prover_gender: attrs.gender.toString(),
      prover_country_code: attrs.nation.toString(),
      salt_age: salts.sAge.toString(),
      salt_gender: salts.sGender.toString(),
      salt_nation: salts.sNation.toString(),
      age_check_flag: "1",
      required_age: "19",
      gender_check_flag: "1",
      required_gender: "0",
      nationality_check_flag: "1",
      required_country_codes: makeCountryArray({ include: attrs.nation }),
      root: offchainRoot,
    };

    // Cold start: 각 포크 프로세스가 1회만(KDF+fullProve)
    const coldTimes = [];
    for (let i = 0; i < COLD_ITER; i++) {
      const { ms } = await forkOnce(helperPath, {
        mode: "cold",
        input: baseInput, wasm: WASM, zkey: ZKEY,
        iter: KDF_ITER, keylen: KDF_KEYLEN, digest: KDF_DIGEST, saltHex: KDF_SALT,
      });
      coldTimes.push(ms);
    }

    // Concurrent: N개 포크가 각자 K회 연속(KDF+fullProve)
    const batches = await Promise.all(
      Array.from({ length: WORKERS }, () =>
        forkOnce(helperPath, {
          mode: "batch",
          input: baseInput, wasm: WASM, zkey: ZKEY, perWork: PER_WORK,
          iter: KDF_ITER, keylen: KDF_KEYLEN, digest: KDF_DIGEST, saltHex: KDF_SALT,
        })
      )
    );
    const flatHot = batches.flatMap((b) => b.times);

    console.log("\n=== Worst-Case(+KDF): Cold start fullProve (ms) ===");
    console.table({ cold: summarize(coldTimes) });
    console.log("=== Worst-Case(+KDF): Concurrent fullProve (ms) ===");
    console.table({ hotUnderLoad: summarize(flatHot) });

    expect(coldTimes.length).to.equal(COLD_ITER);
    expect(flatHot.length).to.equal(WORKERS * PER_WORK);
    expect(Math.max(...coldTimes)).to.be.greaterThan(Math.min(...flatHot));
  });
});

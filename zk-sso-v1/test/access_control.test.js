// test/access_control.test.js (ESM)

import path from "path";
import { fileURLToPath } from "url";
import * as chai from "chai";              
import chaiAsPromised from "chai-as-promised";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

chai.use(chaiAsPromised);
const { expect, assert } = chai;

// circom_tester, circomlib 등 CJS 패키지는 require로 로드
const wasm_tester = require("circom_tester").wasm;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NOTE: 회로 public 입력 순서(AccessControl.main의 public [])와 동일해야 한다.
describe("AccessControl Circuit", function () {
  this.timeout(120000);

  let circuit;

  before(async () => {
    const circuitPath = path.join(__dirname, "../circuits", "access_control.circom");
    circuit = await wasm_tester(circuitPath, {
      recompile: true,
      include: [
        path.join(__dirname, "../circuits"),
        path.join(__dirname, "../node_modules"),
      ],
    });
  });

  const PUB = {
    age_check_flag: "1",
    required_age: "19",
    gender_check_flag: "1",
    required_gender: "0", // 0: 남, 1: 여
    nationality_check_flag: "1",
    required_country_codes: ["410", "840", "0", "0", "0"], // KOR, USA, 나머지 0
  };

  it("HAPPY: 모든 조건 충족 시 witness 생성", async () => {
    const input = {
      // private inputs
      prover_age: "23",
      prover_gender: "0",
      prover_country_code: "410",
      // public inputs (순서 중요!)
      age_check_flag: PUB.age_check_flag,
      required_age: PUB.required_age,
      gender_check_flag: PUB.gender_check_flag,
      required_gender: PUB.required_gender,
      nationality_check_flag: PUB.nationality_check_flag,
      required_country_codes: PUB.required_country_codes,
    };

    const w = await circuit.calculateWitness(input, true);
    assert.ok(w);
  });

  it("HAPPY: flag=0이면 해당 제약 우회", async () => {
    const input = {
      prover_age: "5", // 나이 미달이어도
      prover_gender: "1", // 성별 불일치여도
      prover_country_code: "999",
      age_check_flag: "0",
      required_age: "120",
      gender_check_flag: "0",
      required_gender: "0",
      nationality_check_flag: "0",
      required_country_codes: ["0", "0", "0", "0", "0"],
    };
    const w = await circuit.calculateWitness(input, true);
    assert.ok(w);
  });

  it("SAD: 나이 미달 + flag=1 이면 실패", async () => {
    const input = {
      prover_age: "18",
      prover_gender: "0",
      prover_country_code: "410",
      age_check_flag: "1",
      required_age: "19",
      gender_check_flag: "0",
      required_gender: "0",
      nationality_check_flag: "0",
      required_country_codes: ["0", "0", "0", "0", "0"],
    };
    await expect(circuit.calculateWitness(input, true)).to.be.rejected;
  });

  it("SAD: 성별 불일치 + flag=1 이면 실패", async () => {
    const input = {
      prover_age: "30",
      prover_gender: "1", // 요구: 0(남)
      prover_country_code: "410",
      age_check_flag: "0",
      required_age: "19",
      gender_check_flag: "1",
      required_gender: "0",
      nationality_check_flag: "0",
      required_country_codes: ["0", "0", "0", "0", "0"],
    };
    await expect(circuit.calculateWitness(input, true)).to.be.rejected;
  });

  it("SAD: 국적 미일치 + flag=1 이면 실패", async () => {
    const input = {
      prover_age: "30",
      prover_gender: "0",
      prover_country_code: "392", // JPN
      age_check_flag: "0",
      required_age: "19",
      gender_check_flag: "0",
      required_gender: "0",
      nationality_check_flag: "1",
      required_country_codes: ["410", "840", "0", "0", "0"],
    };
    await expect(circuit.calculateWitness(input, true)).to.be.rejected;
  });

  it("SAD: flag/gender 입력은 0/1이여야 함(불리언 강제 위반)", async () => {
    const input = {
      prover_age: "30",
      prover_gender: "2", // 불리언 위반
      prover_country_code: "410",
      age_check_flag: "1",
      required_age: "19",
      gender_check_flag: "1",
      required_gender: "0",
      nationality_check_flag: "1",
      required_country_codes: ["410", "0", "0", "0", "0"],
    };
    await expect(circuit.calculateWitness(input, true)).to.be.rejected;
  });

  it("SAD: age 범위( < 2^bits ) 위반 시 실패", async () => {
    const input = {
      prover_age: "9999", // 범위초과
      prover_gender: "0",
      prover_country_code: "410",
      age_check_flag: "1",
      required_age: "19",
      gender_check_flag: "0",
      required_gender: "0",
      nationality_check_flag: "0",
      required_country_codes: ["0", "0", "0", "0", "0"],
    };
    await expect(circuit.calculateWitness(input, true)).to.be.rejected;
  });
});

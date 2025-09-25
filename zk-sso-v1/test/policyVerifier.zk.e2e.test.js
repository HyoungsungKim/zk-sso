// test/policyVerifier.zk.e2e.test.js  (ESM)
import { expect } from "chai";
import hre from "hardhat";
import * as snarkjs from "snarkjs";
import { readFile } from "fs/promises";
const { ethers } = hre;

//
// helper: snarkjs calldata -> (a,b,c,inputs) 파싱
//
function parseSolidityCalldata(calldata) {
    // calldata: '[[a0,a1],[[b00,b01],[b10,b11]],[c0,c1],[in0,in1,...]]'
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

describe("PolicyVerifierA + real zk proof (wasm/zkey)", function () {
    let owner, issuer, user;
    let nft, pv, verifier;
    
    // 경로는 프로젝트 구조에 맞게 조정
    const WASM = "./zk/access_control.wasm";  
    const ZKEY = "./zk/access_control_0001.zkey";
    
    beforeEach(async () => {
        [owner, issuer, user] = await ethers.getSigners();
        
        // 1) Verifier.sol은 반드시 ZKEY에서 export된 동일 파일이어야 함
        const Verifier = await ethers.getContractFactory("Groth16Verifier");
        verifier = await Verifier.deploy();
        await verifier.waitForDeployment();
        
        // 2) IdentityNFT 배포 및 발급자/오픈모드 설정
        const NFT = await ethers.getContractFactory("IdentityNFT");
        nft = await NFT.deploy();
        await nft.waitForDeployment();
        
        // 오픈모드 쓰거나 issuer allowlist를 병행할 수 있음
        await nft.connect(owner).setOpenIssuerMode(true); // PoC라 편하게
        
        // 3) PolicyVerifierA 배포(위에서 배포한 verifier 주소 사용)
        const PV = await ethers.getContractFactory("PolicyVerifier");
        pv = await PV.deploy(await verifier.getAddress(), await nft.getAddress());
        await pv.waitForDeployment();
        
        // issuer allowlist를 끄면 발급자 체크 스킵
        await pv.connect(owner).setRequireIssuerAllowlist(false);
        
        // 4) NFT 민팅
        const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
        await nft.connect(issuer).mint(user.address, exp, ethers.ZeroHash); // tokenId = 1
    });
    
    it("happy path: offchain fullProve -> onchain verifyProof -> pv.verifyAndEmit emits", async () => {
        // ---- UI와 동일한 정책/개인 입력 구성 ----
        const max5 = 5;
        const publicInputsObj = {
            age_check_flag: "1",
            required_age: "19",
            gender_check_flag: "1",
            required_gender: "0",     // 남=0, 여=1 (네 회로 정의와 일치해야 함)
            nationality_check_flag: "1",
            required_country_codes: ["410","840","0","0","0"] // (KOR,USA, -, -, -)
        };
        const priv = {
            prover_age: "23",
            prover_gender: "0",       // 남=0
            prover_country_code: "410"
        };
        
        // ---- witness & proof 생성 ----
        const input = {
            // private 먼저
            prover_age: priv.prover_age,
            prover_gender: priv.prover_gender,
            prover_country_code: priv.prover_country_code,
            // public (회로 public 순서와 반드시 동일!)
            age_check_flag: publicInputsObj.age_check_flag,
            required_age: publicInputsObj.required_age,
            gender_check_flag: publicInputsObj.gender_check_flag,
            required_gender: publicInputsObj.required_gender,
            nationality_check_flag: publicInputsObj.nationality_check_flag,
            required_country_codes: publicInputsObj.required_country_codes
        };
        
        // 파일은 Node에서 직접 읽을 필요 없음. snarkjs는 경로 문자열을 받아도 됨.
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
        
        
        // 온체인 Solidity 형식으로 변환
        const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
        const { a, b, c, inputs } = parseSolidityCalldata(calldata);
        
        // --- 온체인 Verifier 직접 시뮬레이션(강추: 디버깅에 제일 도움 됨) ---
        const ok = await verifier.verifyProof.staticCall(a, b, c, inputs);
        expect(ok).to.equal(true);
        
        // --- PolicyVerifierA 경로로도 성공해야 함 ---
        const policyHash = ethers.keccak256(ethers.toUtf8Bytes("age>=19&KRorUS"));
        const nullifier = ethers.ZeroHash;
        
        await expect(
            pv.connect(user).verifyAndEmit(1, inputs, { a, b, c }, policyHash, nullifier)
        ).to.emit(pv, "Verified").withArgs(user.address, 1, policyHash, nullifier);
    });
    
    it("revert: tweak one public input -> INVALID_PROOF", async () => {
        // 정상 입력으로 증명 만들고…
        const input = {
            prover_age: "23",
            prover_gender: "0",
            prover_country_code: "410",
            age_check_flag: "1",
            required_age: "19",
            gender_check_flag: "1",
            required_gender: "0",
            nationality_check_flag: "1",
            required_country_codes: ["410","840","0","0","0"]
        };
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
        const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
        const parsed = parseSolidityCalldata(calldata);
        
        // publicSignals 하나를 살짝 비틀어서 실패 유도
        const badInputs = parsed.inputs.map(x => x);                    // 길이 11 유지
        badInputs[0] = (BigInt(badInputs[0]) + 1n).toString();          // 값만 살짝 변경
        const policyHash = ethers.keccak256(ethers.toUtf8Bytes("age>=19&KRorUS"));        
        await expect(
            pv.connect(user).verifyAndEmit(
                1,
                badInputs,                                                  // ← 여기로 전달
                { a: parsed.a, b: parsed.b, c: parsed.c },                 // ← proof는 그대로
                policyHash,
                ethers.ZeroHash
            )
        ).to.be.revertedWith("INVALID_PROOF");
        
    });
});

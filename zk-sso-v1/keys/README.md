access_controlTrusted setup

https://docs.circom.io/getting-started/proving-circuits/#verifying-from-a-smart-contract

snarkjs powersoftau new bn128 14 pot12_0000.ptau -v

snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="First contribution" -v

snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v


snarkjs groth16 setup ../build/access_control.r1cs pot12_final.ptau access_control_0000.zkey

snarkjs zkey contribute access_control_0000.zkey access_control_0001.zkey --name="1st Contributor Name" -v

snarkjs zkey export verificationkey access_control_0001.zkey verification_key.json

#snarkjs groth16 prove access_control_0001.zkey ../build/witness.wtns proof.json public.json

snarkjs zkey export solidityverifier access_control_0001.zkey ../contracts/verifier.sol


### **각 결과물은 누가, 어떻게 사용하고 관리해야 하는가?**

| 파일 | 파일의 정체 | 누가 필요한가? | 어떻게 전달/배포해야 하는가? | 보안 수준 |
| :--- | :--- | :--- | :--- | :--- |
| **`pot...ptau`** | 키 생성을 위한 중간 재료 | **오직 개발자 (당신)** | **공개할 필요 없음.** 키 생성 후에는 안전하게 보관하거나 삭제해도 무방. | 민감하지 않음 |
| **`access_control.zkey` (Proving Key)** | **증명 생성기** | **사용자 (User Client)** | **클라이언트 앱에 포함하여 배포.** 웹사이트라면 서버에서 다운로드 받게 하거나, 모바일 앱이라면 앱 번들에 포함. | **공개(Public)** |
| **`verification_key.json`**| **증명 검증기 (데이터 형태)** | **오직 개발자 (당신)** | **`Verifier.sol`을 생성하는 데만 사용.** 그 후에는 공개할 필요 없음. | 공개(Public) |
| **`Verifier.sol`** | **증명 검증기 (컨트랙트 형태)**| **`L2B_LoanVerifier.sol`** | **L2-B 체인에 배포.** `L2B_LoanVerifier` 컨트랙트는 이 배포된 컨트랙트의 주소를 참조. | **온체인 공개** |
| **`access_control.wasm`** | **증인(Witness) 계산기** | **사용자 (User Client)** | **`.zkey` 파일과 함께 클라이언트 앱에 포함하여 배포.** | **공개(Public)** |



1) 전체 흐름(요약): 연결 → 루트계산/민팅 → 검증
```mermaid

sequenceDiagram
    autonumber
    actor User as User
    participant UI as Browser UI (index.html)
    participant Wallet as MetaMask/Wallet
    participant Sepolia as Ethereum Node (Sepolia)
    participant NFT as IdentityNFT
    participant PV as PolicyVerifier
    participant Verifier as Groth16Verifier

    User->>UI: 페이지 열기
    UI->>Wallet: eth_chainId, wallet_switchEthereumChain
    Wallet-->>UI: 승인/연결 (eth_requestAccounts)
    UI->>UI: artifacts 로드(ABI) → new Contract(NFT/PV)
    UI-->>User: 지갑 연결 상태 표시

    alt 루트 계산
      Note over UI: ② Poseidon으로 루트 계산<br/>leaf=H(tag,val,salt) / root=H(leaves)
      User->>UI: "🧮 루트 계산" 클릭
      UI->>UI: buildPoseidonOpt() 로드 → 루트 계산<br/>(age, gender, nation + salts)
      UI-->>User: calcRoot 표시
    end

    alt 민팅
      Note over UI,NFT: ③ 민팅(오픈 모드)
      User->>UI: "🪪 민팅" (to, expiresAt, root)
      UI->>NFT: mint(to, exp, root)
      NFT->>Sepolia: 트랜잭션
      Sepolia-->>NFT: 채굴/확정
      NFT-->>UI: 로그/이벤트(issued, tokenId)
      UI-->>User: tokenId 표시
    end

    alt 검증
      Note over UI,NFT: ④ 검증 준비
      User->>UI: tokenId 입력, 정책 입력(공개), 프라이빗 속성/솔트 입력
      UI->>NFT: ownerOf / revoked / expiresAt / attrCommitRoot
      NFT-->>UI: onchainRoot
      UI->>UI: (안전) 로컬에서 루트 재계산 =? onchainRoot
      UI-->>User: 불일치시 오류
    end

    alt staticCall (사전 시뮬레이션 - gas X)
      UI->>PV: verifyAndEmit.staticCall(tokenId, publicSignals, proof, policyHash, nullifier)
      PV->>Verifier: verifyProof(a,b,c,inputs)
      Verifier-->>PV: true
      PV-->>UI: staticCall OK
    else revert
      PV-->>UI: revert (NOT_OWNER/REVOKED/EXPIRED/ROOT_MISMATCH 등)
    end

    UI->>PV: verifyAndEmit(...) (실 트랜잭션 - gas O)
    PV->>Verifier: verifyProof(a,b,c,inputs)
    Verifier-->>PV: true
    PV->>NFT: attrCommitRoot(tokenId) == inputs[last]
    NFT-->>PV: root 확인 OK
    PV-->>Sepolia: 이벤트 기록
    PV-->>UI: 이벤트 Verified(user, tokenId, policyHash, nullifier)
    UI-->>User: 검증 성공/tx hash 표시
```

2) 증명 생성 분기: (A) 브라우저에서 fullProve vs (B) 파일 업로드
 ```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant UI as Browser UI
    participant WASM as access_control.wasm/.zkey (HTTP)
    participant SNARK as snarkjs (browser)
    participant PV as PolicyVerifier
    participant Verifier as Groth16Verifier
    participant NFT as IdentityNFT

    Note over UI: 공통 준비: 정책/속성/솔트 입력, onchainRoot 조회/검증

    alt (A) 브라우저에서 증명 생성
        UI->>WASM: GET ../zk/access_control.wasm / .zkey
        WASM-->>UI: 파일 응답 (CORS 필요)
        UI->>SNARK: groth16.fullProve(input, wasm, zkey)
        SNARK-->>UI: { proof, publicSignals }
        UI->>SNARK: exportSolidityCallData(proof, publicSignals)
        SNARK-->>UI: calldata → a,b,c,inputs 파싱
    else (B) proof/public 업로드
        User->>UI: public.json, proof.json 업로드
        UI->>SNARK: exportSolidityCallData(proof, public)
        SNARK-->>UI: calldata → a,b,c,inputs 파싱
    end

    UI->>PV: verifyAndEmit.staticCall(...)
    PV->>Verifier: verifyProof(a,b,c,inputs)
    Verifier-->>PV: true
    PV-->>UI: static OK

    UI->>PV: verifyAndEmit(...) (tx)
    PV->>Verifier: verifyProof(a,b,c,inputs)
    PV->>NFT: attrCommitRoot(tokenId) == inputs[last]
    PV-->>UI: 이벤트 Verified(...)
```

1) 실패/예외 플로우(대표 케이스)
```mermaid
sequenceDiagram
    autonumber
    participant UI as Browser UI
    participant NFT as IdentityNFT
    participant PV as PolicyVerifier
    participant Verifier as Groth16Verifier

    UI->>NFT: ownerOf / revoked / expiresAt
    NFT-->>UI: {owner, revoked, expiresAt}
    alt NOT_OWNER / REVOKED / EXPIRED
        UI-->>UI: 즉시 실패 처리 (클라이언트 UX)
    else 상태 정상
        UI->>PV: verifyAndEmit.staticCall(...)
        alt 회로 미일치/루트 불일치
            PV->>Verifier: verifyProof(...)
            Verifier-->>PV: false
            PV-->>UI: revert("INVALID_PROOF" 등)
        else 정책 위반(회로 내부 불만족)
            PV->>Verifier: verifyProof(...)
            Verifier-->>PV: true/false (회로에서 이미 실패)
            PV-->>UI: revert
        end
    end
```
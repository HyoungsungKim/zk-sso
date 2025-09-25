// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/IVerifier.sol";
import "./interface/IIdentityNFT.sol";

contract PolicyVerifier is Ownable {
    struct ProofABC {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    IVerifier public immutable verifier;
    IIdentityNFT public immutable nft;

    mapping(address => bool) public issuerAllowed;
    mapping(bytes32 => bool) public usedNullifier;
    bool public requireIssuerAllowlist;

    event IssuerAllowed(address issuer, bool allowed);
    event RequireIssuerAllowlistSet(bool enabled);
    event Verified(address indexed user, uint256 indexed tokenId, bytes32 policyHash, bytes32 nullifier);

    constructor(address _verifier, address _nft) Ownable(msg.sender) {
        verifier = IVerifier(_verifier);
        nft = IIdentityNFT(_nft);
    }

    function setIssuerAllowed(address issuer, bool allowed) external onlyOwner {
        issuerAllowed[issuer] = allowed;
        emit IssuerAllowed(issuer, allowed);
    }

    function setRequireIssuerAllowlist(bool enabled) external onlyOwner {
        requireIssuerAllowlist = enabled;
        emit RequireIssuerAllowlistSet(enabled);
    }

    function verifyAndEmit(
        uint256 tokenId,
        uint256[] calldata publicInputs,   // ✅ 동적 수신
        ProofABC calldata proof,
        bytes32 policyHash,
        bytes32 nullifier
    ) external {
        // --- 소유/상태 체크 ---
        require(nft.ownerOf(tokenId) == msg.sender, "NOT_OWNER");
        require(!nft.revoked(tokenId), "REVOKED");
        require(block.timestamp < nft.expiresAt(tokenId), "EXPIRED");

        if (requireIssuerAllowlist) {
            address issuer = nft.issuerOf(tokenId);
            require(issuerAllowed[issuer], "ISSUER_NOT_ALLOWED");
        }

        if (nullifier != bytes32(0)) {
            require(!usedNullifier[nullifier], "NULLIFIER_USED");
            usedNullifier[nullifier] = true;
        }

        // --- publicSignals 길이 검증 + 루트 바인딩 ---
        require(publicInputs.length == 12, "BAD_PUBSIG_LEN");  // ✅ 회로/Verifier와 동일
        bytes32 rootFromProof = bytes32(publicInputs[11]);     // ✅ 마지막이 Merkle root
        require(rootFromProof == nft.attrCommitRoot(tokenId), "ROOT_MISMATCH");

        // --- 동적 -> 고정길이 복사 ---
        uint256[12] memory pub;
        for (uint256 i = 0; i < 12; i++) {
            pub[i] = publicInputs[i];
        }

        // --- zk 검증 ---
        bool ok = verifier.verifyProof(proof.a, proof.b, proof.c, pub);
        require(ok, "INVALID_PROOF");

        emit Verified(msg.sender, tokenId, policyHash, nullifier);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IIdentityNFT {
    // --- 관리/발급 ---
    function setIssuer(address issuer, bool allowed) external;
    function mint(address to, uint64 exp, bytes32 root) external returns (uint256 tokenId);
    function revoke(uint256 tokenId) external;
    function updateRoot(uint256 tokenId, bytes32 newRoot) external;

    // --- 조회 (PolicyVerifierA가 사용) ---
    function ownerOf(uint256 id) external view returns (address);
    function issuerOf(uint256 id) external view returns (address);
    function expiresAt(uint256 id) external view returns (uint64);
    function revoked(uint256 id) external view returns (bool);
}

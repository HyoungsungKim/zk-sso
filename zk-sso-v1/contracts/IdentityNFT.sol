// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract IdentityNFT is ERC721, Ownable {
    error Soulbound();
    error NotIssuer();
    error NotTokenIssuer();

    mapping(address => bool) public isIssuer;
    mapping(uint256 => address) public issuerOf;
    mapping(uint256 => uint64)  public expiresAt;
    mapping(uint256 => bool)    public revoked;
    mapping(uint256 => bytes32) public attrCommitRoot;

    uint256 private _nextId = 1;

    bool public openIssuerMode; // ✅ 오픈 발급 스위치
    event IssuerUpdated(address indexed issuer, bool allowed);
    event OpenIssuerModeSet(bool enabled);

    event Issued(uint256 indexed tokenId, address indexed to, address indexed issuer, uint64 exp, bytes32 attrRoot);
    event Revoked(uint256 indexed tokenId);
    event RootUpdated(uint256 indexed tokenId, bytes32 newRoot);

    constructor() ERC721("IdentitySBT", "ID-SBT") Ownable(msg.sender) {}

    // 기존 화이트리스트 유지(원하면 사용)
    function setIssuer(address issuer, bool allowed) external onlyOwner {
        isIssuer[issuer] = allowed;
        emit IssuerUpdated(issuer, allowed);
    }

    // ✅ 오픈 발급 on/off
    function setOpenIssuerMode(bool enabled) external onlyOwner {
        openIssuerMode = enabled;
        emit OpenIssuerModeSet(enabled);
    }

    function mint(address to, uint64 exp, bytes32 root) external returns (uint256 tokenId) {
        // ✅ 오픈 모드가 아니면 화이트리스트 체크
        if (!openIssuerMode && !isIssuer[msg.sender]) revert NotIssuer();

        tokenId = _nextId++;
        _safeMint(to, tokenId);

        issuerOf[tokenId] = msg.sender;
        expiresAt[tokenId] = exp;
        if (root != bytes32(0)) {
            attrCommitRoot[tokenId] = root;
        }

        emit Issued(tokenId, to, msg.sender, exp, root);
    }

    function revoke(uint256 tokenId) external {
        // ✅ 항상 "그 토큰의 발급자"만 가능
        if (issuerOf[tokenId] != msg.sender) revert NotTokenIssuer();
        revoked[tokenId] = true;
        emit Revoked(tokenId);
    }

    function updateRoot(uint256 tokenId, bytes32 newRoot) external {
        if (issuerOf[tokenId] != msg.sender) revert NotTokenIssuer();
        attrCommitRoot[tokenId] = newRoot;
        emit RootUpdated(tokenId, newRoot);
    }

    // SBT: 전송 금지
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}

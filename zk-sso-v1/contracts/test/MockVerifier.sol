// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockVerifier {
    bool public shouldVerify = true;

    function setResult(bool ok) external {
        shouldVerify = ok;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[] calldata
    ) external view returns (bool) {
        return shouldVerify;
    }
}

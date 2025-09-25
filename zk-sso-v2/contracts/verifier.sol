// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 1654514209938045494752287269784961585301213391759521088078111715468196357880;
    uint256 constant alphay  = 17777188529633832246709721299608058884571452582770826480944907255742488568863;
    uint256 constant betax1  = 15726658190622301527590400515779385580240441767259279917828184895982718161385;
    uint256 constant betax2  = 79708047547648870452895665410614032665644102253506632023776059884467373674;
    uint256 constant betay1  = 2296325701263888846040741366388269266415243195349452254964243056907803088153;
    uint256 constant betay2  = 13731490493531567664024745821920875978958426015120730749856004823481557142943;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 3215173130430882669855552152288942656341397664929132817316395232954626370690;
    uint256 constant deltax2 = 19768808275500724759859834785048890280556576549296417991881448011415323153507;
    uint256 constant deltay1 = 733048909388276372345538490821697272710256313837035585788565188599305574444;
    uint256 constant deltay2 = 12654069709752824324960093744426434676189312115124092194592941434530147321268;

    
    uint256 constant IC0x = 1516261461787360393796807873932455998422402781835719600371841064996093360722;
    uint256 constant IC0y = 1975923516198046113423963913162994040372146863149932693129526316944145840642;
    
    uint256 constant IC1x = 10830075060301760871780075276997525659735978127281425702761769570053744924170;
    uint256 constant IC1y = 7182104675779277584487117964008010276114861104848474654553855777139143410434;
    
    uint256 constant IC2x = 20177760285123921601026969896960640421142712386521770775180150752712194056157;
    uint256 constant IC2y = 15852669354966441937691650513661516528734801074410987358987112035066548670484;
    
    uint256 constant IC3x = 7748215400688189072021116745675341997112780764820936249552299063994607424474;
    uint256 constant IC3y = 4138493952804411186458938826849239280592742296382983855008157059169876652454;
    
    uint256 constant IC4x = 15780820030384352741232674799953331074006419353368270664258390703903212682208;
    uint256 constant IC4y = 2169952260992447911190544358462218763371353170348004422527353915843359199166;
    
    uint256 constant IC5x = 4409018938103393052476963445229683038984840874830184646048838526638927730278;
    uint256 constant IC5y = 14188191199807414321816957154154466403489969336106522220836667710606395573002;
    
    uint256 constant IC6x = 7631471797447834402797575802323258857662611447386763933296847242228085453671;
    uint256 constant IC6y = 10879280313600125698919047690342148827509174661714505600150758654739725142191;
    
    uint256 constant IC7x = 20501331046064325419347241061967637718016983348332838277600251327244899480610;
    uint256 constant IC7y = 2849902021126762160758267729108195188255023740903741172588852968980837632836;
    
    uint256 constant IC8x = 11556990751109452470726192040905069195891443099457819511078801299417769301115;
    uint256 constant IC8y = 9393463292661236259809730582316049547850804973994511580368974306232360619271;
    
    uint256 constant IC9x = 13230244228009691533080358945160202147374061279413207347910281279521224208740;
    uint256 constant IC9y = 6532452605200007784733397483632772103065393312941292138697050407682642833357;
    
    uint256 constant IC10x = 4170308047579754979544652228623048363773143680099553193169015331570411712495;
    uint256 constant IC10y = 16246023748296678489151646818048405433618795018419112356711116223293641883562;
    
    uint256 constant IC11x = 2581203816116835589417873630102835442450305222574296255793812450513637661222;
    uint256 constant IC11y = 6524221748903832484356191123671738975148476827585659729525844715179044300947;
    
    uint256 constant IC12x = 13674735186982098978990359273273711796873192419692050489737717212489937610929;
    uint256 constant IC12y = 16940866524872300892439974164586985212433173413887362179554920235157622150452;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[12] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }

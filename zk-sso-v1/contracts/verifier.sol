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
    uint256 constant alphax  = 5886486145491843899542482291012857389441988264972041995573853319995973561493;
    uint256 constant alphay  = 1917298093188372949114499503673968692840881379158443045917115152931444581556;
    uint256 constant betax1  = 10479419401784274784182216025525924863715717531450628860878555103227772629823;
    uint256 constant betax2  = 18107324884892267528779313647462030816569485394113913045532005665977171102726;
    uint256 constant betay1  = 6294778561148242442573318207450008197547610956926902397579603885400971381819;
    uint256 constant betay2  = 8893528236572631386757552343932346291249168058138917553271868144001988276884;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 12708042894601982317585935692073915184500257118461508483978085535082556756815;
    uint256 constant deltax2 = 17867586908131452195459813079988643260915192031070213428505719705650069381594;
    uint256 constant deltay1 = 19483782086538992415187968954518490482917768583448001508420791633073764029131;
    uint256 constant deltay2 = 11694147129314599431362061044916361637334789032481785480165800525574749417739;

    
    uint256 constant IC0x = 356473910703710820125020105744711110303083579845641325771165220676393530263;
    uint256 constant IC0y = 5975204533157018832099857588233111340260970496222666595234247759078010108389;
    
    uint256 constant IC1x = 16037237605956664766772835381018187502013331860626487606467278819903107125755;
    uint256 constant IC1y = 21474197628505035309073884360430510214175184822500898470752946774873576257800;
    
    uint256 constant IC2x = 20994727415285696056068373639406790440433976539236759130286308290784102163988;
    uint256 constant IC2y = 1301520971798635470224111691963812667091723171245093716912915408000298926612;
    
    uint256 constant IC3x = 10567761038157896665694276341841927056671171139032930695958094360433269577391;
    uint256 constant IC3y = 9024316175127005877760347800942775386520509020240090255695501400245821499444;
    
    uint256 constant IC4x = 8943906907370382382832544587445587346872826035624546181135014073503929029857;
    uint256 constant IC4y = 19494559910136831270181151947334807437752262051595084267875652616128875735969;
    
    uint256 constant IC5x = 4577073731450805674083755528551947043764101966212293793172129806986294704035;
    uint256 constant IC5y = 12783825627163521800829853526557552108682075804342508820698843472150774427837;
    
    uint256 constant IC6x = 6638934207336213742806478854507271212363217818168673155073286344309037937218;
    uint256 constant IC6y = 18867435014940928889438382105978475461041236517397545284979159341751440064085;
    
    uint256 constant IC7x = 6431030603138788846194244011647044187268186959422540874576460332494557339709;
    uint256 constant IC7y = 13897022571069863731357797409894766279018677485830285578280329170032076367561;
    
    uint256 constant IC8x = 3726037678582262949844302004217100383372174939141392158235692558390284674505;
    uint256 constant IC8y = 4385664215423794754151146446324822710604236028711157218693458432715230073503;
    
    uint256 constant IC9x = 10688246956323440097041381665599948183466159721632993607809007012495232313742;
    uint256 constant IC9y = 21226472189104454405456648385422229435882843949900187298439523653216312643573;
    
    uint256 constant IC10x = 20411129639766468926582228013008637104163582270087736671911263084312280430327;
    uint256 constant IC10y = 14001907623658398525673507682841203531701221317538099409842828966357830588757;
    
    uint256 constant IC11x = 9320896705724373961663898661279763961463375862899007980497108717706512148805;
    uint256 constant IC11y = 11231303006231565347685703541256560537978747445562408495415206782328320686036;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[11] calldata _pubSignals) public view returns (bool) {
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
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }

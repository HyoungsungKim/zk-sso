pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

template DualMux() {
    signal input in[2];
    signal input sel; // selctor signal, 0 or 1
    signal output out[2];

    sel * (1 - sel) === 0;

    out[0] <== (in[1] - in[0]) * sel + in[0];
    out[1] <== (in[0] - in[1]) * sel + in[1];
}

template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input root;

    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal computed_root[levels+1];

    component muxers[levels];
    component hasher[levels];

    computed_root[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        muxers[i] = DualMux();

        muxers[i].in[0] <== computed_root[i];
        muxers[i].in[1] <== pathElements[i];
        muxers[i].sel <== pathIndices[i];

        hasher[i] = Poseidon(2);
        hasher[i].inputs[0] <== muxers[i].out[0];
        hasher[i].inputs[1] <== muxers[i].out[1];
        
        computed_root[i+1] <== hasher[i].out;
    }

    root === computed_root[levels];
}
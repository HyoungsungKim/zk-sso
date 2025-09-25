pragma circom 2.1.5;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/gates.circom";

template GenderCheck() {
    signal input gender;           // 0/1
    signal input required_gender;  // 0/1
    signal input flag;             // 0/1
    signal output out;             // 0/1

    // booleanity (강제)
    gender * (gender - 1) === 0;
    required_gender * (required_gender - 1) === 0;

    component is_equal = IsEqual();
    is_equal.in[0] <== gender;
    is_equal.in[1] <== required_gender;

    out <== flag * is_equal.out + (1 - flag);
}

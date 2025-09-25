pragma circom 2.1.5;

include "circomlib/circuits/comparators.circom"; // LessThan/GreaterEqThan
include "circomlib/circuits/gates.circom";
include "./constant.circom";

template AgeCheck() {
    signal input age;
    signal input required_age;
    signal input flag;     // 0/1
    signal output out;     // 0/1

    component geqt = GreaterEqThan(get_max_age_bits());
    geqt.in[0] <== age;
    geqt.in[1] <== required_age;

    // flag=0 -> 1 (우회), flag=1 -> geq 결과
    out <== flag * geqt.out + (1 - flag);
}

pragma circom 2.1.5;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/gates.circom";
include "./constant.circom";
include "./age_check.circom";
include "./gender_check.circom";
include "./nationality_check.circom";

template And2() {
    signal input a; signal input b; signal output out;
    component and_ = AND(); and_.a <== a; and_.b <== b; out <== and_.out;
}

template LeafHash3() {
    signal input tag;    // 1=age, 2=gender, 3=nation
    signal input val;    // 속성값
    signal input salt;   // 비공개 salt
    signal output out;
    component p = Poseidon(3);
    p.inputs[0] <== tag;
    p.inputs[1] <== val;
    p.inputs[2] <== salt;
    out <== p.out;
}

// ★ 경로 없는(PoC) 버전: MerkleTreeChecker 사용 안 함
template AccessControlNoPath() {
    var max_age = get_max_age();
    var max_age_bits = get_max_age_bits();
    var max_country_number = get_max_country_number(); // 5

    // private
    signal input prover_age;
    signal input prover_gender;          // 0/1
    signal input prover_country_code;
    signal input salt_age;
    signal input salt_gender;
    signal input salt_nation;

    // public(정책)
    signal input age_check_flag;         // 0/1
    signal input required_age;
    signal input gender_check_flag;      // 0/1
    signal input required_gender;        // 0/1
    signal input nationality_check_flag; // 0/1
    signal input required_country_codes[max_country_number];

    // public(root)
    signal input root;

    // output
    signal output is_valid;

    // booleanity & range
    age_check_flag * (age_check_flag - 1) === 0;
    gender_check_flag * (gender_check_flag - 1) === 0;
    nationality_check_flag * (nationality_check_flag - 1) === 0;
    prover_gender * (prover_gender - 1) === 0;
    required_gender * (required_gender - 1) === 0;

    component lt_age = LessThan(max_age_bits);
    lt_age.in[0] <== prover_age; lt_age.in[1] <== max_age; lt_age.out === 1;
    component lt_req_age = LessThan(max_age_bits);
    lt_req_age.in[0] <== required_age; lt_req_age.in[1] <== max_age; lt_req_age.out === 1;

    // 정책 체크
    component age_check = AgeCheck();
    age_check.age <== prover_age;
    age_check.required_age <== required_age;
    age_check.flag <== age_check_flag;

    component gender_check = GenderCheck();
    gender_check.gender <== prover_gender;
    gender_check.required_gender <== required_gender;
    gender_check.flag <== gender_check_flag;

    component nationality_check = NationalityCheck();
    nationality_check.prover_country_code <== prover_country_code;
    nationality_check.flag <== nationality_check_flag;
    for (var i = 0; i < max_country_number; i++) {
        nationality_check.required_country_codes[i] <== required_country_codes[i];
    }

    // leaf = Poseidon(tag, val, salt)
    component h_age = LeafHash3();    h_age.tag <== 1; h_age.val <== prover_age;         h_age.salt <== salt_age;
    component h_gender = LeafHash3(); h_gender.tag <== 2; h_gender.val <== prover_gender; h_gender.salt <== salt_gender;
    component h_nation = LeafHash3(); h_nation.tag <== 3; h_nation.val <== prover_country_code; h_nation.salt <== salt_nation;

    // ★ 경로 없이 root 집계: Poseidon(3)(ageLeaf, genderLeaf, nationLeaf)
    component agg = Poseidon(3);
    agg.inputs[0] <== h_age.out;
    agg.inputs[1] <== h_gender.out;
    agg.inputs[2] <== h_nation.out;

    // public root와 동일해야 함
    root === agg.out;

    // 최종 정책 AND
    component and01 = And2(); and01.a <== age_check.out; and01.b <== gender_check.out;
    component and12 = And2(); and12.a <== and01.out;     and12.b <== nationality_check.out;
    is_valid <== and12.out;
    is_valid === 1;
}

// main: public 입력 순서 = 기존 정책 10개 + root(1개) = 총 11개
component main {
    public [
        age_check_flag,
        required_age,
        gender_check_flag,
        required_gender,
        nationality_check_flag,
        required_country_codes, // 5개
        root
    ]
} = AccessControlNoPath();

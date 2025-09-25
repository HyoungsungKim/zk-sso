pragma circom 2.1.5;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/gates.circom";
include "./constant.circom";
include "./age_check.circom";
include "./gender_check.circom";
include "./nationality_check.circom";

// 2-input AND 체인용 유틸(필요시)
template And2() {
    signal input a;
    signal input b;
    signal output out;
    component and_ = AND();
    and_.a <== a;
    and_.b <== b;
    out <== and_.out;
}

// 메인 액세스 컨트롤 회로
template AccessControl() {
    var max_age = get_max_age();
    var max_age_bits = get_max_age_bits();
    var max_country_number = get_max_country_number();

    signal input prover_age;             // private 권장
    signal input age_check_flag;         // 0/1
    signal input required_age;

    signal input prover_gender;          // 0/1
    signal input gender_check_flag;      // 0/1
    signal input required_gender;        // 0/1

    signal input prover_country_code;
    signal input nationality_check_flag; // 0/1
    signal input required_country_codes[max_country_number];

    signal output is_valid;              // 최종 결과(0/1)

    // ---- Booleanity constraints (0/1 보장) ----
    age_check_flag * (age_check_flag - 1) === 0;
    gender_check_flag * (gender_check_flag - 1) === 0;
    nationality_check_flag * (nationality_check_flag - 1) === 0;
    prover_gender * (prover_gender - 1) === 0;
    required_gender * (required_gender - 1) === 0;

    // ---- Range constraints (Age inputs within 2^bits) ----
    // 간단히 LessThan로 상한을 잡습니다. (선택)
    component lt_age = LessThan(max_age_bits);
    component lt_req_age = LessThan(max_age_bits);
    lt_age.in[0] <== prover_age;
    lt_age.in[1] <== max_age; // max_age < 2^max_age_bits 가정
    lt_req_age.in[0] <== required_age;
    lt_req_age.in[1] <== max_age;
    // 결과를 실제로 사용해 강제
    lt_age.out === 1;
    lt_req_age.out === 1;

    // 나이 확인
    component age_check = AgeCheck();
    age_check.age <== prover_age;
    age_check.required_age <== required_age;
    age_check.flag <== age_check_flag;

    // 성별 확인
    component gender_check = GenderCheck();
    gender_check.gender <== prover_gender;
    gender_check.required_gender <== required_gender;
    gender_check.flag <== gender_check_flag;

    // 국적 확인
    component nationality_check = NationalityCheck();
    nationality_check.prover_country_code <== prover_country_code;
    nationality_check.flag <== nationality_check_flag;
    for (var i = 0; i < max_country_number; i++) {
        nationality_check.required_country_codes[i] <== required_country_codes[i];
    }

    // AND: 3항 AND를 체인으로
    component and01 = And2();
    and01.a <== age_check.out;
    and01.b <== gender_check.out;

    component and12 = And2();
    and12.a <== and01.out;
    and12.b <== nationality_check.out;

    is_valid <== and12.out;

    // 디버그 로그 (선택)
    // log("Age Check Output: ", age_check.out);
    // log("Gender Check Output: ", gender_check.out);
    // log("Nationality Check Output: ", nationality_check.out);
    // log("Final is_valid: ", is_valid);

    // 최종 강제 (모든 조건 만족 시에만 증명 생성 가능)
    is_valid === 1;
}

component main {
    // 정책/플래그만 public로 유지하는 구성이 일반적입니다.
    public [age_check_flag, required_age, gender_check_flag, required_gender, nationality_check_flag, required_country_codes]
} = AccessControl();

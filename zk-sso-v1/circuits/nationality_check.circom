pragma circom 2.1.5;

include "../node_modules/circomlib/circuits/comparators.circom"; // IsZero
include "../node_modules/circomlib/circuits/gates.circom";
include "./constant.circom";

/*
 * prover_country_code: 증명자의 국적 코드
 * required_country_codes: 요구된 국적 코드 리스트
 * flag: 0이면 제약 비활성화(항상 통과), 1이면 적용
 * out: 0/1
 */
template NationalityCheck() {
    var max_country_number = get_max_country_number();

    signal input prover_country_code;
    signal input required_country_codes[max_country_number];
    signal input flag; // 0/1
    signal output out; // 0/1

    component is_equal[max_country_number];
    signal is_in_set_results[max_country_number];

    for (var i = 0; i < max_country_number; i++) {
        is_equal[i] = IsEqual();
        is_equal[i].in[0] <== prover_country_code;
        is_equal[i].in[1] <== required_country_codes[i];
        is_in_set_results[i] <== is_equal[i].out;
    }

    // 합계 계산
    signal sum_of_results;
    signal prefix[max_country_number];
    prefix[0] <== is_in_set_results[0];
    for (var j = 1; j < max_country_number; j++) {
        prefix[j] <== prefix[j-1] + is_in_set_results[j];
    }
    sum_of_results <== prefix[max_country_number - 1];

    // sum > 0 인지 여부(OR 축약)
    component isZero = IsZero();
    isZero.in <== sum_of_results;
    signal isMember;     // 0/1
    isMember <== 1 - isZero.out;

    // flag=0 -> 1, flag=1 -> isMember
    out <== flag * isMember + (1 - flag);
}

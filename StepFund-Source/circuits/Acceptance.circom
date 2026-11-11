pragma circom 2.2.3;
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// Only the commitment, agreed bounds and domain are public. The assessor
// must check the private measurement against the real deliverable off chain.
template Acceptance() {
    signal input value;
    signal input salt;
    signal input minimum;
    signal input maximum;
    signal input context;
    signal output commitment;
    component v = Num2Bits(64); v.in <== value;
    component lo = Num2Bits(64); lo.in <== minimum;
    component hi = Num2Bits(64); hi.in <== maximum;
    component lower = LessEqThan(64);
    lower.in[0] <== minimum; lower.in[1] <== value; lower.out === 1;
    component upper = LessEqThan(64);
    upper.in[0] <== value; upper.in[1] <== maximum; upper.out === 1;
    component hash = Poseidon(3);
    hash.inputs[0] <== value; hash.inputs[1] <== salt; hash.inputs[2] <== context;
    commitment <== hash.out;
}
component main {public [minimum, maximum, context]} = Acceptance();

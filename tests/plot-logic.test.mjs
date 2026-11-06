import assert from "node:assert/strict";
import { resolveClash } from "../module/sheet-v3/plot-logic.js";

// 1) 짝짓기: 공격 [3,3,5], 방어 [3,6] → 3 하나 상쇄, 남은 공격 2 (3,5)
let r = resolveClash({ attack: [3, 3, 5], defDelegate: [3, 6] });
assert.equal(r.damage, 2); assert.deepEqual(r.unusedDefense, [6]);

// 2) 전부 방어
r = resolveClash({ attack: [1, 2], defDelegate: [1], defObserver: [2] });
assert.equal(r.damage, 0); assert.equal(r.success, "defended");

// 3) 입회인 주사위도 방어에 쓰인다
r = resolveClash({ attack: [4, 4], defDelegate: [4], defObserver: [4] });
assert.equal(r.damage, 0);

// 4) 집중 방어: 두 눈과 같은 공격 주사위는 몇 개든 제거 (4가 3개, 2가 1개, 6 1개) → 남는 건 6 하나
r = resolveClash({ attack: [4, 4, 4, 2, 6], defDelegate: [4, 2], focus: true });
assert.equal(r.focusDeclared, true); assert.equal(r.damage, 1);
assert.deepEqual(r.unusedDefense, []); // 집중에 쓴 주사위는 마소 변환 불가

// 5) 집중 토큰이 있어도 주사위가 2개가 아니면 성립하지 않음 → 평범하게 짝짓기
r = resolveClash({ attack: [4, 4], defDelegate: [4, 4, 1], focus: true });
assert.equal(r.focusDeclared, false); assert.equal(r.focusIgnored, true); assert.equal(r.damage, 0);

// 6) 집중 + 입회인: 입회 주사위는 평범하게 처리
r = resolveClash({ attack: [4, 4, 5], defDelegate: [4, 6], defObserver: [5], focus: true });
assert.equal(r.damage, 0);

// 7) 방어가 없으면 공격 전부 대미지
r = resolveClash({ attack: [1, 1, 1] });
assert.equal(r.damage, 3);

console.log("plot-logic OK");

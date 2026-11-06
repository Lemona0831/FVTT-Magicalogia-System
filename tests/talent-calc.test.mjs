// 실행: node tests/talent-calc.test.mjs
import assert from "node:assert/strict";
import { computeTargets, realmDebuff, gapsForCuriosity, stripRealmNumber, resistTargets } from "../module/sheet-v3/talent-calc.js";

// 기존 module/document/actor.js:67-116 의 _getTalentTable 을 그대로 옮긴 기준 구현 (문자열 num 포함)
function legacy(table, gap, overflowX) {
  table = JSON.parse(JSON.stringify(table));
  const nodes = [];
  for (let i = 0; i < 6; ++i) for (let j = 0; j < 11; ++j) {
    if (table[i][j].misfortune == false && table[i][j].state == true) { nodes.push({ x: i, y: j }); table[i][j].num = "5"; }
    else table[i][j].num = "12";
  }
  const dx = [0, 0, 1, -1], dy = [1, -1, 0, 0], move = [1, 1, 2, 2];
  for (let i = 0; i < nodes.length; ++i) {
    const queue = [nodes[i]];
    while (queue.length != 0) {
      const now = queue.shift();
      if (+table[now.x][now.y].num == 12) continue;
      for (let d = 0; d < 4; ++d) {
        let nx = now.x + dx[d], ny = now.y + dy[d], m = move[d];
        if (overflowX && (nx < 0 || nx >= 6)) nx = (nx < 0) ? 5 : 0;
        if (nx < 0 || nx >= 6 || ny < 0 || ny >= 11) continue;
        const g = ((now.x == 0 && nx == 5) || (now.x == 5 && nx == 0)) ? gap[0] : gap[(nx > now.x) ? nx : now.x];
        if (m == 2 && g) m = 1;
        if (Number(table[nx][ny].num) > Number(table[now.x][now.y].num) + m) {
          table[nx][ny].num = String(Number(table[now.x][now.y].num) + m);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  return table.map((r) => r.map((c) => Number(c.num)));
}

const empty = () => Array.from({ length: 6 }, () => Array.from({ length: 11 }, () => ({ state: false, misfortune: false, num: 12 })));
const noGap = () => ({ 0: false, 1: false, 2: false, 3: false, 4: false, 5: false });

// 1) 아무것도 습득하지 않으면 전부 12
assert.deepEqual(computeTargets(empty(), noGap()).flat(), Array(66).fill(12));

// 2) 습득 칸 = 5, 같은 열 위아래 +1, 옆 영역 +2
{
  const t = empty(); t[1][4].state = true;
  const r = computeTargets(t, noGap());
  assert.equal(r[1][4], 5); assert.equal(r[1][5], 6); assert.equal(r[1][3], 6);
  assert.equal(r[2][4], 7); assert.equal(r[0][4], 7); assert.equal(r[3][4], 9);
}

// 3) 칠한 갭을 건너면 +1. gap[2] = 2번 영역 열의 왼쪽 갭 (1→2 이동)
{
  const t = empty(); t[1][4].state = true;
  const g = noGap(); g[2] = true;
  const r = computeTargets(t, g);
  assert.equal(r[2][4], 6);   // 1→2 : 갭 칠함
  assert.equal(r[0][4], 7);   // 1→0 : gap[1] 은 안 칠함
  g[1] = true;
  assert.equal(computeTargets(t, g)[0][4], 6);
}

// 4) 별(0)↔어둠(5)은 overflowX 가 켜졌을 때만 이어지고 gap[0] 을 쓴다
{
  const t = empty(); t[0][4].state = true;
  assert.equal(computeTargets(t, noGap(), false)[5][4], 12);
  assert.equal(computeTargets(t, noGap(), true)[5][4], 7);
  const g = noGap(); g[0] = true;
  assert.equal(computeTargets(t, g, true)[5][4], 6);
}

// 5) 불운 칸은 시작점이 아니다 + 영역 감점 표시
{
  const t = empty(); t[2][3].state = true; t[2][3].misfortune = true;
  assert.deepEqual(computeTargets(t, noGap()).flat(), Array(66).fill(12));
  assert.deepEqual(realmDebuff(t), [false, false, true, false, false, false]);
}

// 6) 상한 12: 거리가 멀면 12 유지
{
  const t = empty(); t[0][0].state = true;
  assert.equal(computeTargets(t, noGap())[5][10], 12);
}

// 7) 기존 구현과 무작위 비교 (문자열 num 포함, 갭/overflowX/불운 조합)
{
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let n = 0; n < 3000; n++) {
    const t = empty();
    for (let i = 0; i < 6; i++) for (let j = 0; j < 11; j++) {
      t[i][j].state = rnd() < 0.06; t[i][j].misfortune = rnd() < 0.03;
    }
    const g = noGap(); for (let i = 0; i < 6; i++) g[i] = rnd() < 0.4;
    const ox = rnd() < 0.5;
    assert.deepEqual(computeTargets(t, g, ox), legacy(t, g, ox), `case ${n}`);
  }
}

// 7-b) 객체 형태 table ({"0":{"0":…}}, Foundry 폼 업데이트 후 저장 형태)도 배열과 같은 결과
{
  const t = empty(); t[1][4].state = true; t[2][3].misfortune = true;
  const obj = {}; t.forEach((r, i) => { obj[i] = {}; r.forEach((c, j) => { obj[i][j] = c; }); });
  assert.deepEqual(computeTargets(obj, noGap()), computeTargets(t, noGap()));
  assert.deepEqual(realmDebuff(obj), realmDebuff(t));
}

// 8) curiosity → 갭 2칸 (1..5), 어둠(6)은 gap[5] 하나, 0 은 없음
assert.deepEqual(gapsForCuriosity(2), { 0: false, 1: true, 2: true, 3: false, 4: false, 5: false });
assert.deepEqual(gapsForCuriosity(1), { 0: true, 1: true, 2: false, 3: false, 4: false, 5: false });
assert.deepEqual(gapsForCuriosity(6), { 0: true, 1: false, 2: false, 3: false, 4: false, 5: true }); // 룰북 p.39: 어둠 = 어둠 왼쪽 + 별 왼쪽
assert.deepEqual(gapsForCuriosity(0), noGap());

// 9) 접두사 제거
assert.equal(stripRealmNumber("1. 별"), "별");
assert.equal(stripRealmNumber("황금"), "황금");

// 10) 저항 목표치
{
  // 캐릭터: 습득 칸 5, 같은 열 위아래 +1
  const t = empty(); t[1][4].state = true;
  assert.equal(resistTargets({ kind: "actor", table: t, gap: noGap(), realm: 1, row: 4 }).target, 5);
  assert.equal(resistTargets({ kind: "actor", table: t, gap: noGap(), realm: 1, row: 5 }).target, 6);
  // 원형: 특기 1칸 = 5, 옆 영역은 갭이 칠해져 +1 (자기 영역 좌우 갭)
  assert.equal(resistTargets({ kind: "archetype", symRealm: 1, symRow: 4, realm: 1, row: 4 }).target, 5);
  assert.equal(resistTargets({ kind: "archetype", symRealm: 1, symRow: 4, realm: 2, row: 4 }).target, 6);
  assert.equal(resistTargets({ kind: "archetype", symRealm: 1, symRow: 4, realm: 0, row: 4 }).target, 6);
  assert.equal(resistTargets({ kind: "archetype", symRealm: 1, symRow: 4, realm: 3, row: 4 }).target, 8); // 2칸 떨어짐: 6 + 2
  assert.equal(resistTargets({ kind: "archetype", symRealm: 1, symRow: 4, realm: 1, row: 7 }).target, 8);
  // 어둠(5) 원형: 어둠 왼쪽 갭 + 별 왼쪽 갭. 짐승(1)->별(0)은 별 왼쪽 갭이 아니라 gap[1]
  assert.equal(resistTargets({ kind: "archetype", symRealm: 5, symRow: 0, realm: 4, row: 0 }).target, 6);
  // 워드: 지정특기가 워드 소유자의 영역일 때만 적용 가능
  assert.equal(resistTargets({ kind: "archetype", symRealm: 1, symRow: 4, realm: 1, row: 7, ward: 7, wardRealm: 1 }).wardTarget, 7);
  assert.equal(resistTargets({ kind: "archetype", symRealm: 1, symRow: 4, realm: 2, row: 7, ward: 7, wardRealm: 1 }).wardTarget, null);
  assert.equal(resistTargets({ kind: "actor", table: t, gap: noGap(), realm: 1, row: 4, ward: null, wardRealm: null }).wardTarget, null);
}

console.log("talent-calc: all tests passed");

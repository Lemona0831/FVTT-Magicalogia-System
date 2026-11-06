/**
 * 플롯 비교 계산 (순수 함수 — Foundry 없이 테스트 가능).
 *
 * 입력: 공격측 대표 구역의 눈 배열, 방어측 대표/입회 구역의 눈 배열, 방어측 대표 구역에 집중 방어 토큰이 있는지.
 *  - 공격 주사위 = 공격측 대표 구역의 주사위. (공격측 입회 구역은 이 비교에서 쓰지 않는다. 입회인은 방어 때만 주사위를 더한다.)
 *  - 방어 주사위 = 방어측 대표 + 입회 구역의 주사위.
 *  - 같은 눈의 공격/방어 주사위를 하나씩 짝지어 서로 제거한다.
 *  - 집중 방어: 방어측 대표 구역에 집중 토큰이 있고 그 구역의 주사위가 정확히 2개일 때만 성립.
 *    그 두 눈과 같은 공격 주사위는 몇 개든 제거한다. 집중 방어에 쓴 두 방어 주사위는 짝짓기에 쓰지 않고(소모), 마소 변환도 안 된다.
 *    입회 구역의 방어 주사위는 평범하게 짝짓기한다.
 * 출력: 각 주사위의 인덱스별 상태와 결과.
 */
export function resolveClash({ attack = [], defDelegate = [], defObserver = [], focus = false }) {
  const atk = attack.map((face, i) => ({ face, i, broken: false }));
  const dd = defDelegate.map((face, i) => ({ face, i, broken: false }));
  const dob = defObserver.map((face, i) => ({ face, i, broken: false }));

  const focusOk = !!focus && dd.length === 2;
  const focusFaces = focusOk ? [...new Set(dd.map((d) => d.face))] : [];
  if (focusOk) {
    dd.forEach((d) => { d.broken = true; });
    atk.forEach((a) => { if (focusFaces.includes(a.face)) a.broken = true; });
  }

  // 짝짓기: 남은 방어 주사위(집중에 쓰지 않은 것)와 남은 공격 주사위
  const pool = (focusOk ? dob : [...dd, ...dob]);
  for (const d of pool) {
    const a = atk.find((x) => !x.broken && x.face === d.face);
    if (a) { a.broken = true; d.broken = true; }
  }

  const left = atk.filter((a) => !a.broken).length;
  const unusedDefense = pool.filter((d) => !d.broken).map((d) => d.face);
  return {
    focusDeclared: focusOk,
    focusIgnored: !!focus && !focusOk, // 집중 토큰은 있는데 주사위가 2개가 아님
    focusFaces,
    attack: atk, defDelegate: dd, defObserver: dob,
    damage: left,
    success: left === 0 ? "defended" : "hit",
    unusedDefense
  };
}

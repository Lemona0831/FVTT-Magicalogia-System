/**
 * 특기 목표치 계산 (순수 함수, Foundry 전역 없음).
 * 기존 MagicalogiaActor#_getTalentTable (module/document/actor.js:67-116) 과 같은 규칙:
 *  - 습득(state)했고 불운(misfortune)이 아닌 칸 = 5
 *  - 같은 열 위아래 +1, 옆 영역 +2 (건너는 갭이 칠해져 있으면 +1)
 *  - 갭 n 은 n번 영역 열의 왼쪽 갭. 오른쪽으로 갈 때는 도착 열, 왼쪽으로 갈 때는 출발 열의 갭을 본다
 *  - overflowX 가 켜지면 별(0)과 어둠(5)이 이어지며 갭은 gap[0]
 *  - 상한 12
 * 저장된 num 에 의존하지 않고 state/misfortune/gap/overflowX 로 직접 계산한다.
 */

export const REALMS = 6;
export const ROWS = 11;
export const MAX_TARGET = 12;
export const BASE_TARGET = 5;

/** gap 은 {0:bool,...,5:bool} 또는 길이 6 배열 모두 허용 */
const gapAt = (gap, i) => !!(gap?.[i] ?? gap?.[String(i)]);

/**
 * @param {Array<Array<{state:boolean, misfortune:boolean}>>} table  table[영역 0..5][행 0..10]
 * @param {object|boolean[]} gap
 * @param {boolean} overflowX
 * @returns {number[][]} 같은 모양의 목표치 (5..12)
 */
export function computeTargets(table, gap, overflowX = false) {
  const num = Array.from({ length: REALMS }, () => Array(ROWS).fill(MAX_TARGET));
  const nodes = [];
  for (let i = 0; i < REALMS; i++) for (let j = 0; j < ROWS; j++) {
    const c = table?.[i]?.[j];
    if (c && c.state && !c.misfortune) { num[i][j] = BASE_TARGET; nodes.push({ x: i, y: j }); }
  }

  const dx = [0, 0, 1, -1];
  const dy = [1, -1, 0, 0];
  const move = [1, 1, 2, 2];
  for (const start of nodes) {
    const queue = [start];
    while (queue.length) {
      const now = queue.shift();
      if (num[now.x][now.y] === MAX_TARGET) continue;
      for (let d = 0; d < 4; d++) {
        let nx = now.x + dx[d];
        const ny = now.y + dy[d];
        let m = move[d];
        if (overflowX && (nx < 0 || nx >= REALMS)) nx = nx < 0 ? REALMS - 1 : 0;
        if (nx < 0 || nx >= REALMS || ny < 0 || ny >= ROWS) continue;
        const wrap = (now.x === 0 && nx === REALMS - 1) || (now.x === REALMS - 1 && nx === 0);
        const g = wrap ? gapAt(gap, 0) : gapAt(gap, nx > now.x ? nx : now.x);
        if (m === 2 && g) m = 1;
        if (num[nx][ny] > num[now.x][now.y] + m) {
          num[nx][ny] = num[now.x][now.y] + m;
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  return num;
}

/** 영역별 불운 여부: 그 영역에 misfortune 칸이 하나라도 있으면 true (판정 -1) */
export function realmDebuff(table) {
  // 저장된 table 은 배열이거나 {"0":{"0":…}} 형태의 객체일 수 있으므로 인덱스로만 접근한다
  return Array.from({ length: REALMS }, (_, i) => {
    for (let j = 0; j < ROWS; j++) if (table?.[i]?.[j]?.misfortune) return true;
    return false;
  });
}

/** 자기 영역(curiosity 1..6) → 칠할 갭 키. 0 이면 없음 */
export function gapsForCuriosity(curiosity) {
  const c = Number(curiosity) || 0;
  const gap = { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false };
  if (c >= 1 && c <= REALMS) { gap[c - 1] = true; if (c <= 5) gap[c] = true; }
  return gap;
}

/** 영역 제목의 번호 접두사 제거: "1. 별" → "별" */
export const stripRealmNumber = (s) => String(s ?? "").replace(/^\s*\d+\.\s*/, "");

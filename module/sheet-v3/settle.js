/**
 * 세션 종료 정산 (기본 룰북 15.03.03 「공적점을 받을 수 있는 조건」).
 *  승리 1 / 생존 1 / 신조 1 / 롤플레이 1 — 체크
 *  심금 — 플레이어들이 고른 표 수(기본 1, GM 이 임의로 줄 수도 있어 숫자로 입력)
 *  사명 — 표적 격파 3점, 큰 희생을 치렀으면 2점, 도입 '앵커를 지킨다'를 골랐다면 그 앵커의 【운명】 수치
 *  의무(소원 달성 +1 / 미달성 −1), 상혼 극복 +1, 소원 포기 +1, 도입 타입 금서 회수 +1, 기관 특기 등 기타 수정치
 *  신조: 기관 소속이면 경력 신조 + 기관 신조를 모두 충족해야 1점 (기본 p.43). 이종족은 경력 신조 대신 종족 신조 중 하나 (황혼선서 p.138).
 *  황혼선서 이종족: 악마 '사악한 생물'을 쓰면 −1, 〈이름 없는 단장〉(엽귀 등) 수장 1권당 +1.
 */
const num = (x) => Number.parseInt(x, 10) || 0;

export const MISSION = { none: "없음", full: "3점 (표적 격파)", cost: "2점 (큰 희생)", anchor: "앵커 지키기 (앵커 운명)" };

export function missionPoints(v) {
  switch (v.mission) {
    case "full": return 3;
    case "cost": return 2;
    case "anchor": return Math.max(0, num(v.anchorFate));
    default: return 0;
  }
}

/** 한 PC 의 획득 공적점 */
export function calcMerit(v) {
  return (v.victory ? 1 : 0) + (v.survival ? 1 : 0) + (v.creed ? 1 : 0) + (v.roleplay ? 1 : 0)
    + Math.max(0, num(v.heartstring)) + missionPoints(v)
    + num(v.duty) + (v.scar ? 1 : 0) + (v.giveup ? 1 : 0) + (v.book ? 1 : 0) + Math.max(0, num(v.nameless)) - (v.devil ? 1 : 0) + num(v.other);
}

/** 시트의 '공적점 획득 조건' 체크를 초깃값으로 */
export function prefill(actor) {
  const f = (k) => !!actor.getFlag("magicalogia", `sheetV3.merits.${k}`);
  const m = f("sacrifice") ? "cost" : (f("mission") ? "full" : "none");
  return {
    victory: f("victory"), survival: f("survival"), creed: f("creed"), roleplay: f("roleplay"),
    heartstring: f("heartstring") ? 1 : 0, mission: m, anchorFate: 0, duty: 0,
    scar: false, giveup: false, book: false, nameless: 0, devil: false, other: 0
  };
}

export function breakdown(v) {
  const out = [];
  if (v.victory) out.push("승리 1"); if (v.survival) out.push("생존 1");
  if (v.creed) out.push("신조 1"); if (v.roleplay) out.push("롤플레이 1");
  if (num(v.heartstring) > 0) out.push(`심금 ${num(v.heartstring)}`);
  if (missionPoints(v)) out.push(`사명 ${missionPoints(v)}`);
  if (num(v.duty)) out.push(`의무 ${num(v.duty) > 0 ? "+" : ""}${num(v.duty)}`);
  if (v.scar) out.push("상흔 극복 1"); if (v.giveup) out.push("소원 포기 1"); if (v.book) out.push("금서 회수 1");
  if (num(v.nameless) > 0) out.push(`이름 없는 단장 수장 ${num(v.nameless)}`);
  if (v.devil) out.push("악마의 사악한 생물 −1");
  if (num(v.other)) out.push(`기타 ${num(v.other) > 0 ? "+" : ""}${num(v.other)}`);
  return out.join(" · ");
}

export function settleActors() {
  return game.actors.filter((a) => a.type === "character" && !a.getFlag("magicalogia", "plotDiceActor") && !a.getFlag("magicalogia", "archetypeActor")
    && game.users.some((u) => !u.isGM && a.testUserPermission(u, "OWNER")));
}

/** GM: 공적점에 더한다 (공적점 칸이 문자열이라 숫자로 읽어 더한 뒤 다시 저장) */
export async function applyMerit(actor, v) {
  if (!game.user.isGM) return ui.notifications.warn("GM 만 적용할 수 있습니다.");
  const gain = calcMerit(v);
  const before = num(actor.system.details?.exp);
  await actor.update({ "system.details.exp": String(before + gain) });
  return { before, gain, after: before + gain };
}

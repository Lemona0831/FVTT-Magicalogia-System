/**
 * 시트 v3 판정 + 채팅 카드. 기존 Actor#rollTalent 는 건드리지 않고 별도로 둔다.
 * 규칙: 2D6 (+보정, 불운 -1) >= 목표치. 주사위 합 12 = 스페셜(자동 성공), 2 = 펌블(자동 실패).
 * 더블릿은 표시만 한다 (마소 처리는 플레이어가 직접).
 */

const REALM_LABELS = ["A1", "B1", "C1", "D1", "E1", "F1"];
// 주사위 눈 배치 (3x3 격자, 왼쪽 위부터)
const PIPS = {
  1: [0,0,0,0,1,0,0,0,0], 2: [1,0,0,0,0,0,0,0,1], 3: [1,0,0,0,1,0,0,0,1],
  4: [1,0,1,0,0,0,1,0,1], 5: [1,0,1,0,1,0,1,0,1], 6: [1,0,1,1,0,1,1,0,1]
};

/** 보정값 입력 창. 확인하면 숫자(비어 있으면 0), 닫으면 null */
function askModifier(title) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    new Dialog({
      title: game.i18n.localize("MAGICALOGIA.RollModifier") === "MAGICALOGIA.RollModifier" ? "보정값 입력" : game.i18n.localize("MAGICALOGIA.RollModifier"),
      content: `<p style="margin:0 0 6px">${foundry.utils.escapeHTML(title)}</p><input type="number" step="1" id="mglg-add" style="width:100%" autofocus>`,
      buttons: {
        ok: {
          icon: '<i class="fas fa-check"></i>', label: "확인",
          callback: (html) => finish(Number(html.find("#mglg-add").val()) || 0)
        }
      },
      default: "ok",
      render: (html) => html.find("#mglg-add").trigger("focus"),
      close: () => finish(null)
    }).render(true);
  });
}

/**
 * @param {Actor} actor
 * @param {object} o
 * @param {string} o.title      카드 제목 (특기 이름)
 * @param {number} o.target     목표치
 * @param {boolean} [o.ask]     보정값을 물어볼지
 * @param {boolean} [o.secret]  비밀 굴림 (GM 에게만)
 * @param {boolean} [o.debuff]  불운 -1
 * @param {string}  [o.realm]   영역 키 A..F (카드 색/표시용)
 * @param {string}  [o.theme]   테마 이름
 */
export async function rollTalentCard(actor, { title, target, ask = false, secret = false, debuff = false, realm = "", theme = "rulebook" }) {
  let add = 0;
  if (ask) {
    add = await askModifier(title);
    if (add === null) return null; // 취소
  }

  const formula = `2d6${add ? (add < 0 ? `${add}` : `+${add}`) : ""}${debuff ? "-1" : ""}`;
  const roll = new Roll(formula);
  await roll.evaluate();

  const dice = roll.dice[0].results.map((r) => r.result);
  const natural = dice[0] + dice[1];
  const special = natural === 12;
  const fumble = natural === 2;
  const total = roll.total;
  const success = special || (!fumble && total >= target);
  const isDoublet = dice[0] === dice[1] && !special && !fumble;

  const outcome = special ? "special" : fumble ? "fumble" : success ? "success" : "fail";
  const outcomeLabel = game.i18n.localize({ special: "MAGICALOGIA.Special", fumble: "MAGICALOGIA.Fumble", success: "MAGICALOGIA.Success", fail: "MAGICALOGIA.Fail" }[outcome]);

  const content = await renderTemplate("systems/magicalogia/templates/sheet-v3/roll-card.html", {
    theme,
    realmIdx: (realm !== "" && Number(realm) >= 0 && Number(realm) < 6) ? Number(realm) : "x",
    actorName: actor?.name ?? "",
    title,
    formula: roll.formula.replace(/\s+/g, ""),
    target,
    dice: dice.map((n) => ({ n, one: n === 1, pips: PIPS[n] })),
    total,
    modifiers: [
      add ? { label: "보정", value: add > 0 ? `+${add}` : `${add}` } : null,
      debuff ? { label: game.i18n.localize("MAGICALOGIA.Misfortune"), value: "−1" } : null
    ].filter(Boolean),
    outcome,
    outcomeLabel,
    success,
    doublet: isDoublet ? game.i18n.localize(`MAGICALOGIA.${REALM_LABELS[dice[0] - 1]}`).replace(/^\s*\d+\.\s*/, "") : null
  });

  const chatData = {
    user: game.user.id,
    // v12: actor 를 그대로 넘긴다 (기존 코드의 this.actor 버그 수정)
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    flags: { magicalogia: { v3Roll: { title, target, total, outcome } } }
  };
  ChatMessage.applyRollMode(chatData, secret ? "gmroll" : game.settings.get("core", "rollMode"));
  if (!game.dice3d) chatData.sound = CONFIG.sounds.dice;
  return ChatMessage.create(chatData);
}

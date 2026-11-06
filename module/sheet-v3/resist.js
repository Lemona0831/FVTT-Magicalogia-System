import { escapeHTML } from "./escape.js";
/**
 * 저항판정 도우미.
 * 주문의 지정특기 + 대상(이 캐릭터 / 원형)으로 목표치를 계산하고, 판정 카드를 굴린다.
 * 계산 규칙은 talent-calc.js 의 resistTargets 참고 (룰북 16.03.02 / 19장).
 */
import { resistTargets, stripRealmNumber } from "./talent-calc.js";
import { rollTalentCard } from "./roll-card.js";

const REALM_KEYS = ["A", "B", "C", "D", "E", "F"];
const esc = (s) => escapeHTML(String(s ?? ""));

function label(key) {
  let title = "";
  try { title = game.settings.get("magicalogia", key); } catch (e) { /* 설정 미등록 */ }
  return title !== "" && title != null ? title : game.i18n.localize(key);
}
const realmName = (i) => stripRealmNumber(label(`MAGICALOGIA.${REALM_KEYS[i]}1`));
const talentName = (realm, row) => label(`MAGICALOGIA.${REALM_KEYS[realm]}${row + 2}`);

const realmOptions = (sel) => REALM_KEYS.map((_, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${esc(realmName(i))}</option>`).join("");
const talentOptions = (realm, sel) => Array.from({ length: 11 }, (_, r) => `<option value="${r}" ${r === sel ? "selected" : ""}>${r + 2} · ${esc(talentName(realm, r))}</option>`).join("");

/** @param {Actor} actor 판정하는 캐릭터(시트의 주인) @param {string} theme */
export function openResistDialog(actor, theme = "rulebook") {
  const sys = actor.system;
  const talent = sys.talent ?? {};
  const content = `
  <form class="mglg-resist">
    <fieldset><legend>주문의 지정특기</legend>
      <div class="r"><select name="realm">${realmOptions(0)}</select><select name="row">${talentOptions(0, 0)}</select></div>
    </fieldset>
    <fieldset><legend>저항하는 쪽</legend>
      <label class="r"><input type="radio" name="kind" value="actor" checked> 이 캐릭터 (${esc(actor.name)}) — 자기 특기표 기준</label>
      <label class="r"><input type="radio" name="kind" value="archetype"> 원형 — 원형의 특기 1개 기준</label>
      <div class="r arch" hidden>
        <span>원형의 특기</span><select name="symRealm">${realmOptions(0)}</select><select name="symRow">${talentOptions(0, 0)}</select>
      </div>
      <div class="r arch" hidden>
        <span>[워드 n]</span><input type="number" name="ward" min="0" max="12" step="1" placeholder="없으면 비움" style="width:110px">
        <span class="hint">워드 소유자 영역 = 원형의 영역 (같은 영역 주문일 때만 적용)</span>
      </div>
    </fieldset>
    <fieldset><legend>보정</legend>
      <label class="r"><input type="checkbox" name="recite"> 상대가 주구를 낭독함 (−1)</label>
      <label class="r"><input type="checkbox" name="misfortune"> 불운 (−1)</label>
      <div class="r"><span>추가 수정</span><input type="number" name="extra" step="1" value="0" style="width:80px"></div>
    </fieldset>
    <p class="mglg-resist-out"></p>
  </form>`;

  const calc = (html) => {
    const f = (n) => html.find(`[name=${n}]`);
    const kind = html.find("[name=kind]:checked").val();
    const realm = Number(f("realm").val()), row = Number(f("row").val());
    const symRealm = Number(f("symRealm").val());
    const r = resistTargets({
      kind, realm, row,
      table: talent.table, gap: talent.gap, overflowX: !!talent.overflowX,
      symRealm, symRow: Number(f("symRow").val()),
      ward: f("ward").val(), wardRealm: kind === "archetype" ? symRealm : null
    });
    const mod = (html.find("[name=recite]").is(":checked") ? -1 : 0) + (html.find("[name=misfortune]").is(":checked") ? -1 : 0) + (Number(f("extra").val()) || 0);
    return { kind, realm, row, symRealm, ...r, mod };
  };

  const refresh = (html) => {
    const c = calc(html);
    html.find(".arch").prop("hidden", c.kind !== "archetype");
    const modTxt = c.mod ? ` · 보정 ${c.mod > 0 ? "+" : ""}${c.mod}` : "";
    const ward = c.wardTarget != null ? ` · [워드] 적용 시 <b>${c.wardTarget}</b>${c.wardTarget < c.target ? " (더 쉬움)" : " (오히려 어려워짐)"}` : "";
    html.find(".mglg-resist-out").html(`목표치 <b>${c.target}</b>${ward}${modTxt}`);
  };

  const dlg = new Dialog({
    title: "저항 판정",
    content,
    buttons: {
      roll: {
        icon: '<i class="fas fa-dice"></i>', label: "굴리기",
        callback: async (html) => {
          const c = calc(html);
          const useWard = c.wardTarget != null && c.wardTarget < c.target;
          const target = useWard ? c.wardTarget : c.target;
          const who = c.kind === "archetype" ? `${actor.name} · 원형(${realmName(c.symRealm)})` : null;
          return rollTalentCard(actor, {
            title: `저항 · ${talentName(c.realm, c.row)}`, target, modifier: c.mod, who, realm: String(c.realm), theme
          });
        }
      },
      cancel: { label: "닫기" }
    },
    default: "roll",
    render: (html) => {
      const syncTalents = (realmSel, rowSel) => html.find(`[name=${realmSel}]`).on("change", (ev) => {
        html.find(`[name=${rowSel}]`).html(talentOptions(Number(ev.currentTarget.value), 0));
        refresh(html);
      });
      syncTalents("realm", "row"); syncTalents("symRealm", "symRow");
      html.on("change input", "input, select", () => refresh(html));
      refresh(html);
    }
  }, { width: 440, classes: ["mglg-resist-dialog"] });
  dlg.render(true);
  return dlg;
}

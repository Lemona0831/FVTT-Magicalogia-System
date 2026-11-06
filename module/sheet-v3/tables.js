/**
 * 시트 v3 "각종 표".
 * - 내장 표: data/tables.json (룰북 문구라 저장소에는 올리지 않고 설치본에만 둔다. .gitignore 참고).
 *   파일이 없으면 내장 표 없이 월드 롤테이블만 쓴다.
 * - 월드 롤테이블: 이름으로 연결 (기존 방식).
 * - 어떤 표를 어떤 순서로 보여줄지는 월드 설정 v3Tables 에 저장한다: [{k:"b"|"w", n:"표 이름"}]
 *   null 이면 DEFAULT_TABLES.
 */

const DATA_URL = "systems/magicalogia/data/tables.json";
const REALM_LABELS = ["A1", "B1", "C1", "D1", "E1", "F1"];
const PIPS = {
  1: [0,0,0,0,1,0,0,0,0], 2: [1,0,0,0,0,0,0,0,1], 3: [1,0,0,0,1,0,0,0,1],
  4: [1,0,1,0,0,0,1,0,1], 5: [1,0,1,0,1,0,1,0,1], 6: [1,0,1,1,0,1,1,0,1]
};

export const DEFAULT_TABLES = [
  { k: "b", n: "장면표 (기본)" }, { k: "b", n: "사건표" }, { k: "b", n: "소원표" },
  { k: "b", n: "운명 변전표 (기본)" }, { k: "b", n: "펌블표" }, { k: "b", n: "프라이즈표" },
  { k: "w", n: "무작위 특기" }, { k: "w", n: "랜덤 플롯" }
];

let _db = null;
export async function loadBuiltin() {
  if (_db) return _db;
  try {
    const r = await fetch(DATA_URL);
    if (!r.ok) throw new Error(String(r.status));
    _db = await r.json();
  } catch (e) {
    console.warn("magicalogia | data/tables.json 을 불러오지 못했습니다 (내장 표 없음)", e);
    _db = { groups: [], tables: [] };
  }
  return _db;
}

export function getConfig() {
  let v = null;
  try { v = game.settings.get("magicalogia", "v3Tables"); } catch (e) { /* 미등록 */ }
  return Array.isArray(v) ? v.filter((e) => e && (e.k === "b" || e.k === "w") && e.n) : DEFAULT_TABLES.map((e) => ({ ...e }));
}

/** 시트 드롭다운용 */
export async function tableOptions() {
  const db = await loadBuiltin();
  return getConfig().map((e) => ({
    value: `${e.k}:${e.n}`,
    name: e.n,
    missing: e.k === "b" ? !db.tables.some((t) => t.name === e.n) : !game.tables?.getName(e.n)
  }));
}

/** 드롭다운 값("b:이름" / "w:이름")으로 굴린다 */
export async function rollConfigured(actor, value, theme = "rulebook") {
  const k = value.slice(0, 1), name = value.slice(2);
  if (k === "w") {
    const table = game.tables?.getName(name);
    if (!table) return ui.notifications.warn(`'${name}' 롤테이블이 없습니다. 같은 이름의 롤테이블을 만들어 주세요.`);
    return table.draw();
  }
  const db = await loadBuiltin();
  const table = db.tables.find((t) => t.name === name);
  if (!table) return ui.notifications.warn(`'${name}' 표를 찾지 못했습니다. data/tables.json 을 확인하세요.`);
  return rollBuiltin(actor, table, theme);
}

const diceNumbers = (roll) => (roll.dice[0]?.results ?? []).map((r) => r.result);

export async function rollBuiltin(actor, table, theme) {
  const grid = table.dice === "1D6x1D6";
  const roll = new Roll(grid ? "2d6" : table.dice.toLowerCase());
  await roll.evaluate();
  const nums = diceNumbers(roll);
  const d6 = table.dice !== "1D31";

  let text = "", total = roll.total, col = "", note = table.note ?? "", hideTotal = false, entryRoll = roll.total;
  if (grid) {
    const colIdx = nums[0] <= 3 ? 0 : 1;
    const row = table.entries.find((e) => e.roll === nums[1]);
    text = row?.cells?.[colIdx] ?? "";
    col = `${nums[0]} → ${table.cols?.[colIdx] ?? ""} · 행 ${nums[1]}`;
    hideTotal = true;
  } else {
    text = table.entries.find((e) => e.roll === entryRoll)?.text ?? "(해당 항목 없음)";
  }

  const content = await renderTemplate("systems/magicalogia/templates/sheet-v3/roll-table-card.html", {
    theme, actorName: actor?.name ?? "", title: table.name, formula: roll.formula,
    dice: d6 ? nums.map((n) => ({ pips: PIPS[n] })) : [], total, hideTotal, col, text, note
  });
  const chatData = {
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content, rolls: [roll],
    flags: { magicalogia: { v3Roll: { title: table.name, total, outcome: "success" } } }
  };
  ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));
  if (!game.dice3d) chatData.sound = CONFIG.sounds.dice;
  return ChatMessage.create(chatData);
}

/** GM 용 설정 창: 보일 표 고르기 / 순서 바꾸기 / 월드 롤테이블 이름 추가 */
export class TablesConfigApp extends FormApplication {
  constructor(options = {}) {
    super(options);
    this.list = getConfig();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "mglg-tables-config",
      title: "시트 v3 · 각종 표 구성",
      template: "systems/magicalogia/templates/sheet-v3/tables-config.html",
      classes: ["mglg-tables-config"],
      width: 640, height: 640, resizable: true, closeOnSubmit: false, submitOnChange: false
    });
  }

  /** 값은 저장 버튼에서 직접 설정에 쓴다. 폼 제출(Enter 등)은 아무것도 하지 않는다. */
  async _updateObject() {}

  async getData() {
    const db = await loadBuiltin();
    const has = new Set(this.list.map((e) => `${e.k}:${e.n}`));
    const groups = (db.groups ?? []).map((g) => ({
      name: g,
      tables: db.tables.filter((t) => t.group === g).map((t) => ({ name: t.name, dice: t.dice, on: has.has(`b:${t.name}`) }))
    })).filter((g) => g.tables.length);
    const worldTables = (game.tables?.contents ?? []).map((t) => t.name).sort((a, b) => a.localeCompare(b, "ko"))
      .map((name) => ({ name, on: has.has(`w:${name}`) }));
    return {
      list: this.list.map((e, i) => ({
        i, k: e.k, name: e.n, world: e.k === "w", first: i === 0, last: i === this.list.length - 1,
        missing: e.k === "b" ? !db.tables.some((t) => t.name === e.n) : !game.tables?.getName(e.n)
      })),
      groups, worldTables, hasBuiltin: db.tables.length > 0
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const toggle = (k, n, on) => {
      const idx = this.list.findIndex((e) => e.k === k && e.n === n);
      if (on && idx < 0) this.list.push({ k, n });
      if (!on && idx >= 0) this.list.splice(idx, 1);
      this.render();
    };
    html.find("input.mglg-tc-toggle").on("change", (ev) => toggle(ev.currentTarget.dataset.k, ev.currentTarget.dataset.n, ev.currentTarget.checked));
    html.find(".mglg-tc-remove").on("click", (ev) => { this.list.splice(Number(ev.currentTarget.dataset.i), 1); this.render(); });
    html.find(".mglg-tc-up, .mglg-tc-down").on("click", (ev) => {
      const i = Number(ev.currentTarget.dataset.i), j = i + (ev.currentTarget.classList.contains("mglg-tc-up") ? -1 : 1);
      if (j < 0 || j >= this.list.length) return;
      [this.list[i], this.list[j]] = [this.list[j], this.list[i]];
      this.render();
    });
    html.find(".mglg-tc-add-name").on("click", () => {
      const n = String(html.find(".mglg-tc-name").val() || "").trim();
      if (!n) return;
      if (!this.list.some((e) => e.k === "w" && e.n === n)) this.list.push({ k: "w", n });
      this.render();
    });
    html.find(".mglg-tc-reset").on("click", () => { this.list = DEFAULT_TABLES.map((e) => ({ ...e })); this.render(); });
    html.find(".mglg-tc-all").on("click", async () => {
      const db = await loadBuiltin();
      this.list = [...this.list.filter((e) => e.k === "w"), ...db.tables.map((t) => ({ k: "b", n: t.name }))];
      this.render();
    });
    html.find(".mglg-tc-none").on("click", () => { this.list = this.list.filter((e) => e.k === "w"); this.render(); });
    html.find(".mglg-tc-save").on("click", async () => {
      await game.settings.set("magicalogia", "v3Tables", this.list);
      ui.notifications.info("각종 표 구성을 저장했습니다.");
      this.close();
    });
  }
}

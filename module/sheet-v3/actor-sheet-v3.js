import { rollTalentCard } from "./roll-card.js";
import { tableOptions, rollConfigured } from "./tables.js";
import { openResistDialog } from "./resist.js";
import { computeTargets, realmDebuff, gapsForCuriosity, stripRealmNumber, REALMS, ROWS } from "./talent-calc.js";

const REALM_KEYS = ["A", "B", "C", "D", "E", "F"];
const STATUS_KEYS = [
  ["seal", "MAGICALOGIA.Seal"], ["burn", "MAGICALOGIA.Burn"], ["weakness", "MAGICALOGIA.Weakness"],
  ["sickness", "MAGICALOGIA.Sickness"], ["block", "MAGICALOGIA.Block"], ["misfortune", "MAGICALOGIA.Misfortune"],
  ["death", "MAGICALOGIA.Death"], ["extinction", "MAGICALOGIA.Extinction"]
];
// 영역 문장 아이콘 (시안 SheetV3.dc.html 의 SIG)
const SIGILS = [
  "M10 2 L12.4 7.4 L18.2 7.8 L13.8 11.6 L15.2 17.4 L10 14.3 L4.8 17.4 L6.2 11.6 L1.8 7.8 L7.6 7.4 Z",
  "M5 17 C7 12 7 7 5.5 3 M10 17 C12 11 12 7 10.5 2.5 M15 17 C16.5 12 16.5 7 14.5 3",
  "M11.5 2 L5 11 L9.5 11 L8.5 18 L15 9 L10.5 9 Z",
  "M6 14.5 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M8.5 14.5 V4 L16 6 V9 L8.5 7",
  "M13.5 2.5 A8 8 0 1 0 17 14 A6 6 0 0 1 13.5 2.5 Z",
  "M2 10 C5 5.5 15 5.5 18 10 C15 14.5 5 14.5 2 10 Z M10 10 m-2.3 0 a2.3 2.3 0 1 0 4.6 0 a2.3 2.3 0 1 0 -4.6 0"
];
const THEME_TEXT = {
  rulebook: { eyebrow: "마도서 대전 TRPG · 캐릭터 시트", legend: "검은 띠 = 칠한 갭 · 테두리 = 습득 특기" },
  academy: { eyebrow: "MAGUS REGISTRATION CARD", legend: "하늘색 띠 = 칠한 갭 · 남색 칸 = 습득 특기" },
  summer: { eyebrow: "마기카로기아 · 캐릭터 시트", legend: "파란 띠 = 칠한 갭 · 형광펜 = 습득 특기" },
  urban: { eyebrow: "마기카로기아 · 캐릭터 시트", legend: "빛나는 줄 = 칠한 갭 · 빛나는 칸 = 습득 특기" }
};

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const pips = (on, total) => Array.from({ length: Math.max(0, total) }, (_, i) => ({ on: i < on }));

/** 월드 설정(특기 이름 덮어쓰기) → 언어 파일 순서로 이름을 구한다. 기존 localTalent 헬퍼와 같은 규칙. */
function talentLabel(key) {
  let title = "";
  try { title = game.settings.get("magicalogia", key); } catch (e) { /* 설정 미등록 */ }
  return title !== "" && title != null ? title : game.i18n.localize(key);
}

export function resolveTheme() {
  let t = "inherit";
  try { t = game.settings.get("magicalogia", "v3Theme"); } catch (e) { /* 미등록 */ }
  if (t === "inherit" || !THEME_TEXT[t]) {
    try { t = game.settings.get("magicalogia", "v3DefaultTheme"); } catch (e) { t = "rulebook"; }
  }
  return THEME_TEXT[t] ? t : "rulebook";
}

/**
 * 마기카로기아 캐릭터 시트 v3. 기존 MagicalogiaActorSheet 는 건드리지 않는다.
 * 루트 클래스는 `mglg-sheet` 만 쓰고 기존 CSS 가 걸리는 `magicalogia` 클래스는 쓰지 않는다.
 */
export class MagicalogiaActorSheetV3 extends ActorSheet {

  /** 목표치 미리보기 (시트 안 일시 상태, 데이터 아님) */
  _preview = false;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mglg-sheet", "sheet", "actor"],
      template: "systems/magicalogia/templates/sheet-v3/character-sheet-v3.html",
      width: 940,
      height: 900,
      resizable: true,
      scrollY: [".mglg-body"],   // 다시 그려도 스크롤 위치 유지
      tabs: [{ navSelector: ".mglg-tabs", contentSelector: ".mglg-body", initial: "sheet" }]
    });
  }

  /** 다시 그리기 전후로 스크롤 위치를 보존한다. 어느 요소가 스크롤되는지 가정하지 않고 찾는다. */
  async _render(force = false, options = {}) {
    const root = this.element?.[0];
    const saved = [];
    if (root) {
      const els = [root, ...root.querySelectorAll("*")];
      els.forEach((el, i) => {
        if (el.scrollTop > 0 || el.scrollLeft > 0) saved.push({ i, top: el.scrollTop, left: el.scrollLeft, tag: el.tagName, cls: el.className });
      });
    }
    await super._render(force, options);
    const nroot = this.element?.[0];
    if (!nroot || !saved.length) return;
    const els = [nroot, ...nroot.querySelectorAll("*")];
    for (const s of saved) {
      // 같은 위치의 같은 요소를 우선, 없으면 태그·클래스가 같은 첫 요소
      let el = els[s.i];
      if (!el || el.tagName !== s.tag || el.className !== s.cls) el = els.find((e) => e.tagName === s.tag && e.className === s.cls);
      if (el) { el.scrollTop = s.top; el.scrollLeft = s.left; }
    }
  }

  /** 라이브 actor.system 을 건드리지 않고 복사본으로 화면용 데이터를 만든다. */
  async getData(options) {
    const context = await super.getData(options);
    const sys = foundry.utils.deepClone(this.actor.system);
    const talent = sys.talent ?? {};
    const table = talent.table ?? [];
    const gap = talent.gap ?? {};
    const overflowX = !!talent.overflowX;
    const curiosity = Number(talent.curiosity) || 0;      // 0 = 없음, 1..6 = 별..어둠
    const own = curiosity - 1;                            // 열 인덱스, 없으면 -1
    const theme = resolveTheme();

    // 저장된 num 을 쓰지 않고 직접 계산 (기존 _preUpdate 재계산이 도는지 불확실하므로)
    const targets = computeTargets(table, gap, overflowX);
    const debuff = realmDebuff(table);
    const gapOn = (i) => !!(gap[i] ?? gap[String(i)]);

    const realms = REALM_KEYS.map((k, i) => ({
      index: i, curiosity: i + 1, name: stripRealmNumber(talentLabel(`MAGICALOGIA.${k}1`)), sigil: SIGILS[i],
      own: i === own, debuff: debuff[i], gapBefore: gapOn(i)
    }));

    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const cells = [];
      for (let i = 0; i < REALMS; i++) {
        const c = table[i]?.[r] ?? {};
        cells.push({
          realm: i, row: r, gapBefore: gapOn(i),
          title: talentLabel(`MAGICALOGIA.${REALM_KEYS[i]}${r + 2}`),
          state: !!c.state, misfortune: !!c.misfortune, target: targets[i][r], debuff: debuff[i]
        });
      }
      rows.push({ number: r + 2, cells });
    }

    const items = Array.from(this.actor.items);
    const byType = (t) => items.filter((i) => i.type === t).sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const mana = { value: num(sys.mana?.value), max: num(sys.mana?.max), tmp: num(sys.tmp_mana?.value) };
    const spiritMis = !!talent.spirit_talent?.misfortune;

    context.v3 = {
      editable: this.isEditable,
      isGM: game.user.isGM,
      theme,
      isSummer: theme === "summer",
      themes: [["rulebook", "룰북 편집"], ["academy", "학원 도시"], ["summer", "여름 청춘"], ["urban", "어반 판타지"]]
        .map(([value, label]) => ({ value, label, selected: value === theme })),
      themeText: THEME_TEXT[theme],
      preview: this._preview,
      hero: {
        img: this.actor.img, tmpName: this.actor.name,
        magicName: sys.details?.magic_name ?? "", identify: sys.details?.identify ?? "",
        career: sys.details?.career ?? "", agency: sys.details?.agency ?? "",
        realmName: own >= 0 ? realms[own].name : "",
        grade: sys.details?.grade ?? "", gradeNumber: (String(sys.details?.grade ?? "").match(/\d+/) ?? [""])[0],
        exp: sys.details?.exp ?? "", expAbstruct: sys.details?.exp_abstruct ?? "",
        attack: sys.details?.attack, defence: sys.details?.defence, rootForce: sys.details?.root_force,
        mana, manaPips: pips(mana.value, mana.max)
      },
      statuses: STATUS_KEYS.map(([key, label]) => ({ key, label: game.i18n.localize(label), on: !!sys.status?.[key] })),
      talent: {
        realms, rows, overflowX, curiosity,
        spirit: { name: talent.spirit_talent?.name ?? "", misfortune: spiritMis, target: spiritMis ? 12 : 6 }
      },
      abilities: byType("ability").map((i) => {
        const charge = num(i.system.charge);
        return { id: i.id, name: i.name, system: i.system, charge, hasCharge: true, pips: pips(charge, Math.max(5, charge)), wordUsed: !!i.system.word_check };
      }),
      relations: [
        ...byType("bond").map((i) => ({
          id: i.id, kind: "앵커", name: i.name, system: i.system, isBond: true,
          pips: pips(num(i.system.destiny), 5), used: !!i.system.check
        })),
        ...byType("item").map((i) => ({ id: i.id, kind: "아이템", name: i.name, system: i.system, isItem: true, qty: num(i.system.quantity, 1) }))
      ],
      handouts: byType("handout")
        .filter((i) => game.user.isGM || (i.system.visible instanceof Object && i.system.visible[game.user.id]))
        .map((i) => ({
          id: i.id, name: i.name, description: i.system.description,
          secret: (game.user.isGM || (i.system.sVisible instanceof Object && i.system.sVisible[game.user.id])) ? i.system.secret : null
        })),
      tables: await tableOptions(),
      merits: ["의무", "승리", "생존", "신조", "롤플레이", "심금", "사명", "희생", "기타"].map((label, k) => ({
        label, key: ["duty", "victory", "survival", "creed", "roleplay", "heartstring", "mission", "sacrifice", "other"][k],
        on: !!this.actor.getFlag("magicalogia", `sheetV3.merits.${["duty", "victory", "survival", "creed", "roleplay", "heartstring", "mission", "sacrifice", "other"][k]}`)
      })),
      flags: {
        careerCreed: this.actor.getFlag("magicalogia", "sheetV3.careerCreed") ?? "",
        agencyNote: this.actor.getFlag("magicalogia", "sheetV3.agencyNote") ?? "",
        race: this.actor.getFlag("magicalogia", "sheetV3.race") ?? "",
        rank: this.actor.getFlag("magicalogia", "sheetV3.rank") ?? "",
        raceCreed: this.actor.getFlag("magicalogia", "sheetV3.raceCreed") ?? ""
      },
      trueLook: sys.true_look ?? {}
    };
    context.system = sys;
    context.enrichedBiography = await TextEditor.enrichHTML(sys.details?.biography ?? "", { async: true });
    return context;
  }

  /* -------------------------------------------- */

  activateListeners(html) {
    super.activateListeners(html);
    // 읽기만 가능한 동작
    html.find(".mglg-theme-select").on("change", (ev) => game.settings.set("magicalogia", "v3Theme", ev.currentTarget.value));
    html.find(".mglg-preview-toggle").on("click", () => { this._preview = !this._preview; this.render(); });
    html.find(".mglg-item-edit").on("click", (ev) => this.actor.items.get(ev.currentTarget.dataset.itemId)?.sheet.render(true));
    html.find(".mglg-echo").on("click", (ev) => this.actor._echoItemDescription(ev.currentTarget.dataset.itemId));

    if (!this.isEditable) return;

    html.find(".mglg-cell").on("click", this._onRollCell.bind(this));
    html.find(".mglg-spirit-roll").on("click", this._onRollSpirit.bind(this));
    html.find(".mglg-resist").on("click", (ev) => { ev.preventDefault(); openResistDialog(this.actor, resolveTheme()); });
    html.find(".mglg-cell").on("contextmenu", this._onToggleMisfortune.bind(this));
    html.find(".mglg-acquire").on("change", this._onToggleAcquire.bind(this));
    html.find(".mglg-gap").on("click", this._onToggleGap.bind(this));
    html.find(".mglg-realm-pick").on("click", this._onPickRealm.bind(this));
    html.find(".mglg-status").on("click", this._onToggleStatus.bind(this));
    html.find(".mglg-step").on("click", this._onStep.bind(this));
    html.find(".mglg-charge").on("click", this._onCharge.bind(this));
    html.find(".mglg-word").on("click", this._onWord.bind(this));
    html.find(".mglg-item-create").on("click", this._onItemCreate.bind(this));
    html.find(".mglg-item-delete").on("click", this._onItemDelete.bind(this));
    html.find(".mglg-flag").on("change", (ev) => this.actor.setFlag("magicalogia", `sheetV3.${ev.currentTarget.dataset.flag}`, ev.currentTarget.type === "checkbox" ? ev.currentTarget.checked : ev.currentTarget.value));
    html.find(".mglg-table-roll").on("click", this._onRollTable.bind(this));
    html.find(".mglg-dice-roll").on("click", this._onRollDice.bind(this));
    html.find(".mglg-true-look").on("click", () => this.actor.update({ "system.true_look.check": !this.actor.system.true_look.check }));
  }

  /* -------------------------------------------- */
  /* 판정: v3 채팅 카드 (roll-card.js). Ctrl=보정 입력, Alt=비밀 굴림 */

  async _onRollCell(ev) {
    if (ev.target.closest(".mglg-acquire")) return;
    ev.preventDefault();
    const d = ev.currentTarget.dataset;
    const ask = ev.ctrlKey || game.settings.get("magicalogia", "rollAddon");
    return rollTalentCard(this.actor, { title: d.title, target: Number(d.target), ask, secret: ev.altKey, debuff: d.debuff === "true", realm: d.realm ?? "", theme: resolveTheme() });
  }

  async _onRollSpirit(ev) {
    ev.preventDefault();
    const sp = this.actor.system.talent?.spirit_talent ?? {};
    const ask = ev.ctrlKey || game.settings.get("magicalogia", "rollAddon");
    return rollTalentCard(this.actor, { title: sp.name || game.i18n.localize("MAGICALOGIA.SpiritTalent"), target: sp.misfortune ? 12 : 6, ask, secret: ev.altKey, theme: resolveTheme() });
  }

  async _onToggleMisfortune(ev) {
    ev.preventDefault();
    const { realm, row } = ev.currentTarget.dataset;
    const cur = !!this.actor.system.talent.table?.[realm]?.[row]?.misfortune;
    return this.actor.update({ [`system.talent.table.${realm}.${row}.misfortune`]: !cur });
  }

  /* 원클릭 편집 */
  async _onToggleAcquire(ev) {
    const { realm, row } = ev.currentTarget.dataset;
    return this.actor.update({ [`system.talent.table.${realm}.${row}.state`]: ev.currentTarget.checked });
  }

  async _onToggleGap(ev) {
    ev.preventDefault();
    const i = ev.currentTarget.dataset.gap;
    const cur = !!(this.actor.system.talent.gap?.[i]);
    return this.actor.update({ [`system.talent.gap.${i}`]: !cur });
  }

  /** 영역 선택 → 자기 영역 저장 + 갭 2칸 자동 칠하기 (기존 _preUpdate 에 기대지 않고 직접 저장) */
  async _onPickRealm(ev) {
    ev.preventDefault();
    const c = Number(ev.currentTarget.dataset.curiosity);
    const same = c === (Number(this.actor.system.talent.curiosity) || 0);
    if (same) return this.actor.update({ "system.talent.curiosity": 0 });
    return this.actor.update({ "system.talent.curiosity": c, "system.talent.gap": gapsForCuriosity(c) });
  }

  async _onToggleStatus(ev) {
    ev.preventDefault();
    const key = ev.currentTarget.dataset.status;
    return this.actor.update({ [`system.status.${key}`]: !this.actor.system.status?.[key] });
  }

  async _onStep(ev) {
    ev.preventDefault();
    const { path, add } = ev.currentTarget.dataset;
    const cur = num(foundry.utils.getProperty(this.actor, path));
    const next = cur + Number(add);
    if (next < 0) return;
    return this.actor.update({ [path]: next });
  }

  async _onCharge(ev) {
    ev.preventDefault();
    const item = this.actor.items.get(ev.currentTarget.dataset.itemId);
    const next = num(item?.system.charge) + Number(ev.currentTarget.dataset.add);
    if (!item || next < 0) return;
    return item.update({ "system.charge": next });
  }

  async _onWord(ev) {
    ev.preventDefault();
    const item = this.actor.items.get(ev.currentTarget.dataset.itemId);
    if (!item) return;
    if (item.system.word_check) return item.update({ "system.word_check": false });
    await item.update({ "system.word_check": true });
    return ChatMessage.create({
      user: game.user.id, speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<h3><b>${foundry.utils.escapeHTML(item.name)}</b></h3><b>${foundry.utils.escapeHTML(item.system.word ?? "")}</b>`
    });
  }

  async _onItemCreate(ev) {
    ev.preventDefault();
    const { type, img } = ev.currentTarget.dataset;
    const data = { name: `New ${type}`, type, img: `icons/svg/${img}.svg`, system: {} };
    if (type === "handout") data.system.visible = { [game.user.id]: true };
    return this.actor.createEmbeddedDocuments("Item", [data]);
  }

  async _onItemDelete(ev) {
    ev.preventDefault();
    return this.actor.items.get(ev.currentTarget.dataset.itemId)?.delete();
  }

  async _onRollTable(ev) {
    ev.preventDefault();
    const value = this.element.find(".mglg-table-select").val();
    if (!value) return;
    return rollConfigured(this.actor, value, resolveTheme());
  }

  async _onRollDice(ev) {
    ev.preventDefault();
    const formula = String(this.element.find(".mglg-dice-input").val() || "2d6").trim();
    if (!Roll.validate(formula)) return ui.notifications.warn(`주사위 식이 올바르지 않습니다: ${formula}`);
    const roll = new Roll(formula);
    await roll.evaluate();
    return roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: formula });
  }
}

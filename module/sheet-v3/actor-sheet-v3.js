import { computeTargets, realmDebuff, stripRealmNumber, REALMS, ROWS } from "./talent-calc.js";

const REALM_KEYS = ["A", "B", "C", "D", "E", "F"];
const STATUS_KEYS = [
  ["seal", "MAGICALOGIA.Seal"], ["burn", "MAGICALOGIA.Burn"], ["weakness", "MAGICALOGIA.Weakness"],
  ["sickness", "MAGICALOGIA.Sickness"], ["block", "MAGICALOGIA.Block"], ["misfortune", "MAGICALOGIA.Misfortune"],
  ["death", "MAGICALOGIA.Death"], ["extinction", "MAGICALOGIA.Extinction"]
];

/** 월드 설정(특기 이름 덮어쓰기) → 언어 파일 순서로 이름을 구한다. 기존 localTalent 헬퍼와 같은 규칙. */
function talentLabel(key) {
  let title = "";
  try { title = game.settings.get("magicalogia", key); } catch (e) { /* 설정 미등록 */ }
  return title !== "" && title != null ? title : game.i18n.localize(key);
}

/**
 * 마기카로기아 캐릭터 시트 v3. 기존 MagicalogiaActorSheet 는 건드리지 않는다.
 * 루트 클래스는 `mglg-sheet` 만 쓰고 기존 CSS 가 걸리는 `magicalogia` 클래스는 쓰지 않는다.
 */
export class MagicalogiaActorSheetV3 extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mglg-sheet", "sheet", "actor"],
      template: "systems/magicalogia/templates/sheet-v3/character-sheet-v3.html",
      width: 960,
      height: 900,
      tabs: [{ navSelector: ".mglg-tabs", contentSelector: ".mglg-body", initial: "sheet" }]
    });
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

    // 저장된 num 을 쓰지 않고 직접 계산 (기존 _preUpdate 재계산이 도는지 불확실하므로)
    const targets = computeTargets(table, gap, overflowX);
    const debuff = realmDebuff(table);

    const realms = REALM_KEYS.map((k, i) => ({
      index: i,
      name: stripRealmNumber(talentLabel(`MAGICALOGIA.${k}1`)),
      own: i === own,
      debuff: debuff[i],
      gapBefore: !!(gap[i] ?? gap[String(i)])             // i번 영역 열의 왼쪽 갭
    }));

    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const cells = [];
      for (let i = 0; i < REALMS; i++) {
        const c = table[i]?.[r] ?? {};
        cells.push({
          id: `col-${i}-${r}`,
          realm: i,
          row: r,
          title: talentLabel(`MAGICALOGIA.${REALM_KEYS[i]}${r + 2}`),
          state: !!c.state,
          misfortune: !!c.misfortune,
          target: targets[i][r],
          debuff: debuff[i]
        });
      }
      rows.push({ number: r + 2, cells });
    }

    const items = Array.from(this.actor.items);
    const byType = (t) => items.filter((i) => i.type === t).sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

    context.v3 = {
      editable: this.isEditable,
      isGM: game.user.isGM,
      hero: {
        img: this.actor.img,
        tmpName: this.actor.name,
        magicName: sys.details?.magic_name ?? "",
        identify: sys.details?.identify ?? "",
        career: sys.details?.career ?? "",
        agency: sys.details?.agency ?? "",
        realmName: own >= 0 ? realms[own].name : "",
        grade: sys.details?.grade ?? "",
        gradeNumber: (String(sys.details?.grade ?? "").match(/\d+/) ?? [""])[0],
        exp: sys.details?.exp ?? "",
        expAbstruct: sys.details?.exp_abstruct ?? "",
        attack: sys.details?.attack, defence: sys.details?.defence, rootForce: sys.details?.root_force,
        mana: { value: num(sys.mana?.value), max: num(sys.mana?.max), tmp: num(sys.tmp_mana?.value) },
        manaPips: Array.from({ length: Math.max(0, num(sys.mana?.max)) }, (_, i) => ({ on: i < num(sys.mana?.value) }))
      },
      statuses: STATUS_KEYS.map(([key, label]) => ({ key, label: game.i18n.localize(label), on: !!sys.status?.[key] })),
      talent: { realms, rows, overflowX, curiosity, spirit: { name: talent.spirit_talent?.name ?? "", misfortune: !!talent.spirit_talent?.misfortune } },
      abilities: byType("ability").map((i) => ({ id: i.id, name: i.name, system: i.system, charge: num(i.system.charge) })),
      bonds: byType("bond").map((i) => ({ id: i.id, name: i.name, system: i.system, destiny: num(i.system.destiny) })),
      items: byType("item").map((i) => ({ id: i.id, name: i.name, system: i.system })),
      handouts: byType("handout").map((i) => ({ id: i.id, name: i.name, system: i.system }))
    };
    return context;
  }
}

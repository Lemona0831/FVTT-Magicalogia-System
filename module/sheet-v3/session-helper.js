import { escapeHTML } from "./escape.js";
import { ZONES, hasZones, createZones, removeZones, addDie, clearMine, clearDice, revealAll, resolvePlot, observerAreas, assignObserver } from "./plot-board.js";
/**
 * 세션 도우미 (GM · PL 공용).
 *  - 장면 종류(드라마/전투/클라이맥스)와 현재 세계 법칙: GM 이 정하고 모두에게 동기화 (월드 설정 v3Session, 쓰기는 GM 만).
 *  - 표 굴리기, 내 저항 판정: 각자 자기 캐릭터로.
 * 세계 법칙의 본문은 설정에 저장하지 않고 이름만 저장한다. 본문은 data/tables.json 에서 이름으로 찾는다
 * (직접 입력한 법칙만 본문을 함께 저장).
 */
import { loadBuiltin, tableOptions, rollConfigured } from "./tables.js";
import { openResistDialog } from "./resist.js";
import { resolveTheme } from "./actor-sheet-v3.js";

export const SCENE_TYPES = [
  { id: "drama", label: "드라마 장면" },
  { id: "battle", label: "전투 장면" },
  { id: "climax", label: "클라이맥스" }
];
export const PHASES = [
  { id: "intro", label: "도입" },
  { id: "main", label: "메인", main: true },
  { id: "climax", label: "클라이맥스" }
];
const DEFAULT_STATE = { sceneType: "drama", phase: "intro", cycle: 1, laws: [] };
const LAW_TABLE = "세계 법칙 (일람)";

export function getSessionState() {
  let v = null;
  try { v = game.settings.get("magicalogia", "v3Session"); } catch (e) { /* 미등록 */ }
  return { ...DEFAULT_STATE, ...(v && typeof v === "object" ? v : {}), laws: Array.isArray(v?.laws) ? v.laws : [] };
}

async function saveState(state) {
  if (!game.user.isGM) return;
  await game.settings.set("magicalogia", "v3Session", state);
}

/** 세계 법칙 일람에서 { 이름: 본문 } 사전을 만든다. "1. 불간섭. 본문" / "2. 지각 차단: 본문" 꼴. */
async function lawBook() {
  const db = await loadBuiltin();
  const t = db.tables.find((x) => x.name === LAW_TABLE);
  const book = new Map();
  for (const e of t?.entries ?? []) {
    const m = String(e.text).match(/^([^:.]+)[:.]\s*(.*)$/);
    if (m) book.set(m[1].trim(), m[2].trim());
  }
  return book;
}

function myActor() {
  return game.user.character ?? canvas?.tokens?.controlled?.[0]?.actor ?? null;
}

export class SessionHelper extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "mglg-session",
      title: "세션 도우미",
      template: "systems/magicalogia/templates/sheet-v3/session-helper.html",
      classes: ["mglg-session-window"],
      width: 430, height: 620, resizable: true, minimizable: true
    });
  }

  async getData() {
    const st = getSessionState();
    const book = await lawBook();
    const cur = SCENE_TYPES.find((s) => s.id === st.sceneType) ?? SCENE_TYPES[0];
    const inUse = new Set(st.laws.map((l) => l.name));
    const actor = myActor();
    const ph = PHASES.find((p) => p.id === st.phase) ?? PHASES[0];
    if (this._tab === "gm" && !game.user.isGM) this._tab = "status";
    const tab = this._tab ?? "status";
    return {
      tab: { status: tab === "status", roll: tab === "roll", plot: tab === "plot", gm: tab === "gm" },
      zones: ZONES, faces: [1, 2, 3, 4, 5, 6], hasZones: hasZones(),
      observers: observerAreas().map((o) => ({ ...o, users: game.users.filter((u) => !u.isGM).map((u) => ({ id: u.id, name: u.name, sel: u.id === o.owner })), auto: !o.owner })),
      theme: resolveTheme(),
      isGM: game.user.isGM,
      phase: { ...ph, types: PHASES.map((p) => ({ ...p, on: p.id === ph.id })) },
      cycle: Math.max(1, Number(st.cycle) || 1),
      scene: { ...cur, types: SCENE_TYPES.map((s) => ({ ...s, on: s.id === cur.id })) },
      laws: st.laws.map((l, i) => ({ i, name: l.name, text: l.text ?? book.get(l.name) ?? "" })),
      lawOptions: [...book.keys()].filter((n) => !inUse.has(n)),
      tables: await tableOptions(),
      actorName: actor?.name ?? ""
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const gmOnly = (fn) => (...a) => { if (!game.user.isGM) return ui.notifications.warn("GM 만 바꿀 수 있습니다."); return fn(...a); };

    html.find(".mglg-plot-add").on("click", (ev) => {
      const b = ev.currentTarget;
      addDie({ zone: html.find(".mglg-plot-zone").val(), kind: b.dataset.kind, face: b.dataset.face ?? null });
    });
    html.find(".mglg-plot-add").attr("draggable", "true").on("dragstart", (ev) => {
      const b = ev.currentTarget;
      ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify({ type: "MglgDie", kind: b.dataset.kind, face: b.dataset.face ?? null }));
    });
    html.find(".mglg-plot-assign").on("change", gmOnly(async (ev) => { await assignObserver(ev.currentTarget.dataset.id, ev.currentTarget.value); this.render(); }));
    html.find(".mglg-plot-mine").on("click", () => clearMine());
    html.find(".mglg-plot-make").on("click", gmOnly(async () => { await createZones(); this.render(); }));
    html.find(".mglg-plot-unmake").on("click", gmOnly(async () => { await removeZones(); this.render(); }));
    html.find(".mglg-plot-reveal").on("click", gmOnly(() => revealAll()));
    html.find(".mglg-plot-resolve").on("click", gmOnly((ev) => resolvePlot(ev.currentTarget.dataset.side)));
    html.find(".mglg-plot-clear").on("click", gmOnly(() => clearDice()));
    html.find(".mglg-sess-tab").on("click", (ev) => { this._tab = ev.currentTarget.dataset.tab; this.render(); });
    const say = (head, body) => ChatMessage.create({
      content: `<div class="mglg-sess-chat"><b>${head}</b> · ${escapeHTML(body)}</div>`, speaker: { alias: "세션" }
    });
    html.find(".mglg-sess-phase").on("click", gmOnly(async (ev) => {
      const st = getSessionState();
      const next = ev.currentTarget.dataset.id;
      if (st.phase === next) return;
      await saveState({ ...st, phase: next });
      const p = PHASES.find((x) => x.id === next);
      say("진행 단계", p.main ? `${p.label} ${Math.max(1, Number(st.cycle) || 1)}사이클` : p.label);
    }));
    html.find(".mglg-sess-cycle").on("click", gmOnly(async (ev) => {
      const st = getSessionState();
      const cycle = Math.max(1, (Number(st.cycle) || 1) + Number(ev.currentTarget.dataset.d));
      if (cycle === st.cycle) return;
      await saveState({ ...st, cycle });
    }));

    html.find(".mglg-sess-scene").on("click", gmOnly(async (ev) => {
      const st = getSessionState();
      const next = ev.currentTarget.dataset.id;
      if (st.sceneType === next) return;
      await saveState({ ...st, sceneType: next });
      const label = SCENE_TYPES.find((s) => s.id === next)?.label;
      ChatMessage.create({ content: `<div class="mglg-sess-chat"><b>장면 전환</b> · ${escapeHTML(label)}</div>`, speaker: { alias: "세션" } });
    }));

    const announce = (name, text) => ChatMessage.create({
      content: `<div class="mglg-sess-chat"><b>세계 법칙</b> · ${escapeHTML(name)}${text ? `<br><span>${escapeHTML(text)}</span>` : ""}</div>`,
      speaker: { alias: "세션" }
    });

    html.find(".mglg-sess-law-add").on("click", gmOnly(async () => {
      const name = String(html.find(".mglg-sess-law-pick").val() || "").trim();
      if (!name) return;
      const st = getSessionState();
      if (st.laws.some((l) => l.name === name)) return;
      await saveState({ ...st, laws: [...st.laws, { name }] });
      announce(name, (await lawBook()).get(name));
    }));
    html.find(".mglg-sess-law-custom").on("click", gmOnly(async () => {
      const name = String(html.find(".mglg-sess-custom-name").val() || "").trim();
      const text = String(html.find(".mglg-sess-custom-text").val() || "").trim();
      if (!name) return;
      const st = getSessionState();
      await saveState({ ...st, laws: [...st.laws, { name, text }] });
      announce(name, text);
    }));
    html.find(".mglg-sess-law-del").on("click", gmOnly(async (ev) => {
      const i = Number(ev.currentTarget.dataset.i);
      const st = getSessionState();
      await saveState({ ...st, laws: st.laws.filter((_, k) => k !== i) });
    }));
    html.find(".mglg-sess-law-clear").on("click", gmOnly(async () => saveState({ ...getSessionState(), laws: [] })));

    html.find(".mglg-sess-roll-table").on("click", async () => {
      const value = html.find(".mglg-sess-table").val();
      if (value) rollConfigured(myActor(), value, resolveTheme());
    });
    html.find(".mglg-sess-resist").on("click", () => {
      const actor = myActor();
      if (!actor) return ui.notifications.warn("내 캐릭터가 없습니다. 캐릭터를 지정하거나 토큰을 선택하세요.");
      openResistDialog(actor, resolveTheme());
    });
  }
}

let _win = null;
export function openSessionHelper() {
  if (!_win) _win = new SessionHelper();
  _win.render(true);
  return _win;
}

/** 설정이 바뀌면 열려 있는 창만 다시 그린다 */
export function refreshSessionHelper() {
  if (_win?.rendered) _win.render();
}

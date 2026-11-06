import { escapeHTML } from "./escape.js";
import { TYPES, baseEffects, summon, selectedArchetypes, editEffects, removeArchetypes, effectsToString, parseEffects } from "./archetype.js";
import { realmName, talentName } from "./resist.js";
import { ZONES, hasZones, createZones, removeZones, addDie, clearMine, clearDice, revealAll, resolvePlot, observerAreas, assignObserver, getZones, getDelegate, setDelegate, myRole, getFirst, setFirst, relabelZones, SIDE } from "./plot-board.js";
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
import { KINDS, visibleItems, scenarios, currentScenario, journalHTML, info as hoInfo, secretOf, isShown, shownToAll, createHandout, createEnemy, createScenario, setShown, setShownAll, removeHandout } from "./handout.js";
import { MISSION, calcMerit, prefill, breakdown, settleActors, applyMerit } from "./settle.js";

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
const DEFAULT_STATE = { sceneType: "drama", phase: "intro", cycle: 1, laws: [], scenario: "" };
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

/** "놓을 구역" 드롭다운: 4구역(자동) + 같은 이름의 칸이 여러 개면 칸별로 */
function placeTargets() {
  const out = [];
  const zs = getZones();
  for (const z of ZONES.filter((z) => z.side === "B")) { // GM(에너미) 쪽 칸만

    out.push({ key: `${z.key}|`, label: z.label + (zs[z.key]?.length > 1 ? " (자동)" : "") });
    const list = [...(zs[z.key] ?? [])].sort((a, b) => a.y - b.y || a.x - b.x);
    if (list.length > 1) list.forEach((d, i) => out.push({ key: `${z.key}|${d.id}`, label: `${z.label} ${i + 1}` }));
  }
  return out;
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

  _settleState(a) { this._st ??= {}; return (this._st[a.id] ??= prefill(a)); }
  _settleRows() {
    return settleActors().map((a) => {
      const v = this._settleState(a), d = Number(v.duty) || 0;
      return {
        note: [a.getFlag("magicalogia", "sheetV3.agencyNote") && `기관: ${a.getFlag("magicalogia", "sheetV3.agencyNote")}`, a.getFlag("magicalogia", "sheetV3.race") && `종족: ${a.getFlag("magicalogia", "sheetV3.race")}`].filter(Boolean).join(" · "),
        id: a.id, name: a.name, exp: a.system.details?.exp || 0, v, total: calcMerit(v),
        anchorMode: v.mission === "anchor",
        missionOpts: Object.entries(MISSION).map(([value, label]) => ({ value, label, sel: v.mission === value })),
        dutyNone: d === 0, dutyUp: d > 0, dutyDown: d < 0,
        bonds: a.items.filter((i) => i.type === "bond").map((i) => ({ name: i.name, fate: Number(i.system.destiny) || 0 }))
      };
    });
  }

  async _handoutRows() {
    const players = game.users.filter((u) => !u.isGM), gm = game.user.isGM;
    const out = [];
    for (const k of KINDS) {
      const items = visibleItems(k.kind);
      if (!items.length && !gm) continue;
      const rows = await Promise.all(items.map(async (j) => {
        const f = hoInfo(j), sj = secretOf(j);
        const open = this._hoOpen?.has(j.id) ?? !gm;
        return {
          id: j.id, name: j.name, open, talent: f.talent, hasSecret: !!f.secretId,
          html: open ? await journalHTML(j) : "",
          secretShown: !!sj && open, secretHtml: sj && open ? await journalHTML(sj) : "",
          pubAll: shownToAll(j), secAll: shownToAll(sj),
          pubUsers: players.map((u) => ({ id: u.id, name: u.name, on: isShown(j, u) })),
          secUsers: sj ? players.map((u) => ({ id: u.id, name: u.name, on: isShown(sj, u) })) : []
        };
      }));
      out.push({ kind: k.kind, label: k.label, rows });
    }
    return out;
  }

  async getData() {
    const st = getSessionState();
    const book = await lawBook();
    const cur = SCENE_TYPES.find((s) => s.id === st.sceneType) ?? SCENE_TYPES[0];
    const inUse = new Set(st.laws.map((l) => l.name));
    const actor = myActor();
    const ph = PHASES.find((p) => p.id === st.phase) ?? PHASES[0];
    if ((this._tab === "gm" || this._tab === "settle") && !game.user.isGM) this._tab = "status";
    const tab = this._tab ?? "status";
    return {
      tab: { status: tab === "status", roll: tab === "roll", plot: tab === "plot", arch: tab === "arch", gm: tab === "gm", settle: tab === "settle", handout: tab === "handout" },
      settle: tab === "settle" ? this._settleRows() : [],
      hoGroups: tab === "handout" ? await this._handoutRows() : [],
      scenarios: tab === "handout" ? scenarios().map((f) => ({ id: f.id, name: f.name, on: f.id === currentScenario() })) : [],
      scenario: currentScenario(),
      skills: tab === "arch" ? Array.from({ length: 6 }, (_, r) => ({ realm: realmName(r), items: Array.from({ length: 11 }, (_, row) => ({ no: row + 2, name: talentName(r, row) })) })) : [],
      types: tab === "arch" ? await Promise.all(TYPES.map(async (t) => ({ name: t.name, base: effectsToString(parseEffects(await baseEffects(t.name))) }))) : [],
      zones: placeTargets(), myRole: myRole(), firstA: getFirst() === "A", firstB: getFirst() === "B", firstSide: getFirst(), secondSide: getFirst() === "A" ? "B" : "A", firstName: SIDE[getFirst()], secondName: SIDE[getFirst() === "A" ? "B" : "A"], delegates: game.users.filter((u) => !u.isGM).map((u) => ({ id: u.id, name: u.name, sel: u.id === getDelegate() })), faces: [1, 2, 3, 4, 5, 6], hasZones: hasZones(),
      observers: observerAreas().map((o) => ({ ...o, users: game.users.map((u) => ({ id: u.id, name: u.name, sel: u.id === o.owner })), auto: !o.owner })),
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
      const [zone, areaId] = String(html.find(".mglg-plot-zone").val() ?? "").split("|");
      addDie({ zone, areaId: areaId || null, kind: b.dataset.kind, face: b.dataset.face ?? null });
    });
    html.find(".mglg-plot-add").attr("draggable", "true").on("dragstart", (ev) => {
      const b = ev.currentTarget;
      ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify({ type: "MglgDie", kind: b.dataset.kind, face: b.dataset.face ?? null }));
    });
    html.find(".mglg-plot-assign").on("change", gmOnly(async (ev) => { await assignObserver(ev.currentTarget.dataset.id, ev.currentTarget.value); this.render(); }));
    html.find(".mglg-plot-delegate").on("change", gmOnly(async (ev) => { await setDelegate(ev.currentTarget.value); this.render(); }));
    html.find(".mglg-plot-first").on("change", gmOnly(async (ev) => { await setFirst(ev.currentTarget.value); this.render(); }));
    html.find(".mglg-plot-relabel").on("click", gmOnly(() => relabelZones()));
    const showBase = () => html.find(".mglg-arch-base").text(html.find(".mglg-arch-type option:selected").data("base") || "없음");
    html.find(".mglg-arch-type").on("change", showBase); showBase();
    html.find(".mglg-arch-go").on("click", () => summon({
      skill: html.find(".mglg-arch-skill").val(), type: html.find(".mglg-arch-type").val(),
      effects: html.find(".mglg-arch-fx").val(), color: html.find(".mglg-arch-color").val()
    }));
    html.find(".mglg-arch-edit").on("click", gmOnly(async () => {
      const toks = selectedArchetypes();
      if (!toks.length) return ui.notifications.warn("맵에서 원형 토큰을 먼저 선택하세요.");
      const cur = effectsToString(toks[0].getFlag("magicalogia", "archetype").effects ?? {});
      new Dialog({
        title: "원형 이펙트 수정",
        content: `<p>선택한 원형 ${toks.length}개의 이펙트를 아래 내용으로 바꿉니다.</p><input type="text" id="mglg-fx" value="${escapeHTML(cur)}" style="width:100%" placeholder="예: 블록2, 부스트1">`,
        buttons: { ok: { label: "적용", callback: async (h) => { for (const t of toks) await editEffects(t, h.find("#mglg-fx").val()); } }, cancel: { label: "취소" } },
        default: "ok"
      }).render(true);
    }));
    html.find(".mglg-arch-del").on("click", gmOnly(async () => {
      const toks = selectedArchetypes();
      if (!toks.length) return ui.notifications.warn("맵에서 원형 토큰을 먼저 선택하세요.");
      await removeArchetypes(toks);
    }));
    html.find(".mglg-plot-mine").on("click", () => clearMine());
    html.find(".mglg-plot-make").on("click", gmOnly(async () => { await createZones(); this.render(); }));
    html.find(".mglg-plot-unmake").on("click", gmOnly(async () => { await removeZones(); this.render(); }));
    html.find(".mglg-plot-reveal").on("click", gmOnly(() => revealAll()));
    html.find(".mglg-plot-resolve").on("click", gmOnly((ev) => resolvePlot(ev.currentTarget.dataset.side)));
    html.find(".mglg-plot-clear").on("click", gmOnly(() => clearDice()));
    const stCard = (el) => game.actors.get($(el).closest(".mglg-st-card").data("id"));
    html.find(".mglg-st").on("change", gmOnly((ev) => {
      const el = ev.currentTarget, a = stCard(el); if (!a) return;
      const v = this._settleState(a);
      v[el.dataset.k] = el.type === "checkbox" ? el.checked : (el.tagName === "SELECT" ? el.value : Number(el.value) || 0);
      if (el.dataset.k === "mission") return this.render();
      $(el).closest(".mglg-st-card").find(".mglg-st-total").text(calcMerit(v));
    }));
    html.find(".mglg-st-anchor").on("change", gmOnly((ev) => {
      const el = ev.currentTarget, a = stCard(el); if (!a || el.value === "") return;
      this._settleState(a).anchorFate = Number(el.value) || 0; this.render();
    }));
    const applyOne = async (a) => {
      const v = this._settleState(a), r = await applyMerit(a, v); if (!r) return;
      ChatMessage.create({ content: `<div class="mglg-sess-chat"><b>공적점 정산</b> · ${escapeHTML(a.name)}<br>${escapeHTML(breakdown(v) || "획득 없음")}<br><b>${r.before} → ${r.after}</b> (+${r.gain})</div>`, speaker: { alias: "세션" } });
      delete this._st[a.id];
    };
    html.find(".mglg-st-apply").on("click", gmOnly(async (ev) => {
      const a = stCard(ev.currentTarget); if (!a) return;
      await applyOne(a); this.render();
    }));
    html.find(".mglg-st-apply-all").on("click", gmOnly(async () => {
      if (!(await Dialog.confirm({ title: "공적점 정산", content: "<p>표시된 모든 캐릭터의 공적점에 이번 획득분을 더합니다. 계속할까요?</p>" }))) return;
      for (const a of settleActors()) await applyOne(a);
      this.render();
    }));
    html.find(".mglg-ho-new").on("click", gmOnly(async () => {
      const r = await Dialog.prompt({
        title: "새 핸드아웃", rejectClose: false, label: "만들기",
        content: `<form>
          <div class="form-group"><label>제목</label><input type="text" name="t" placeholder="예: 하루카의 일기장"></div>
          <div class="form-group"><label>공개 정보</label><textarea name="p" rows="4" style="width:100%"></textarea></div>
          <div class="form-group"><label>조사 특기</label><input type="text" name="k" placeholder="예: 기억 / 비밀을 알아내는 특기"></div>
          <div class="form-group"><label>비밀</label><textarea name="s" rows="4" style="width:100%" placeholder="비워 두면 비밀 없는 핸드아웃"></textarea></div>
          <p class="notes">빈 줄로 문단을 나눕니다. 이미지·서식은 만든 뒤 '편집'에서 넣을 수 있습니다. 공개하기 전에는 GM 만 볼 수 있고, 비밀은 조사에 성공한 사람에게만 따로 공개합니다.</p></form>`,
        callback: (h) => ({ title: String(h.find("[name=t]").val() ?? "").trim(), pub: h.find("[name=p]").val(), talent: h.find("[name=k]").val(), secret: h.find("[name=s]").val() })
      });
      if (!r) return;
      await createHandout({ ...r, scenarioId: currentScenario() }); this.render();
    }));
    html.find(".mglg-ho-newenemy").on("click", gmOnly(async () => {
      const r = await Dialog.prompt({
        title: "새 에너미 정보", rejectClose: false, label: "만들기",
        content: `<form>
          <div class="form-group"><label>이름</label><input type="text" name="t" placeholder="예: 폐교의 그림자"></div>
          <div class="form-group"><label>공개 정보</label><textarea name="p" rows="6" style="width:100%" placeholder="플레이어에게 보여 줄 에너미 데이터"></textarea></div>
          <p class="notes">공개용 데이터입니다. 공개하기 전에는 GM 만 볼 수 있습니다. 표·이미지는 만든 뒤 '편집'에서 넣을 수 있습니다.</p></form>`,
        callback: (h) => ({ title: String(h.find("[name=t]").val() ?? "").trim(), pub: h.find("[name=p]").val() })
      });
      if (!r) return;
      await createEnemy({ ...r, scenarioId: currentScenario() }); this.render();
    }));
    html.find(".mglg-ho-newscn").on("click", gmOnly(async () => {
      const name = await Dialog.prompt({
        title: "새 시나리오", rejectClose: false, label: "만들기",
        content: `<form><div class="form-group"><label>시나리오 제목</label><input type="text" name="t"></div><p class="notes">저널 폴더 '제목' 아래에 HO, ENEMY 폴더를 만들고, 지금 시나리오로 정합니다.</p></form>`,
        callback: (h) => String(h.find("[name=t]").val() ?? "").trim()
      });
      if (!name) return;
      const f = await createScenario(name);
      if (f) await saveState({ ...getSessionState(), scenario: f.id });
      this.render();
    }));
    html.find(".mglg-ho-scn").on("change", gmOnly(async (ev) => { await saveState({ ...getSessionState(), scenario: ev.currentTarget.value }); }));
    const hoOf = (el) => game.journal.get($(el).closest(".mglg-ho").data("id"));
    html.find(".mglg-ho-toggle").on("click", gmOnly(async (ev) => {
      const el = ev.currentTarget, j = hoOf(el), u = game.users.get(el.dataset.user); if (!j || !u) return;
      const target = el.dataset.kind === "secret" ? secretOf(j) : j;
      await setShown(j, el.dataset.kind, u.id, !isShown(target, u));
    }));
    html.find(".mglg-ho-all").on("click", gmOnly(async (ev) => {
      const el = ev.currentTarget, j = hoOf(el); if (!j) return;
      const target = el.dataset.kind === "secret" ? secretOf(j) : j;
      await setShownAll(j, el.dataset.kind, !shownToAll(target));
    }));
    html.find(".mglg-ho-edit").on("click", gmOnly((ev) => {
      const j = hoOf(ev.currentTarget); if (!j) return;
      (ev.currentTarget.dataset.kind === "secret" ? secretOf(j) : j)?.sheet.render(true);
    }));
    html.find(".mglg-ho-del").on("click", gmOnly(async (ev) => {
      const j = hoOf(ev.currentTarget); if (!j) return;
      if (await Dialog.confirm({ title: "핸드아웃 삭제", content: `<p>'${escapeHTML(j.name)}' 핸드아웃(공개 정보와 비밀 저널)을 삭제합니다. 되돌릴 수 없습니다.</p>` })) { await removeHandout(j); }
    }));
    html.find(".mglg-ho-head").on("click", (ev) => {
      const id = $(ev.currentTarget).closest(".mglg-ho").data("id");
      this._hoOpen ??= new Set(game.user.isGM ? [] : KINDS.flatMap((k) => visibleItems(k.kind)).map((j) => j.id));
      this._hoOpen.has(id) ? this._hoOpen.delete(id) : this._hoOpen.add(id);
      this.render();
    });
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
export function openSessionHelper(tab) {
  if (!_win) _win = new SessionHelper();
  if (typeof tab === "string") _win._tab = tab;
  _win.render(true);
  return _win;
}

/** 설정이 바뀌면 열려 있는 창만 다시 그린다 */
export function refreshSessionHelper() {
  if (_win?.rendered) _win.render();
}

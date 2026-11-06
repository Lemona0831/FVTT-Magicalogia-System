/**
 * 플롯 보드: 맵 위 4구역(A/B 대표·입회) + 주사위 타일.
 *  - 구역 = 장면의 그리기(Drawing) 사각형. 플래그 magicalogia.zone 에 구역 키를 저장한다. (GM 이 버튼을 눌렀을 때만 만든다)
 *  - 주사위 = 장면의 타일(Tile). 플래그 magicalogia.die = { zone, kind, owner, revealed, face? }.
 *    공개 전에는 눈을 타일 데이터에 쓰지 않는다 → GM 브라우저(localStorage)에만 보관해 다른 플레이어에게 새지 않게 한다.
 *  - 플레이어는 타일을 직접 만들 수 없으므로 소켓으로 GM 에게 요청한다 (GM 이 접속해 있어야 한다).
 *  - 비교 계산은 plot-logic.js (룰북 기준). Roll20 match_dice 의 4구역 구성은 따르되, 공격/방어를 나눠서 계산한다.
 */
import { resolveClash } from "./plot-logic.js";
import { escapeHTML } from "./escape.js";

const IMG = "systems/magicalogia/assets/plot/dice";
export const ZONES = [
  { key: "A_delegate", side: "A", role: "delegate", label: "A 대표", color: "#ff4f93" },
  { key: "A_observer", side: "A", role: "observer", label: "A 입회", color: "#ff9ec4" },
  { key: "B_delegate", side: "B", role: "delegate", label: "B 대표", color: "#2f6fd0" },
  { key: "B_observer", side: "B", role: "observer", label: "B 입회", color: "#7fb0f0" }
];
const DIE_SIZE = 70;
const SECRET_KEY = "magicalogia.plotSecrets";
const faceImg = (f) => `${IMG}/${f}.png`;
const KIND_IMG = { back: `${IMG}/back.png`, random: `${IMG}/random.png`, focus: `${IMG}/focus.png` };

/* ---------- GM 쪽 비밀(공개 전 눈) 보관 ---------- */
const readSecrets = () => { try { return JSON.parse(localStorage.getItem(SECRET_KEY)) ?? {}; } catch (e) { return {}; } };
const writeSecrets = (o) => { try { localStorage.setItem(SECRET_KEY, JSON.stringify(o)); } catch (e) { /* 저장 불가 */ } };

const scene = () => canvas?.scene ?? game.scenes?.viewed ?? null;
const dieOf = (t) => t.getFlag("magicalogia", "die");

export function getZones(sc = scene()) {
  // 같은 이름의 구역을 여러 개 둘 수 있다 (입회인마다 칸을 따로 까는 식). 키 → 드로잉 배열
  const map = {};
  for (const d of sc?.drawings?.contents ?? []) {
    const key = d.getFlag("magicalogia", "zone");
    if (key) (map[key] ??= []).push(d);
  }
  return map;
}
export const hasZones = (sc = scene()) => { const m = getZones(sc); return ZONES.every((z) => m[z.key]?.length); };

const zoneRect = (d) => ({ x: d.x, y: d.y, w: d.shape.width, h: d.shape.height });
const inside = (r, px, py) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

/** GM: 현재 장면에 4구역을 만든다. 이미 있는 구역은 건드리지 않는다. */
export async function createZones() {
  if (!game.user.isGM) return ui.notifications.warn("GM 만 구역을 만들 수 있습니다.");
  const sc = scene();
  if (!sc) return ui.notifications.warn("보이는 장면이 없습니다.");
  const have = getZones(sc);
  const g = sc.grid.size || 100;
  const rect = sc.dimensions?.sceneRect ?? { x: 0, y: 0, width: sc.width, height: sc.height };
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const W = 7 * g, H = { delegate: 3 * g, observer: 2 * g };
  const gap = g;
  const layout = {
    A_delegate: [cx - W - gap / 2, cy - H.delegate - gap / 2],
    A_observer: [cx - W - gap / 2, cy + gap / 2],
    B_delegate: [cx + gap / 2, cy - H.delegate - gap / 2],
    B_observer: [cx + gap / 2, cy + gap / 2]
  };
  const docs = ZONES.filter((z) => !have[z.key]?.length).map((z) => ({
    x: Math.round(layout[z.key][0]), y: Math.round(layout[z.key][1]),
    shape: { type: "r", width: W, height: H[z.role] },
    fillType: 1, fillColor: z.color, fillAlpha: 0.18,
    strokeWidth: 4, strokeColor: z.color, strokeAlpha: 0.9,
    text: z.label, fontSize: 28, textColor: "#ffffff", textAlpha: 0.8,
    flags: { magicalogia: { zone: z.key } }
  }));
  if (!docs.length) return ui.notifications.info("구역이 이미 있습니다.");
  await sc.createEmbeddedDocuments("Drawing", docs);
  ui.notifications.info("플롯 구역을 만들었습니다. 끌어서 위치와 크기를 바꿀 수 있습니다.");
}

/** GM: 구역과 주사위를 모두 지운다 */
export async function removeZones() {
  if (!game.user.isGM) return;
  const sc = scene(); if (!sc) return;
  const ids = sc.drawings.filter((d) => d.getFlag("magicalogia", "zone")).map((d) => d.id);
  if (ids.length) await sc.deleteEmbeddedDocuments("Drawing", ids);
  await clearDice();
}

/* ---------- 주사위 놓기 ---------- */
/** kind: "face"(눈 1~6 지정) | "random" | "focus" */
export function addDie({ zone, kind, face = null }) {
  if (!hasZones()) return ui.notifications.warn("이 장면에 플롯 구역이 없습니다. GM 에게 구역 만들기를 요청하세요.");
  const data = { zone, kind, face, owner: game.user.id };
  if (game.user.isGM) return gmAddDie(data);
  const gm = game.users.activeGM;
  if (!gm) return ui.notifications.warn("GM 이 접속해 있어야 주사위를 놓을 수 있습니다.");
  game.socket.emit("system.magicalogia", { id: "v3plot", sender: game.user.id, receiver: gm.id, data: { op: "add", sceneId: scene().id, ...data } });
}

/** 구역 안에서 비어 있는 첫 칸 위치 (다른 주사위와 겹치지 않는 곳) */
function freeSlot(sc, zd, excludeId = null) {
  const pad = 8, size = DIE_SIZE, r = zoneRect(zd);
  const cols = Math.max(1, Math.floor((r.w - pad) / (size + pad)));
  const others = sc.tiles.filter((t) => dieOf(t) && t.id !== excludeId);
  for (let idx = 0; idx < 200; idx++) {
    const x = r.x + pad + (idx % cols) * (size + pad);
    const y = r.y + 40 + Math.floor(idx / cols) * (size + pad);
    if (!others.some((t) => Math.abs(t.x - x) < size * 0.6 && Math.abs(t.y - y) < size * 0.6)) return { x, y };
  }
  return { x: r.x + pad, y: r.y + 40 };
}

async function gmAddDie({ zone, kind, face, owner, sceneId }) {
  const sc = sceneId ? game.scenes.get(sceneId) : scene();
  const areas = getZones(sc)[zone];
  if (!sc || !areas?.length) return;
  const g = sc.grid.size || 100;
  const pad = 8;
  // 구역이 여러 개면 사람마다 자기 칸을 쓴다: 이미 내 주사위가 있는 칸 → 없으면 비어 있는 칸 → 없으면 가장 적은 칸
  const diceIn = (d) => { const rr = zoneRect(d); return sc.tiles.filter((t) => dieOf(t) && inside(rr, t.x + t.width / 2, t.y + t.height / 2)); };
  const countIn = (d) => diceIn(d).length;
  const ordered = [...areas].sort((a, b) => a.y - b.y || a.x - b.x);
  const mine = ordered.find((d) => diceIn(d).some((t) => dieOf(t).owner === owner));
  const zd = mine ?? ordered.map((d) => ({ d, n: countIn(d) })).sort((a, b) => a.n - b.n)[0].d;
  const size = DIE_SIZE; // 이미지 원본 크기(70px) 그대로
  const { x, y } = freeSlot(sc, zd);
  const [tile] = await sc.createEmbeddedDocuments("Tile", [{
    x, y, width: size, height: size, texture: { src: KIND_IMG.back },
    flags: { magicalogia: { die: { zone, kind, owner, revealed: false } } }
  }]);
  if (kind === "face" && tile) { const s = readSecrets(); s[tile.id] = Number(face); writeSecrets(s); }
}

/** 내 주사위만 모두 거둔다 (GM 은 전부 지우는 clearDice 를 쓴다) */
export function clearMine() {
  if (game.user.isGM) return clearDice(game.user.id);
  const gm = game.users.activeGM;
  if (!gm) return ui.notifications.warn("GM 이 접속해 있어야 합니다.");
  game.socket.emit("system.magicalogia", { id: "v3plot", sender: game.user.id, receiver: gm.id, data: { op: "clearMine", sceneId: scene().id, owner: game.user.id } });
}

export async function clearDice(owner = null, sceneId = null) {
  if (!game.user.isGM) return;
  const sc = sceneId ? game.scenes.get(sceneId) : scene(); if (!sc) return;
  const ids = sc.tiles.filter((t) => { const d = dieOf(t); return d && (!owner || d.owner === owner); }).map((t) => t.id);
  if (ids.length) await sc.deleteEmbeddedDocuments("Tile", ids);
  const s = readSecrets(); ids.forEach((id) => delete s[id]); writeSecrets(s);
}

/* ---------- 공개 / 비교 ---------- */
export async function revealAll() {
  if (!game.user.isGM) return ui.notifications.warn("GM 만 공개할 수 있습니다.");
  const sc = scene(); if (!sc) return;
  const secrets = readSecrets();
  const updates = [];
  for (const t of sc.tiles) {
    const d = dieOf(t);
    if (!d || d.revealed) continue;
    let face = d.face ?? null, src;
    if (d.kind === "focus") src = KIND_IMG.focus;
    else {
      face = d.kind === "random" ? (await new Roll("1d6").evaluate()).total : secrets[t.id];
      if (!(face >= 1 && face <= 6)) { ui.notifications.warn("눈을 알 수 없는 주사위가 있습니다 (GM 브라우저 데이터가 지워졌을 수 있음). 지우고 다시 놓아 주세요."); continue; }
      src = faceImg(face);
    }
    updates.push({ _id: t.id, "texture.src": src, "flags.magicalogia.die": { ...d, revealed: true, face } });
  }
  if (!updates.length) return ui.notifications.info("공개할 주사위가 없습니다.");
  await sc.updateEmbeddedDocuments("Tile", updates);
  ChatMessage.create({ content: `<div class="mglg-sess-chat"><b>플롯 공개</b> · 주사위 ${updates.length}개</div>`, speaker: { alias: "세션" } });
}

/** 구역별 눈 목록: 타일 중심이 들어간 구역, 없으면 놓았던 구역 플래그 */
function collect(sc) {
  const zones = getZones(sc);
  const rects = Object.fromEntries(Object.entries(zones).map(([k, ds]) => [k, ds.map(zoneRect)]));
  const out = Object.fromEntries(ZONES.map((z) => [z.key, { faces: [], tiles: [], focus: false, focusTiles: [] }]));
  for (const t of sc.tiles) {
    const d = dieOf(t); if (!d) continue;
    const cx = t.x + t.width / 2, cy = t.y + t.height / 2;
    const key = Object.keys(rects).find((k) => rects[k].some((r) => inside(r, cx, cy))) ?? d.zone;
    if (!out[key]) continue;
    if (d.kind === "focus") { out[key].focus = true; out[key].focusTiles.push(t.id); }
    else { out[key].faces.push(d.face); out[key].tiles.push(t.id); }
  }
  return out;
}

export async function resolvePlot(attackerSide) {
  if (!game.user.isGM) return ui.notifications.warn("GM 만 비교할 수 있습니다.");
  const sc = scene(); if (!sc) return;
  if (!hasZones(sc)) return ui.notifications.warn("이 장면에 플롯 구역이 없습니다.");
  if (sc.tiles.some((t) => dieOf(t) && !dieOf(t).revealed)) return ui.notifications.warn("공개되지 않은 주사위가 있습니다. 먼저 '공개'를 눌러 주세요.");
  const A = attackerSide, D = attackerSide === "A" ? "B" : "A";
  const z = collect(sc);
  if (z[`${A}_delegate`].faces.some((f) => f == null) || z[`${D}_delegate`].faces.some((f) => f == null)) return ui.notifications.warn("눈을 알 수 없는 주사위가 있습니다.");
  const res = resolveClash({
    attack: z[`${A}_delegate`].faces,
    defDelegate: z[`${D}_delegate`].faces,
    defObserver: z[`${D}_observer`].faces,
    focus: z[`${D}_delegate`].focus
  });

  // 제거된 주사위는 흐리게
  const updates = [];
  const mark = (list, tiles) => list.forEach((x) => { if (x.broken && tiles[x.i]) updates.push({ _id: tiles[x.i], alpha: 0.3 }); });
  mark(res.attack, z[`${A}_delegate`].tiles); mark(res.defDelegate, z[`${D}_delegate`].tiles); mark(res.defObserver, z[`${D}_observer`].tiles);
  if (updates.length) await sc.updateEmbeddedDocuments("Tile", updates);

  const die = (x) => `<img src="${faceImg(x.face)}" style="width:34px;height:34px;${x.broken ? "opacity:.3" : ""}">`;
  const row = (label, list) => `<div style="margin:3px 0"><span style="display:inline-block;width:64px">${label}</span>${list.length ? list.map(die).join("") : "<i>없음</i>"}</div>`;
  const head = res.success === "hit" ? `<b style="color:#c0392b">공격 성공 · 대미지 ${res.damage}</b>` : `<b style="color:#1e8c5b">방어 성공</b>`;
  const notes = [];
  if (res.focusDeclared) notes.push(`집중 방어: ${res.focusFaces.join("·")} 눈의 공격 주사위를 모두 제거`);
  if (res.focusIgnored) notes.push("집중 토큰이 있지만 대표 구역의 방어 주사위가 2개가 아니라 일반 방어로 처리");
  if (res.unusedDefense.length) notes.push(`남은 방어 주사위 ${res.unusedDefense.join("·")} (대미지 적용 후 마소로 변환 가능)`);
  notes.push("[추가 대미지]·[블록] 등 이펙트는 따로 적용하세요.");
  const content = `<div class="mglg-sess-chat">
    <b>플롯 비교</b> · ${A} 공격 → ${D} 방어<br>
    ${row(`${A} 공격`, res.attack)}${row(`${D} 대표`, res.defDelegate)}${row(`${D} 입회`, res.defObserver)}
    <div style="margin-top:6px">${head}</div>
    ${notes.map((n) => `<div style="font-size:12px">${escapeHTML(n)}</div>`).join("")}
  </div>`;
  ChatMessage.create({ content, speaker: { alias: "세션" } });
}

/* ---------- 끌어당기기: GM 이 주사위를 놓으면 가장 가까운 구역의 빈 칸으로 붙인다 ---------- */
Hooks.on("updateTile", async (tile, change, options, userId) => {
  if (!game.user.isGM || userId !== game.user.id || options?.mglgSnap) return;
  const d = dieOf(tile);
  if (!d || !("x" in change || "y" in change)) return;
  const sc = tile.parent; if (!sc) return;
  const cx = tile.x + tile.width / 2, cy = tile.y + tile.height / 2;
  let best = null;
  for (const [key, list] of Object.entries(getZones(sc))) {
    for (const zd of list) {
      const r = zoneRect(zd);
      const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w)), dy = Math.max(r.y - cy, 0, cy - (r.y + r.h));
      const dist = Math.hypot(dx, dy);
      if (!best || dist < best.dist) best = { key, zd, dist };
    }
  }
  if (!best || best.dist > (sc.grid.size || 100) * 4) return; // 구역에서 너무 멀면 그대로 둔다
  const { x, y } = freeSlot(sc, best.zd, tile.id);
  await tile.update({ x, y, "flags.magicalogia.die.zone": best.key }, { mglgSnap: true });
});

/* ---------- 소켓 (GM 쪽) ---------- */
export function initBoard() {
  game.socket.on("system.magicalogia", (msg) => {
    if (msg?.id !== "v3plot" || msg.receiver !== game.user.id || !game.user.isGM) return;
    const d = msg.data ?? {};
    if (d.op === "add") gmAddDie(d);
    else if (d.op === "clearMine") clearDice(d.owner, d.sceneId);
  });
}

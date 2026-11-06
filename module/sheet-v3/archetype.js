/**
 * 원형 토큰 소환 / 이펙트 마커 (Roll20 magicalogia_summon 에 해당).
 *  - 소환: 「(특기)의 (타입)」 토큰을 현재 장면에 만든다. 기본 이펙트(룰북 데이터, data/archetypes.json 이 있을 때)와 추가 이펙트를 합산.
 *  - 이펙트 표시: 블록은 토큰 막대(system.mana 를 빌려 씀), 나머지는 숫자가 그려진 마커 이미지를 토큰 효과 아이콘으로 붙인다.
 *  - 토큰은 모든 플레이어가 소유자인 공용 액터 "원형" 을 쓴다 (누구나 끌 수 있게). 만드는 것은 GM 클라이언트(소켓).
 * 이미지는 assets/archetype/ (설치본에만 둔다 — .gitignore 참고).
 */
import { escapeHTML } from "./escape.js";

const ASSET = "systems/magicalogia/assets/archetype";
const DATA_URL = "systems/magicalogia/data/archetypes.json";

export const TYPES = [
  ["정령", "spirit"], ["마검", "blade"], ["악몽", "nightmare"], ["기사", "knight"], ["처녀", "maiden"],
  ["전차", "chariot"], ["마왕", "demonking"], ["군단", "legion"], ["왕국", "kingdom"], ["마신", "god"], ["나락문", "gate"]
].map(([name, img]) => ({ name, img }));

/** 이펙트 정의. kw: 입력 별칭, max/min: 마커 이미지가 있는 숫자 범위, bar: 토큰 막대 표시, noNum: 숫자 없음 */
export const EFFECTS = {
  block:      { label: "블록",       kw: ["block", "bl", "블록", "블"], bar: true },
  damage:     { label: "추가 대미지", kw: ["damage", "da", "추가대미지", "대미지", "추가데미지", "데미지", "추댐", "추뎀", "추"], min: 1, max: 9, color: false },
  boost:      { label: "부스트",     kw: ["boost", "bo", "부스트", "부슽", "부"], min: 1, max: 6, color: true },
  cast:       { label: "캐스트",     kw: ["cast", "ca", "캐스트", "캐슽", "캐"], noNum: true, color: true },
  mana:       { label: "마나",       kw: ["mana", "ma", "마나", "마"], min: 1, max: 4, color: false },
  word:       { label: "워드",       kw: ["word", "wo", "워드", "워"], min: 4, max: 7, color: true },
  minus:      { label: "마이너스",   kw: ["minus", "mi", "마이너스", "-"], min: 1, max: 6, color: true },
  plus:       { label: "플러스",     kw: ["plus", "pl", "플러스", "플", "+"], min: 1, max: 6, color: true },
  spellguard: { label: "스펠가드",   kw: ["spellguard", "sp", "스펠가드", "가드", "스", "가"], min: 1, max: 4, color: true }
};

/** "블록2, 추댐1 부스트" → { block:2, damage:1, boost:1 } (같은 이펙트는 합산, 숫자 없으면 1) */
export function parseEffects(str) {
  const out = {};
  for (const part of String(str ?? "").split(/[,，\s]+/).filter(Boolean)) {
    const m = part.match(/^(.*?)(\d*)$/);
    const word = m[1].toLowerCase(), num = m[2] ? Number(m[2]) : null;
    const key = Object.keys(EFFECTS).find((k) => EFFECTS[k].kw.includes(word) || k === word);
    if (!key) continue;
    const def = EFFECTS[key];
    out[key] = def.noNum ? 1 : (out[key] ?? 0) + (num ?? 1);
  }
  return out;
}
export const effectsToString = (fx) => Object.entries(fx).filter(([, n]) => n > 0)
  .map(([k, n]) => EFFECTS[k].label + (EFFECTS[k].noNum ? "" : n)).join(", ");

let _db = null;
export async function loadArchetypes() {
  if (_db) return _db;
  try { const r = await fetch(DATA_URL); if (!r.ok) throw new Error(r.status); _db = await r.json(); }
  catch (e) { console.warn("magicalogia | data/archetypes.json 을 불러오지 못했습니다 (기본 이펙트 없음)", e); _db = { types: [] }; }
  return _db;
}
export const baseEffects = async (type) => (await loadArchetypes()).types.find((t) => t.name === type)?.effects ?? "";

function markerSrc(key, n, color) {
  const d = EFFECTS[key];
  const c = color === "b" ? "b" : "w";
  if (key === "cast") return `${ASSET}/m/cast-${c}.png`;
  if (key === "mana" || key === "damage") return `${ASSET}/m/${key}-${n}.png`;
  return `${ASSET}/m/${key}-${c}-${n}.png`;
}

/* ---------- 공용 액터 ---------- */
async function ensureActor() {
  let a = game.actors.find((x) => x.getFlag("magicalogia", "archetypeActor"));
  if (a) return a;
  a = await Actor.create({
    name: "원형", type: "character", img: `${ASSET}/tokens/back.png`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { magicalogia: { archetypeActor: true } }
  });
  ui.notifications.info("'원형' 액터를 만들었습니다 (원형 토큰이 쓰는 공용 액터). 지우지 마세요.");
  return a;
}

/* ---------- 이펙트 표시 ---------- */
export async function applyEffects(token, fx, color) {
  const actor = token.actor; if (!actor) return;
  const old = actor.effects.filter((e) => e.getFlag("magicalogia", "archetypeFx")).map((e) => e.id);
  if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old);
  const docs = [];
  for (const [key, n] of Object.entries(fx)) {
    const d = EFFECTS[key]; if (!d || d.bar || !(n > 0)) continue;
    if (!d.noNum && (n < d.min || n > d.max)) { ui.notifications.warn(`${d.label}${n}: 마커 이미지가 ${d.min}~${d.max} 범위만 있어 표시하지 않습니다.`); continue; }
    docs.push({ name: d.label + (d.noNum ? "" : n), img: markerSrc(key, n, color), statuses: [`mglg-${key}`], flags: { magicalogia: { archetypeFx: true } } });
  }
  if (docs.length) await actor.createEmbeddedDocuments("ActiveEffect", docs);
  const block = fx.block ?? 0;
  await token.update({
    "flags.magicalogia.archetype.effects": fx, "flags.magicalogia.archetype.color": color,
    "delta.system.mana.value": block, "delta.system.mana.max": block,
    displayBars: block > 0 ? CONST.TOKEN_DISPLAY_MODES.ALWAYS : CONST.TOKEN_DISPLAY_MODES.NONE
  });
}

/* ---------- 소환 ---------- */
/** 요청자(누구든) → GM 이 만든다. {skill,type,effects(문자열),color,x,y} */
export function summon(req) {
  const data = { ...req, owner: game.user.id, sceneId: canvas.scene?.id };
  if (!data.sceneId) return ui.notifications.warn("보이는 장면이 없습니다.");
  const c = canvas.stage?.pivot;
  if (data.x == null && c) { data.x = c.x + (Math.random() - 0.5) * 200; data.y = c.y + (Math.random() - 0.5) * 200; }
  if (game.user.isGM) return gmSummon(data);
  const gm = game.users.activeGM;
  if (!gm) return ui.notifications.warn("GM 이 접속해 있어야 소환할 수 있습니다.");
  game.socket.emit("system.magicalogia", { id: "v3plot", sender: game.user.id, receiver: gm.id, data: { op: "summon", ...data } });
}

export async function gmSummon({ skill, type, effects, color, x, y, sceneId, owner }) {
  const sc = game.scenes.get(sceneId); if (!sc) return;
  const t = TYPES.find((v) => v.name === type); if (!t) return ui.notifications.warn(`알 수 없는 원형 타입: ${type}`);
  const actor = await ensureActor();
  const g = sc.grid.size || 100;
  const fx = parseEffects(`${await baseEffects(type)},${effects ?? ""}`);
  const name = skill ? `${skill}의 ${type}` : type;
  const w = 140 / g, h = 70 / g; // 가로 140px × 세로 70px
  const [tok] = await sc.createEmbeddedDocuments("Token", [{
    name, actorId: actor.id, actorLink: false, x: Math.round(x ?? 0), y: Math.round(y ?? 0), width: w, height: h,
    texture: { src: `${ASSET}/tokens/${t.img}.png` }, displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS, disposition: 0, lockRotation: true,
    bar1: { attribute: "mana" }, sight: { enabled: false },
    flags: { magicalogia: { archetype: { skill: skill ?? "", type, effects: fx, color: color === "b" ? "b" : "w", owner } } }
  }]);
  if (tok) await applyEffects(tok, fx, color === "b" ? "b" : "w");
  ChatMessage.create({ content: `<div class="mglg-sess-chat"><b>원형 소환</b> · ${escapeHTML(name)}${Object.keys(fx).length ? `<br><span>${escapeHTML(effectsToString(fx))}</span>` : ""}</div>`, speaker: { alias: "세션" } });
}

/** 선택된(또는 지정) 원형 토큰들 */
export const selectedArchetypes = () => (canvas.tokens?.controlled ?? []).map((t) => t.document).filter((d) => d.getFlag("magicalogia", "archetype"));

/** GM: 선택한 원형의 이펙트를 입력한 내용으로 바꾼다 */
export async function editEffects(token, text) {
  if (!game.user.isGM) return;
  const a = token.getFlag("magicalogia", "archetype");
  await applyEffects(token, parseEffects(text), a?.color ?? "w");
}

export async function removeArchetypes(tokens) {
  if (!game.user.isGM || !tokens.length) return;
  await tokens[0].parent.deleteEmbeddedDocuments("Token", tokens.map((t) => t.id));
}

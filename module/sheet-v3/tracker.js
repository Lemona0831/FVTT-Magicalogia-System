/**
 * 수치 변화 알림 (Roll20 attribute_tracker 에 해당).
 * 마력·일시적 마력·최대 마력, 마법의 충전/코스트, 관계의 운명, 원형 토큰의 블록이 바뀌면
 * 채팅에 "이름 / 이전 → 현재" 를 남긴다. 바꾼 사람의 클라이언트가 한 번만 보낸다.
 * 설정 'v3Track': 모두에게 공개 / GM에게만 귓속말 / 끔.  GM 만 조작하는 액터는 제외 옵션도 둔다.
 */
import { escapeHTML } from "./escape.js";

const get = (o, p) => foundry.utils.getProperty(o, p);
const MODE = () => game.settings.get("magicalogia", "v3Track");

const ACTOR_FIELDS = [
  ["system.mana.value", "마력"], ["system.tmp_mana.value", "일시적 마력"], ["system.mana.max", "최대 마력"]
];
const ITEM_FIELDS = {
  ability: [["system.charge", "충전"], ["system.cost", "코스트"]],
  bond: [["system.destiny", "운명"]]
};

/** 업데이트 데이터(평탄화)에 들어 있는 추적 대상의 이전 값을 모은다 */
function diffs(doc, changes, fields, prefix = "") {
  const flat = foundry.utils.flattenObject(changes ?? {});
  const out = [];
  for (const [path, label] of fields) {
    const p = prefix + path;
    if (!(p in flat)) continue;
    const before = get(doc, path), after = flat[p];
    if (String(before) !== String(after)) out.push({ label, before, after });
  }
  return out;
}

function post(speaker, title, list) {
  if (!list.length || MODE() === "off") return;
  const rows = list.map((d) => `<b>${escapeHTML(title ? `${title} · ${d.label}` : d.label)}</b> / <span style="color:#999">${escapeHTML(String(d.before ?? ""))}</span> → <b>${escapeHTML(String(d.after ?? ""))}</b>`).join("<br>");
  const data = { content: `<div class="mglg-sess-chat">${rows}</div>`, speaker: { alias: speaker } };
  if (MODE() === "gm") data.whisper = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);
  ChatMessage.create(data);
}

export function initTracker() {
  game.settings.register("magicalogia", "v3Track", {
    name: "수치 변화 알림",
    hint: "마력·마법 충전/코스트·관계 운명·원형 블록이 바뀌면 채팅에 '이전 → 현재'를 남깁니다.",
    scope: "world", config: true, type: String, default: "all",
    choices: { all: "모두에게 공개", gm: "GM에게만 귓속말", off: "끔" }
  });

  // 업데이트 전: 이전 값 확보 → options 에 실어 보낸다 (update 훅에는 이미 새 값이 들어 있음)
  Hooks.on("preUpdateActor", (a, ch, opt) => { opt.mglgTrack = diffs(a, ch, ACTOR_FIELDS); });
  Hooks.on("preUpdateItem", (it, ch, opt) => { opt.mglgTrack = diffs(it, ch, ITEM_FIELDS[it.type] ?? []); });
  Hooks.on("preUpdateToken", (tk, ch, opt) => {
    if (!tk.getFlag("magicalogia", "archetype")) return;
    const f = foundry.utils.flattenObject(ch ?? {});
    if (!("delta.system.mana.value" in f)) return;
    opt.mglgTrack = [{ label: "블록", before: tk.actor?.system?.mana?.value, after: f["delta.system.mana.value"] }]
      .filter((d) => String(d.before) !== String(d.after));
  });

  const mine = (userId) => userId === game.user.id;
  Hooks.on("updateActor", (a, ch, opt, userId) => {
    if (!mine(userId) || !opt.mglgTrack?.length) return;
    post(a.name, "", opt.mglgTrack);
  });
  Hooks.on("updateItem", (it, ch, opt, userId) => {
    if (!mine(userId) || !opt.mglgTrack?.length || !it.parent) return;
    post(it.parent.name, it.name, opt.mglgTrack);
  });
  Hooks.on("updateToken", (tk, ch, opt, userId) => {
    if (!mine(userId) || !opt.mglgTrack?.length) return;
    post(tk.name, "", opt.mglgTrack);
  });
}

/**
 * 핸드아웃 (세션 도우미 '핸드아웃' 탭).
 * 핸드아웃 = 공개 정보 + 비밀. 공개 정보를 지정 특기로 조사해 성공하면 비밀이 드러난다.
 *  - 공개 정보 = 저널 문서 1개 (flags.magicalogia.handout: {secretId, talent}).
 *  - 비밀 = 별도 저널 문서 1개 (flags.magicalogia.handoutSecret = 공개 저널 id). 비밀이 없으면 만들지 않는다.
 * 두 저널의 열람 권한으로 사람별 공개를 정하므로, 공개하지 않은 플레이어에게는 내용이 서버에서부터 전달되지 않는다.
 * 만들기·공개·삭제는 GM 만. 저널은 GM 이 버튼을 누를 때만 만들어진다.
 */
import { escapeHTML } from "./escape.js";

const OBS = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
const NONE = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;

export const isHandout = (j) => !!j.getFlag("magicalogia", "handout");
export const info = (j) => j.getFlag("magicalogia", "handout") ?? {};
/** 비밀 저널 (플레이어에게는 공개되기 전까지 undefined) */
export const secretOf = (j) => (info(j).secretId ? game.journal.get(info(j).secretId) : undefined);

/** 내가 볼 수 있는 핸드아웃 (GM 은 전부) */
export function visibleHandouts() {
  return game.journal.filter((j) => isHandout(j) && (game.user.isGM || j.testUserPermission(game.user, "OBSERVER")))
    .sort((a, b) => (a.getFlag("magicalogia", "handoutAt") ?? 0) - (b.getFlag("magicalogia", "handoutAt") ?? 0));
}

export async function journalHTML(j) {
  const html = j.pages.contents.filter((p) => p.type === "text").map((p) => p.text?.content ?? "").join("");
  return TextEditor.enrichHTML(html, { async: true });
}

/** 시트용: 목록 전체(가볍게) + 선택한 한 건의 상세. GM 은 선택한 것의 내용·비밀까지 본다 */
export async function sheetRows(selId) {
  const all = visibleHandouts(), gm = game.user.isGM;
  const sel = all.find((j) => j.id === selId) ?? all[0];
  const list = all.map((j) => {
    const f = info(j), s = secretOf(j);
    return { id: j.id, name: j.name, hasSecret: !!f.secretId, secretOpen: gm ? false : !!s, on: j.id === sel?.id };
  });
  let cur = null;
  if (sel) {
    const f = info(sel), s = secretOf(sel);
    cur = {
      id: sel.id, name: sel.name, talent: f.talent, hasSecret: !!f.secretId,
      html: await journalHTML(sel),
      secretShown: !!s, secretHtml: s ? await journalHTML(s) : "",
      secretLocked: !!f.secretId && !s
    };
  }
  return { list, cur };
}

export const isShown = (j, user) => !!j && j.testUserPermission(user, "OBSERVER");
export const shownToAll = (j) => !!j && j.ownership?.default >= OBS();

const toHTML = (body) => String(body ?? "").split(/\n{2,}/).filter((t) => t.trim()).map((t) => `<p>${escapeHTML(t).replace(/\n/g, "<br>")}</p>`).join("");
const page = (name, body) => ({ name, type: "text", text: { content: toHTML(body), format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 } });

export async function createHandout({ title, pub, secret, talent }) {
  if (!game.user.isGM) return;
  const name = title || "핸드아웃";
  let secretId = null;
  if (String(secret ?? "").trim()) {
    const s = await JournalEntry.create({
      name: `${name} (비밀)`, ownership: { default: NONE() }, pages: [page(`${name} (비밀)`, secret)],
      flags: { magicalogia: { handoutSecret: true } }
    });
    secretId = s.id;
  }
  const j = await JournalEntry.create({
    name, ownership: { default: NONE() }, pages: [page(name, pub)],
    flags: { magicalogia: { handout: { secretId, talent: String(talent ?? "").trim() }, handoutAt: Date.now() } }
  });
  if (secretId) await game.journal.get(secretId)?.setFlag("magicalogia", "handoutSecret", j.id);
  ui.notifications.info("핸드아웃(저널)을 만들었습니다. 공개하기 전에는 GM 만 볼 수 있습니다.");
  return j;
}

function announce(j, kind, userIds) {
  const names = userIds.map((id) => game.users.get(id)?.name).filter(Boolean);
  ChatMessage.create({
    content: `<div class="mglg-sess-chat"><b>핸드아웃 ${kind}</b> · ${escapeHTML(j.name)}<br><span>→ ${escapeHTML(names.join(", ") || "전원")}</span></div>`,
    speaker: { alias: "세션" }, whisper: [...new Set([...userIds, ...game.users.filter((u) => u.isGM).map((u) => u.id)])]
  });
}

/** 한 명에게 공개/숨김. kind: "pub"(공개 정보) | "secret"(비밀 — 공개 정보도 함께 열린다) */
export async function setShown(j, kind, userId, on) {
  if (!game.user.isGM) return;
  const lv = on ? OBS() : NONE();
  if (kind === "secret") {
    const s = secretOf(j); if (!s) return;
    if (on && !isShown(j, game.users.get(userId))) await j.update({ [`ownership.${userId}`]: OBS() });
    await s.update({ [`ownership.${userId}`]: lv });
    if (on) announce(j, "비밀 공개", [userId]);
  } else {
    await j.update({ [`ownership.${userId}`]: lv });
    if (!on) await secretOf(j)?.update({ [`ownership.${userId}`]: NONE() }); // 공개 정보를 숨기면 비밀도 함께 숨김
    if (on) announce(j, "공개", [userId]);
  }
}

/** 모두에게 공개/숨김 */
export async function setShownAll(j, kind, on) {
  if (!game.user.isGM) return;
  const lv = on ? OBS() : NONE();
  const players = game.users.filter((x) => !x.isGM);
  const upd = (doc) => { const u = { "ownership.default": lv }; for (const p of players) u[`ownership.${p.id}`] = lv; return doc.update(u); };
  if (kind === "secret") {
    const s = secretOf(j); if (!s) return;
    if (on) await upd(j);
    await upd(s);
  } else {
    await upd(j);
    if (!on && secretOf(j)) await upd(secretOf(j));
  }
  if (on) announce(j, kind === "secret" ? "비밀 공개" : "공개", []);
}

export async function removeHandout(j) {
  if (!game.user.isGM) return;
  const s = secretOf(j);
  await j.delete();
  if (s) await s.delete();
}

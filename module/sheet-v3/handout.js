/**
 * 핸드아웃·에너미 정보 (세션 도우미 '핸드아웃' 탭, 시트 '핸드아웃' 탭).
 *
 * 저널 폴더 구조 (시나리오마다):
 *   시나리오 제목        ← 최상위 저널 폴더
 *     ├ HO              ← 핸드아웃들
 *     └ ENEMY           ← 공개용 에너미 데이터
 * 폴더는 세션 도우미에서 '새 시나리오'로 만들 수도 있고, 사이드바에서 직접 만든 'HO' / 'ENEMY' 폴더(이름 대소문자 무관)도 인식한다.
 * 폴더 안의 저널은 표시를 달지 않았어도 핸드아웃/에너미로 취급한다 (비밀 없는 공개 정보만).
 *
 *  - 핸드아웃 = 공개 정보 + 비밀. 공개 정보를 지정 특기로 조사해 성공하면 비밀이 드러난다.
 *    공개 정보 = 저널 1개 (flags.magicalogia.handout: {secretId, talent}), 비밀 = 별도 저널 1개 (flags.magicalogia.handoutSecret).
 *  - 에너미 = 공개 정보만 있는 저널 1개 (flags.magicalogia.enemy).
 * 공개 여부는 저널의 열람 권한으로 사람별로 정하므로, 공개하지 않은 플레이어에게는 이름·내용이 서버에서부터 전달되지 않는다.
 * 만들기·공개·삭제는 GM 만, 월드 데이터(폴더·저널)는 GM 이 버튼을 누를 때만 만들어진다.
 */
import { escapeHTML } from "./escape.js";

const OBS = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
const NONE = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;

const KIND_RE = { ho: /^\s*(ho|핸드아웃)\s*$/i, enemy: /^\s*(enemy|에너미)\s*$/i };
export const KINDS = [{ kind: "ho", label: "핸드아웃", folder: "HO" }, { kind: "enemy", label: "에너미", folder: "ENEMY" }];

const folderKind = (f) => (f ? (KIND_RE.ho.test(f.name) ? "ho" : KIND_RE.enemy.test(f.name) ? "enemy" : null) : null);
const isJournalFolder = (f) => f.type === "JournalEntry";

/** 이 저널의 종류: "ho" | "enemy" | null (비밀 저널은 목록에서 제외) */
export function kindOf(j) {
  if (j.getFlag("magicalogia", "handoutSecret")) return null;
  if (j.getFlag("magicalogia", "handout")) return "ho";
  if (j.getFlag("magicalogia", "enemy")) return "enemy";
  return folderKind(j.folder);
}
/** 어느 시나리오(최상위 폴더 id)에 속하는가. 폴더 밖이면 "" */
export const scenarioOf = (j) => j.folder?.folder?.id ?? "";

export const info = (j) => j.getFlag("magicalogia", "handout") ?? {};
/** 비밀 저널 (플레이어에게는 공개되기 전까지 undefined) */
export const secretOf = (j) => (info(j).secretId ? game.journal.get(info(j).secretId) : undefined);

/** 시나리오 목록: HO / ENEMY 하위 폴더를 가진 최상위 저널 폴더 */
export function scenarios() {
  const fs = game.folders.filter(isJournalFolder);
  return fs.filter((f) => !f.folder && fs.some((c) => c.folder?.id === f.id && folderKind(c))).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ko"));
}
/** 지금 진행 중인 시나리오 (GM 이 정함, 월드 설정 v3Session.scenario). 빈 값 = 구분 없이 전부 */
export const currentScenario = () => { try { return game.settings.get("magicalogia", "v3Session")?.scenario ?? ""; } catch (e) { return ""; } };

/** 내가 볼 수 있는 항목 (GM 은 전부). 지금 시나리오가 정해져 있으면 그 시나리오 것만 */
export function visibleItems(kind) {
  const cur = currentScenario();
  return game.journal.filter((j) => kindOf(j) === kind && (game.user.isGM || j.testUserPermission(game.user, "OBSERVER")) && (!cur || scenarioOf(j) === cur))
    .sort((a, b) => (a.getFlag("magicalogia", "handoutAt") ?? 0) - (b.getFlag("magicalogia", "handoutAt") ?? 0) || a.sort - b.sort);
}

export async function journalHTML(j) {
  const html = j.pages.contents.filter((p) => p.type === "text").map((p) => p.text?.content ?? "").join("");
  return TextEditor.enrichHTML(html, { async: true });
}

async function rowFor(j, selId) {
  const f = info(j), s = secretOf(j), on = j.id === selId;
  const row = { id: j.id, name: j.name, hasSecret: !!f.secretId, talent: f.talent, on };
  if (on) Object.assign(row, { html: await journalHTML(j), secretShown: !!s, secretHtml: s ? await journalHTML(s) : "" });
  return row;
}

/** 시트용: [{label, rows}] — 핸드아웃 / 에너미 묶음. 펼친 한 건에만 내용을 붙인다. 비어 있는 묶음은 뺀다 */
export async function sheetRows(selId) {
  const out = [];
  for (const k of KINDS) {
    const items = visibleItems(k.kind);
    if (items.length) out.push({ kind: k.kind, label: k.label, rows: await Promise.all(items.map((j) => rowFor(j, selId))) });
  }
  return out;
}

export const isShown = (j, user) => !!j && j.testUserPermission(user, "OBSERVER");
export const shownToAll = (j) => !!j && j.ownership?.default >= OBS();

const toHTML = (body) => String(body ?? "").split(/\n{2,}/).filter((t) => t.trim()).map((t) => `<p>${escapeHTML(t).replace(/\n/g, "<br>")}</p>`).join("");
const page = (name, body) => ({ name, type: "text", text: { content: toHTML(body), format: CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 } });

/** 시나리오 아래의 HO / ENEMY 폴더 id (없으면 만든다). 시나리오가 없으면 폴더 없이 만든다 */
async function ensureFolder(scenarioId, kind) {
  if (!scenarioId) return null;
  const fs = game.folders.filter(isJournalFolder);
  const found = fs.find((c) => c.folder?.id === scenarioId && folderKind(c) === kind);
  if (found) return found.id;
  const f = await Folder.create({ name: KINDS.find((k) => k.kind === kind).folder, type: "JournalEntry", folder: scenarioId });
  return f.id;
}

/** 새 시나리오: 폴더 '제목' + 하위 'HO', 'ENEMY' */
export async function createScenario(title) {
  if (!game.user.isGM) return;
  const top = await Folder.create({ name: String(title || "새 시나리오").trim(), type: "JournalEntry" });
  await Folder.create({ name: "HO", type: "JournalEntry", folder: top.id });
  await Folder.create({ name: "ENEMY", type: "JournalEntry", folder: top.id });
  ui.notifications.info(`시나리오 폴더 '${top.name}' (HO, ENEMY)를 만들었습니다.`);
  return top;
}

export async function createHandout({ title, pub, secret, talent, scenarioId }) {
  if (!game.user.isGM) return;
  const name = title || "핸드아웃";
  const folder = await ensureFolder(scenarioId, "ho");
  let secretId = null;
  if (String(secret ?? "").trim()) {
    const s = await JournalEntry.create({
      name: `${name} (비밀)`, folder, ownership: { default: NONE() }, pages: [page(`${name} (비밀)`, secret)],
      flags: { magicalogia: { handoutSecret: true } }
    });
    secretId = s.id;
  }
  const j = await JournalEntry.create({
    name, folder, ownership: { default: NONE() }, pages: [page(name, pub)],
    flags: { magicalogia: { handout: { secretId, talent: String(talent ?? "").trim() }, handoutAt: Date.now() } }
  });
  if (secretId) await game.journal.get(secretId)?.setFlag("magicalogia", "handoutSecret", j.id);
  ui.notifications.info("핸드아웃(저널)을 만들었습니다. 공개하기 전에는 GM 만 볼 수 있습니다.");
  return j;
}

export async function createEnemy({ title, pub, scenarioId }) {
  if (!game.user.isGM) return;
  const name = title || "에너미";
  const j = await JournalEntry.create({
    name, folder: await ensureFolder(scenarioId, "enemy"), ownership: { default: NONE() }, pages: [page(name, pub)],
    flags: { magicalogia: { enemy: true, handoutAt: Date.now() } }
  });
  ui.notifications.info("에너미 정보(저널)를 만들었습니다. 공개하기 전에는 GM 만 볼 수 있습니다.");
  return j;
}

function announce(j, kind, userIds) {
  const names = userIds.map((id) => game.users.get(id)?.name).filter(Boolean);
  ChatMessage.create({
    content: `<div class="mglg-sess-chat"><b>${kindOf(j) === "enemy" ? "에너미 정보" : "핸드아웃"} ${kind}</b> · ${escapeHTML(j.name)}<br><span>→ ${escapeHTML(names.join(", ") || "전원")}</span></div>`,
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

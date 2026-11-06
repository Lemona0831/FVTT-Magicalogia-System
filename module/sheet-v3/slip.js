/**
 * 장서 토큰 (Roll20 magicalogia_mana_token 에 해당).
 *  - 장서(마법) 한 권마다 토큰 하나. 토큰 이름 = 마법 이름 (마우스를 올리면 표시).
 *  - 그림 = 코스트에 적힌 영역(별·짐승·힘·노래·꿈·어둠·전체)의 책, 칸이 찬 수 = 현재 충전(마소).
 *    코스트에 영역이 여럿이면 영역 순서(별→전체)에서 마지막으로 나오는 것, 없으면 전체 (Roll20 과 같은 규칙).
 *  - 충전은 양방향: 시트에서 바꾸면 토큰 그림이 바뀌고, 맵에서 토큰 막대 값(토큰 우클릭 HUD의 막대 칸)을 바꾸면 시트 충전이 바뀐다.
 *    토큰의 막대(bar1)는 공용 액터의 system.mana 를 빌려 쓰며, 막대 자체는 숨기고 그림의 찬 칸으로 보여 준다.
 * 이미지는 assets/slip/ (설치본에만 둔다 — .gitignore 참고).
 */
const ASSET = "systems/magicalogia/assets/slip";
const AREAS = [["별", "Star"], ["짐승", "Beast"], ["힘", "Power"], ["노래", "Melody"], ["꿈", "Dream"], ["어둠", "Darkness"], ["전체", "All"]];
const DEFAULT_IMG = "All";
const SIZE = 70;

/** "별 2 어둠 x" → "Darkness" (영역 순서상 마지막으로 포함된 것). "전 x" 같은 줄임도 전체로 본다. 없으면 All */
export function areaOf(cost) {
  const s = String(cost ?? "");
  let img = DEFAULT_IMG;
  for (const [name, file] of AREAS) {
    if (s.includes(name) || (name === "전체" && /(^|[\s\d])전(?![가-힣])/.test(s))) img = file;
  }
  return img;
}

/** 충전 0~8 → Star-0 / Star-01 … Star-08 (9 이상은 8) */
export function slipImage(img, charge) {
  const n = Math.max(0, Math.min(8, Number.parseInt(charge, 10) || 0));
  return `${ASSET}/${img}-${n === 0 ? "0" : String(n).padStart(2, "0")}.png`;
}

async function ensureActor() {
  let a = game.actors.find((x) => x.getFlag("magicalogia", "slipActor"));
  if (a) return a;
  a = await Actor.create({
    name: "장서 전표", type: "character", img: `${ASSET}/All-0.png`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { magicalogia: { slipActor: true } }
  });
  ui.notifications.info("'장서 전표' 액터를 만들었습니다 (장서 토큰이 쓰는 공용 액터). 지우지 마세요.");
  return a;
}

/** 요청: items = [{actorId, itemId}] — 누구든 요청, 토큰은 GM 클라이언트가 만든다 */
export function spawnSlips(items) {
  const sceneId = canvas.scene?.id;
  if (!sceneId) return ui.notifications.warn("보이는 장면이 없습니다.");
  const c = canvas.stage?.pivot;
  const data = { items, sceneId, x: c?.x ?? 0, y: c?.y ?? 0, owner: game.user.id };
  if (game.user.isGM) return gmSlips(data);
  const gm = game.users.activeGM;
  if (!gm) return ui.notifications.warn("GM 이 접속해 있어야 장서 토큰을 놓을 수 있습니다.");
  game.socket.emit("system.magicalogia", { id: "v3plot", sender: game.user.id, receiver: gm.id, data: { op: "slip", ...data } });
}

const findSlips = (itemId) => game.scenes.contents.flatMap((sc) => sc.tokens.filter((t) => t.getFlag("magicalogia", "slip")?.itemId === itemId));

export async function gmSlips({ items, sceneId, x, y, owner }) {
  const sc = game.scenes.get(sceneId); if (!sc) return;
  const actor = await ensureActor();
  const g = sc.grid.size || 100;
  const docs = [];
  let count = 0;
  for (const { actorId, itemId } of items ?? []) {
    const it = game.actors.get(actorId)?.items.get(itemId);
    if (!it || it.type !== "ability") continue;
    // 같은 장서의 토큰이 이 장면에 이미 있으면 새로 만들지 않는다
    if (sc.tokens.some((t) => t.getFlag("magicalogia", "slip")?.itemId === itemId)) continue;
    const col = count % 6, row = Math.floor(count / 6);
    docs.push({
      name: it.name, actorId: actor.id, actorLink: false,
      x: Math.round((x ?? 0) - 3 * SIZE + col * SIZE), y: Math.round((y ?? 0) - SIZE / 2 + row * SIZE),
      width: SIZE / g, height: SIZE / g, texture: { src: slipImage(areaOf(it.system.cost), it.system.charge) },
      displayName: CONST.TOKEN_DISPLAY_MODES.HOVER, displayBars: CONST.TOKEN_DISPLAY_MODES.NONE, bar1: { attribute: "mana" },
      disposition: 0, lockRotation: true, sight: { enabled: false },
      flags: { magicalogia: { slip: { actorId, itemId, owner } } }
    });
    count++;
  }
  if (docs.length) {
    const made = await sc.createEmbeddedDocuments("Token", docs);
    for (const t of made) { // 막대 값 = 충전 (최대 8)
      const it = game.actors.get(t.getFlag("magicalogia", "slip").actorId)?.items.get(t.getFlag("magicalogia", "slip").itemId);
      await t.update({ "delta.system.mana.value": Number(it?.system.charge) || 0, "delta.system.mana.max": 8 });
    }
  }
  else ui.notifications.info("새로 놓을 장서가 없습니다 (이미 이 장면에 있거나 장서가 없습니다).");
}

/** 시트에서 충전·코스트·이름이 바뀌면 맵의 장서 토큰을 맞춘다 / 장서가 지워지면 토큰도 지운다 (활성 GM 한 명만 실행) */
export function initSlips() {
  const isMe = () => game.users.activeGM?.isSelf;
  Hooks.on("updateItem", (it, ch) => {
    if (!isMe() || it.type !== "ability") return;
    const f = foundry.utils.flattenObject(ch ?? {});
    if (!["system.charge", "system.cost", "name"].some((k) => k in f)) return;
    for (const t of findSlips(it.id)) {
      t.update({ name: it.name, "texture.src": slipImage(areaOf(it.system.cost), it.system.charge), "delta.system.mana.value": Number(it.system.charge) || 0 });
    }
  });
  // 맵에서 토큰 막대 값을 바꾸면 시트의 충전도 바꾼다 (같은 값이면 건드리지 않아 되돌이가 생기지 않는다)
  Hooks.on("updateToken", (tk, ch) => {
    if (!isMe()) return;
    const s = tk.getFlag("magicalogia", "slip"); if (!s) return;
    const f = foundry.utils.flattenObject(ch ?? {});
    if (!("delta.system.mana.value" in f)) return;
    const v = Math.max(0, Math.min(8, Number.parseInt(f["delta.system.mana.value"], 10) || 0));
    const it = game.actors.get(s.actorId)?.items.get(s.itemId);
    if (it && (Number(it.system.charge) || 0) !== v) it.update({ "system.charge": v });
    else if (!it) ui.notifications.warn(`'${tk.name}' 장서를 찾을 수 없습니다 (지워졌거나 캐릭터가 바뀜).`);
  });
  Hooks.on("deleteItem", (it) => {
    if (!isMe() || it.type !== "ability") return;
    for (const t of findSlips(it.id)) t.delete();
  });
}

/**
 * 장서 전표 토큰. 시트의 마법(장서) → 맵에 코스트 그림 토큰을 올린다 (시트 → 전표 한 방향).
 * 코스트 표기: "별 2 어둠 x" (영역 + 숫자, x = 정해지지 않음), "전 x"/"전체 2" = 전체, "없음" = 코스트 없음.
 * 영역마다 토큰 하나(책 그림 + 코스트 수만큼 칸이 찬 그림). 이미지는 assets/slip/ (설치본에만 둔다 — .gitignore 참고).
 */

const ASSET = "systems/magicalogia/assets/slip";
const REALMS = [["별", "Star"], ["짐승", "Beast"], ["힘", "Power"], ["노래", "Melody"], ["꿈", "Dream"], ["어둠", "Darkness"], ["전체", "All"], ["전", "All"]];

/** "별 2 어둠 x" → [{realm:"별", img:"Star", n:2}, {realm:"어둠", img:"Darkness", n:null}] (n=null: x) */
export function parseCost(str) {
  const s = String(str ?? "").trim();
  if (!s || /^(없음|무|-)$/.test(s)) return [];
  const out = [];
  const re = /(전체|전|별|짐승|힘|노래|꿈|어둠)\s*(\d+|[xX×])?/g;
  let m;
  while ((m = re.exec(s))) {
    const img = REALMS.find(([k]) => k === m[1])[1];
    const raw = m[2];
    out.push({ realm: m[1] === "전" ? "전체" : m[1], img, n: raw && /\d/.test(raw) ? Math.min(8, Number(raw)) : null });
  }
  return out;
}

/** 파일 이름: 숫자 1~8 → Star-03, 0 → Star-00, x/없음 → Star-0 */
export function slipImage({ img, n }) {
  return `${ASSET}/${img}-${n == null ? "0" : String(n).padStart(2, "0")}.png`;
}

async function ensureActor() {
  let a = game.actors.find((x) => x.getFlag("magicalogia", "slipActor"));
  if (a) return a;
  a = await Actor.create({
    name: "장서 전표", type: "character", img: `${ASSET}/Black.png`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    flags: { magicalogia: { slipActor: true } }
  });
  ui.notifications.info("'장서 전표' 액터를 만들었습니다 (전표 토큰이 쓰는 공용 액터). 지우지 마세요.");
  return a;
}

/** 요청자(누구든) → GM 이 만든다. {name, type, cost} */
export function spawnSlip(req) {
  const sceneId = canvas.scene?.id;
  if (!sceneId) return ui.notifications.warn("보이는 장면이 없습니다.");
  const c = canvas.stage?.pivot;
  const data = { ...req, sceneId, owner: game.user.id, x: c?.x ?? 0, y: c?.y ?? 0 };
  if (game.user.isGM) return gmSlip(data);
  const gm = game.users.activeGM;
  if (!gm) return ui.notifications.warn("GM 이 접속해 있어야 전표를 놓을 수 있습니다.");
  game.socket.emit("system.magicalogia", { id: "v3plot", sender: game.user.id, receiver: gm.id, data: { op: "slip", ...data } });
}

export async function gmSlip({ name, type, cost, sceneId, x, y, owner }) {
  const sc = game.scenes.get(sceneId); if (!sc) return;
  let parts = parseCost(cost);
  if (!parts.length) parts = [{ realm: type === "장비" ? "장비" : "없음", img: type === "장비" ? "Equipment" : "Black", n: null }];
  const actor = await ensureActor();
  const g = sc.grid.size || 100, size = 70, gap = 80;
  const x0 = (x ?? 0) - ((parts.length - 1) * gap) / 2 - size / 2;
  const docs = parts.map((p, i) => ({
    name: `${name} · ${p.realm}${p.n == null ? (p.img === "Black" || p.img === "Equipment" ? "" : " x") : p.n}`,
    actorId: actor.id, actorLink: false, x: Math.round(x0 + i * gap), y: Math.round((y ?? 0) - size / 2),
    width: size / g, height: size / g, texture: { src: slipImage(p) }, displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
    disposition: 0, lockRotation: true, sight: { enabled: false },
    flags: { magicalogia: { slip: { spell: name, realm: p.realm, n: p.n, owner } } }
  }));
  await sc.createEmbeddedDocuments("Token", docs);
}

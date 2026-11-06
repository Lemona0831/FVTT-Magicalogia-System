import { MagicalogiaActorSheetV3 } from "./actor-sheet-v3.js";
import { TablesConfigApp } from "./tables.js";
import { openSessionHelper, refreshSessionHelper } from "./session-helper.js";
import { initBoard } from "./plot-board.js";

export const THEMES = ["rulebook", "academy", "summer", "urban"];

// 기존 시트(makeDefault: true)는 그대로 두고, 새 시트는 시트 설정에서 고를 수 있게만 등록한다.
Hooks.once("init", () => {
  Actors.registerSheet("magicalogia", MagicalogiaActorSheetV3, {
    types: ["character"],
    makeDefault: false,
    label: "마기카로기아 시트 v3 (새 디자인)"
  });

  // GM이 정하는 기본 테마 (월드), 사용자별 선택 (클라이언트, inherit = 월드 기본값 따름)
  game.settings.register("magicalogia", "v3DefaultTheme", {
    name: "시트 v3 기본 테마",
    hint: "사용자가 따로 고르지 않았을 때 쓰는 테마입니다.",
    scope: "world", config: true, type: String, default: "rulebook",
    choices: { rulebook: "룰북 편집", academy: "학원 도시", summer: "여름 청춘", urban: "어반 판타지" }
  });
  game.settings.register("magicalogia", "v3Theme", {
    name: "시트 v3 테마 (내 설정)",
    hint: "'기본값 따름'이면 GM이 정한 기본 테마를 씁니다.",
    scope: "client", config: true, type: String, default: "inherit",
    choices: { inherit: "기본값 따름", rulebook: "룰북 편집", academy: "학원 도시", summer: "여름 청춘", urban: "어반 판타지" },
    onChange: () => Object.values(ui.windows).filter((w) => w instanceof MagicalogiaActorSheetV3).forEach((w) => w.render())
  });

  // 시트의 "각종 표" 구성 (GM). null = 기본 목록
  game.settings.register("magicalogia", "v3Tables", {
    scope: "world", config: false, type: Object, default: null,
    onChange: () => Object.values(ui.windows).filter((w) => w instanceof MagicalogiaActorSheetV3).forEach((w) => w.render())
  });
  // 세션 도우미 상태 (장면 종류, 적용 중인 세계 법칙). 쓰기는 GM 만.
  game.settings.register("magicalogia", "v3Session", {
    scope: "world", config: false, type: Object, default: { sceneType: "drama", laws: [] },
    onChange: () => refreshSessionHelper()
  });
  game.settings.registerMenu("magicalogia", "v3TablesMenu", {
    name: "시트 v3 · 각종 표 구성",
    label: "표 목록 편집",
    hint: "시트의 '각종 표' 드롭다운에 보일 표와 순서를 정합니다.",
    icon: "fas fa-dice", type: TablesConfigApp, restricted: true
  });
});

// 새로 만들어진 판정 카드만 연출을 재생한다 (스티커 슬램 -> 히트 스톱 -> 카운트 업 -> 결과 도장).
// Dice So Nice 가 메시지를 숨겨 두는 동안에는 재생하지 않고, 화면에 보이는 순간 시작한다.
// 연출 길이(ms): CSS 의 --d 와 맞춰야 한다.
const POP_D = { success: 500, fail: 700, special: 700, fumble: 700 };

function countUp(el, to, startMs, lenMs) {
  const from = 2; // 2D6 최솟값부터 올라간다
  if (!Number.isFinite(to) || to <= from) return;
  el.textContent = String(from);
  const t0 = performance.now() + startMs;
  const tick = (now) => {
    const k = Math.min(1, Math.max(0, (now - t0) / lenMs));
    el.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 2)))); // ease-out
    if (k < 1) requestAnimationFrame(tick); else el.textContent = String(to);
  };
  requestAnimationFrame(tick);
}

Hooks.on("renderChatMessage", (message, html) => {
  if (!message.getFlag("magicalogia", "v3Roll")) return;
  if (Date.now() - (message.timestamp ?? 0) > 20000) return; // 오래된 메시지는 연출 없음
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const card = html[0]?.querySelector?.(".mglg-card") ?? html.find?.(".mglg-card")?.[0];
  if (!card || card.dataset.mglgPlayed) return;
  card.dataset.mglgPlayed = "1";
  const outcome = message.getFlag("magicalogia", "v3Roll")?.outcome ?? "success";
  const d = POP_D[outcome] ?? 500;
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const total = card.querySelector(".mglg-total");
    if (total) countUp(total, Number(total.textContent), d * 0.85, 450);
    card.classList.add("mglg-pop");
  });
  io.observe(card);
});

// 세션 도우미: 장면 컨트롤 버튼 (모든 사용자) + 콘솔/매크로용 game.magicalogia.openSession()
// 어떤 경로로든 열리게: 컨트롤 버튼, 단축키(기본 Alt+S), 채팅 명령(/세션, /session), 콘솔
const safeOpen = () => {
  try { return openSessionHelper(); }
  catch (e) { console.error("magicalogia | 세션 도우미를 열지 못했습니다", e); ui.notifications.error("세션 도우미를 열지 못했습니다. 콘솔(F12)을 확인하세요."); }
};
Hooks.once("ready", () => {
  game.magicalogia = game.magicalogia ?? {};
  game.magicalogia.openSession = safeOpen;
  try { initBoard(); } catch (e) { console.warn("magicalogia | 플롯 보드 소켓 등록 실패", e); }
});
Hooks.on("getSceneControlButtons", (controls) => {
  const group = controls.find((c) => c.name === "token") ?? controls[0];
  if (!group?.tools || group.tools.some((t) => t.name === "mglgSession")) return;
  group.tools.push({ name: "mglgSession", title: "세션 도우미", icon: "fas fa-wand-sparkles", button: true, onClick: safeOpen });
});
Hooks.once("init", () => {
  try {
    game.keybindings.register("magicalogia", "openSession", {
      name: "세션 도우미 열기", editable: [{ key: "KeyS", modifiers: ["Alt"] }], onDown: () => { safeOpen(); return true; }
    });
  } catch (e) { console.warn("magicalogia | 단축키 등록 실패", e); }
});
Hooks.on("chatMessage", (log, message) => {
  if (!/^\/(세션|session)\s*$/i.test(String(message).trim())) return true;
  safeOpen();
  return false;
});

for (const h of ["canvasReady", "createDrawing", "deleteDrawing", "updateDrawing", "updateScene"]) Hooks.on(h, () => refreshSessionHelper());

import { MagicalogiaActorSheetV3 } from "./actor-sheet-v3.js";

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
});

// 새로 만들어진 판정 카드만 "스티커 붙는" 연출을 재생한다.
// Dice So Nice 가 메시지를 숨겨 두는 동안에는 재생하지 않고, 화면에 보이는 순간 시작한다.
Hooks.on("renderChatMessage", (message, html) => {
  if (!message.getFlag("magicalogia", "v3Roll")) return;
  if (Date.now() - (message.timestamp ?? 0) > 20000) return; // 오래된 메시지는 연출 없음
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const card = html[0]?.querySelector?.(".mglg-card") ?? html.find?.(".mglg-card")?.[0];
  if (!card || card.dataset.mglgPlayed) return;
  card.dataset.mglgPlayed = "1";
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    card.classList.add("mglg-pop");
  });
  io.observe(card);
});

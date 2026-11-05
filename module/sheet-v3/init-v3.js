import { MagicalogiaActorSheetV3 } from "./actor-sheet-v3.js";

// 기존 시트(makeDefault: true)는 그대로 두고, 새 시트는 시트 설정에서 고를 수 있게만 등록한다.
Hooks.once("init", () => {
  Actors.registerSheet("magicalogia", MagicalogiaActorSheetV3, {
    types: ["character"],
    makeDefault: false,
    label: "마기카로기아 시트 v3 (새 디자인)"
  });
});

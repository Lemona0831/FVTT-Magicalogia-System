/**
 * 세션 상태 띠: 화면 가장자리에 한 줄짜리 작은 띠로 "메인 · 2사이클 · 전투 · 법칙 1" 만 보여준다.
 * 클릭하면 세션 도우미 창이 열린다. 끌어서 옮길 수 있고, ✕ 로 숨길 수 있다.
 * 위치/숨김 여부는 각자 브라우저(localStorage)에만 저장한다. 월드 데이터는 건드리지 않는다.
 */
import { getSessionState, PHASES, SCENE_TYPES, openSessionHelper } from "./session-helper.js";

const KEY = "magicalogia.sessionStrip";
let el = null;

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch (e) { return {}; } };
const save = (patch) => { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch })); } catch (e) { /* 저장 불가 */ } };

function text() {
  const st = getSessionState();
  const ph = PHASES.find((p) => p.id === st.phase) ?? PHASES[0];
  const sc = SCENE_TYPES.find((s) => s.id === st.sceneType) ?? SCENE_TYPES[0];
  const parts = [ph.main ? `${ph.label} ${Math.max(1, Number(st.cycle) || 1)}사이클` : ph.label, sc.label.replace(" 장면", "")];
  if (st.laws.length) parts.push(`법칙 ${st.laws.length}`);
  return parts.join(" · ");
}

export function refreshStrip() {
  if (!el) return;
  el.querySelector(".mglg-strip-text").textContent = text();
  el.hidden = !!load().hidden;
}

export function toggleStrip(show) {
  const hidden = show === undefined ? !load().hidden : !show;
  save({ hidden });
  refreshStrip();
}

export function initStrip() {
  if (el) return;
  el = document.createElement("div");
  el.id = "mglg-session-strip";
  el.innerHTML = `<span class="mglg-strip-text"></span><button type="button" class="mglg-strip-x" title="숨기기 (도구 막대의 세션 도우미 버튼이나 Alt+Shift+S 로 다시 표시)">✕</button>`;
  document.body.appendChild(el);
  const pos = load();
  if (pos.x != null) { el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`; el.style.right = "auto"; }

  let drag = null;
  el.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest(".mglg-strip-x")) return;
    const r = el.getBoundingClientRect();
    drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, x0: ev.clientX, y0: ev.clientY, moved: false };
    el.setPointerCapture(ev.pointerId);
  });
  el.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    if (Math.abs(ev.clientX - drag.x0) + Math.abs(ev.clientY - drag.y0) > 4) drag.moved = true;
    if (!drag.moved) return;
    const x = Math.min(Math.max(0, ev.clientX - drag.dx), window.innerWidth - el.offsetWidth);
    const y = Math.min(Math.max(0, ev.clientY - drag.dy), window.innerHeight - el.offsetHeight);
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, right: "auto" });
  });
  el.addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved) { const r = el.getBoundingClientRect(); save({ x: Math.round(r.left), y: Math.round(r.top) }); }
    else openSessionHelper();
  });
  el.querySelector(".mglg-strip-x").addEventListener("click", () => toggleStrip(false));
  refreshStrip();
}

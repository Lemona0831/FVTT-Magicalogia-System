/**
 * 캐시 갱신. 브라우저가 옛 JS/템플릿을 캐시해 두면 플레이어가 강력 새로고침을 해야 했다.
 * 접속 후(ready) 모든 v3 파일을 서버에 '재검증'해 브라우저 캐시를 최신으로 맞추고,
 * 지난번과 내용이 달라졌으면 "F5 한 번" 안내를 띄운다. (이미 실행된 옛 코드는 새로고침해야 바뀌므로)
 * import 그래프를 따라가므로 새 파일을 추가해도 자동으로 포함된다.
 */
const BASE = new URL("./", import.meta.url);
const TEMPLATES = ["session-helper.html"];
const KEY = "magicalogia.v3Stamp";

async function hashOf(text) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function walk(url, seen, out) {
  if (seen.has(url.href)) return; seen.add(url.href);
  let text = "";
  try {
    const r = await fetch(url, { cache: "reload" });
    if (!r.ok) return;
    text = await r.text();
  } catch (e) { return; }
  out.push([url.pathname, text]);
  if (!url.pathname.endsWith(".js")) return;
  const re = /(?:from|import)\s*\(?\s*["'](\.[^"']+\.js)["']/g;
  let m; const next = [];
  while ((m = re.exec(text))) next.push(new URL(m[1], url));
  await Promise.all(next.map((u) => walk(u, seen, out)));
}

export async function freshen() {
  try {
    const out = [], seen = new Set();
    await Promise.all([
      walk(new URL("./init-v3.js", BASE), seen, out),
      ...TEMPLATES.map((t) => walk(new URL(`../../templates/sheet-v3/${t}`, BASE), seen, out))
    ]);
    out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const stamp = await hashOf(out.map(([p, t]) => p + "\n" + t).join("\n"));
    let prev = null;
    try { prev = localStorage.getItem(KEY); } catch (e) { /* 무시 */ }
    // 지난 접속과 파일이 달라졌다 = 이번에 불러온 코드가 옛 캐시본일 수 있음 → 새로고침 안내 (새로고침 뒤엔 같아서 안 뜬다)
    if (prev && prev !== stamp) {
      ui.notifications.warn("마기카로기아 시스템이 갱신되었습니다. F5(새로고침) 한 번 눌러 주세요.", { permanent: true });
    }
    try { localStorage.setItem(KEY, stamp); } catch (e) { /* 무시 */ }
  } catch (e) { console.warn("magicalogia | 캐시 갱신 실패 (무시)", e); }
}

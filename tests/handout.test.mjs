import assert from "node:assert/strict";
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
const F = (id, name, parent = null, sort = 0) => ({ id, name, type: "JournalEntry", folder: parent, sort });
const top = F("s1", "시나리오 A"), ho = F("h1", "HO", top), en = F("e1", "enemy", top), top2 = F("s2", "시나리오 B"), ho2 = F("h2", "ho", top2), other = F("o1", "메모");
const J = (id, folder, flags = {}, obs = false) => ({ id, name: id, folder, sort: 0, getFlag: (_, k) => flags[k], testUserPermission: () => obs });
const journals = [J("a", ho, { handout: { secretId: null }, handoutAt: 1 }, true), J("a-sec", ho, { handoutSecret: "a" }, true), J("m", ho, {}, true), J("n", ho, {}, false),
  J("x", en, {}, true), J("y", ho2, {}, true), J("z", other, {}, true), J("legacy", null, { handout: { secretId: null } }, true)];
let scenario = "";
globalThis.game = { user: { isGM: false }, folders: [top, ho, en, top2, ho2, other], journal: journals, settings: { get: () => ({ scenario }) } };
const H = await import("../module/sheet-v3/handout.js");
assert.deepEqual(H.scenarios().map((f) => f.id).sort(), ["s1", "s2"]);          // 폴더 이름 HO/ENEMY(대소문자 무관)를 가진 최상위만
assert.equal(H.kindOf(journals[1]), null);                                       // 비밀 저널은 목록 제외
assert.equal(H.kindOf(journals[2]), "ho");                                       // 표시 없이 HO 폴더에 둔 저널
assert.equal(H.kindOf(journals[4]), "enemy");
assert.equal(H.kindOf(journals[6]), null);                                       // 무관한 폴더
assert.equal(H.scenarioOf(journals[0]), "s1");
assert.equal(H.scenarioOf(journals[7]), "");
let ids = (k) => H.visibleItems(k).map((j) => j.id).sort();
assert.deepEqual(ids("ho"), ["a", "legacy", "m", "y"]);                          // 시나리오 미지정: 보이는 것 전부 (n 은 열람 권한 없음)
scenario = "s1";
assert.deepEqual(ids("ho"), ["a", "m"]);                                         // 시나리오 A 것만
assert.deepEqual(ids("enemy"), ["x"]);
game.user.isGM = true;
assert.deepEqual(ids("ho"), ["a", "m", "n"]);                                    // GM 은 권한과 무관하게 시나리오 안의 전부
console.log("handout ok");

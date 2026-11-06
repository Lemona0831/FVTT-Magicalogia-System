import assert from "node:assert/strict";
import { calcMerit, missionPoints } from "../module/sheet-v3/settle.js";
assert.equal(calcMerit({ victory: true, survival: true, creed: true, roleplay: true, heartstring: 1, mission: "full" }), 8);
assert.equal(calcMerit({ survival: true, mission: "cost", heartstring: 2 }), 5);
assert.equal(missionPoints({ mission: "anchor", anchorFate: "4" }), 4);
assert.equal(calcMerit({ survival: true, duty: -1, scar: true, giveup: true, book: true, other: 2 }), 5);
assert.equal(calcMerit({}), 0);
assert.equal(calcMerit({ survival: true, nameless: 2, devil: true }), 2);
console.log("settle ok");

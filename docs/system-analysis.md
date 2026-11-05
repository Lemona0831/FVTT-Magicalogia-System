# 마기카로기아 시스템 v0.1.7 분석 (캐릭터 시트 v3 이식 1단계)

- 대상: `ksx0330/FVTT-Magicalogia-System` **v0.1.7 태그** (포크: `Lemona0831/FVTT-Magicalogia-System`, 작업 브랜치 `sheet-v3`)
- 목적: 새 디자인(SheetV3)을 입히기 전에 현재 시스템의 데이터·코드·판정 로직을 파악하고, 대응표와 구현 계획을 세운다.
- 이 단계에서는 **코드를 바꾸지 않았다.** 이 문서만 추가했다.
- 근거 표기: **[사실]** = 코드·파일에서 직접 확인함. **[추정]** = 코드를 읽고 추론했지만 실행으로 확인하지 못함. **[미확인]** = 확인 수단이 없었음.
- 경로 표기: 저장소 루트 기준. `파일:줄` 줄 번호는 v0.1.7 기준이다.

## 0. 먼저 알아둘 것

### 0-1. 입력 자료

| 자료 | 위치 | 비고 |
| --- | --- | --- |
| 디자인 명세 | `C:\Users\ardwi\Downloads\MGLG-Sheet-v3\sheet-design-spec.md` | 요청서에는 시안과 같은 경로로 적혀 있었지만, 폴더에 별도 명세가 있어 둘 다 읽었다. |
| 시안 원본 | 같은 폴더 `SheetV3.dc.html` | 4개 테마의 값은 `TH` 객체, 특기 표 데이터·목표치 계산은 `renderVals()`에 있다. |
| 테마 시안 이미지 | 같은 폴더 `v3 · ….png` 4장 | 이 단계에서는 열어 보지 않았다 (명세·코드로 충분). |
| 로컬 설치본 | `…\FoundryVTT\Data\systems\magicalogia` | **[사실]** v0.1.7 태그와 비교해 줄바꿈(CRLF)만 다르고 내용은 같다. 코드 분석은 태그 기준으로 했다. |

### 0-2. 태그 이후 변경

**[사실]** 저장소에는 `v0.2.1` 태그가 있다. v0.1.7 이후 커밋은 "Port Magicalogia to Foundry V14", `module/migrate.js`·`module/compat.js` 추가, 언어 팩(en, zh-CN, zh-TW) 추가 등 **Foundry v14 이식**이다 (`git log v0.1.7..v0.2.1`). 이번 프로젝트는 v12 + v0.1.7 기준이므로 쓰지 않았다. 나중에 업스트림을 합치면 `actor-sheet.js`, `actor.js`, `init.js`에서 충돌이 날 수 있다. 그래서 새 시트는 **새 파일 중심**으로 만들고 기존 파일은 거의 건드리지 않는 방향을 권한다 (§6).

### 0-3. 월드 데이터 확인 결과

월드 `mglg`의 액터 DB(LevelDB)를 읽기 전용으로 복사해서 문자열을 훑었다.

- **[사실]** 모든 특기 칸이 `"state":false`, `"num":12` 상태였고, `curiosity` 0 아닌 액터도 없었다. 즉 **특기를 하나라도 습득한 액터가 아직 없다.**
- 그래서 목표치 재계산 코드(§4-2)가 실제로 도는지 **월드 데이터로는 확인하지 못했다.**

## 1. 캐릭터 액터 데이터 구조

출처: `template.json` (`Actor.types = ["character"]`), `system.json`(`templateVersion: 3`). 데이터 모델 클래스(`TypeDataModel`)는 쓰지 않고 **template.json 방식**이다. [사실]

### 1-1. 필드 전체 목록 (`system.*`)

| 경로 | 타입·기본값 | 용도 | 비고 |
| --- | --- | --- | --- |
| `mana.value / min / max` | 숫자 0 / 0 / 0 | 마력 현재·최소·최대 | 시트에서 `max`를 직접 입력 |
| `tmp_mana.value / min` | 숫자 0 / 0 | 일시적 마력 | 게이지 상한이 템플릿에 10으로 박혀 있음 (`character-sheet.html:61`) |
| `talent.table[6][11]` | 객체 배열. 칸마다 `{misfortune:false, state:false, num:12}` | 특기표. **첫 인덱스 = 영역 0~5 (별·짐승·힘·노래·꿈·어둠), 둘째 인덱스 = 행 0~10 (주사위 합 2~12)** | `state` = 습득, `misfortune` = 불운 표시(우클릭), `num` = 저장된 목표치 |
| `talent.table[i][j].debuf` | (저장 안 함) | 해당 영역에 불운 칸이 하나라도 있으면 true | `prepareData`에서 계산해 메모리에만 붙임 (`actor.js:15-18`) |
| `talent.gap` | `{"0".."5": false}` | 칠한 갭. 키 n = **n번 영역 열의 왼쪽 갭** | 6개 모두 불리언 |
| `talent.curiosity` | 숫자 0 | 자기 영역 (0 = 없음, **1~6 = 별~어둠**) | 값을 바꾸면 갭 2칸이 자동으로 칠해지도록 되어 있음 (§4-2) |
| `talent.spirit_talent.name / misfortune` | "" / false | 혼의 특기 이름·불운 | 목표치는 템플릿에서 6, 불운이면 12로 고정 (`character-sheet.html:86`) |
| `talent.subTitle.id / title / state` | "" / "" / false | Shift+클릭 "연결 판정" 임시 저장 | §4-3 |
| `talent.overflowX` | **template.json에 없음** (undefined = false) | 별↔어둠을 이어서 계산 | 시트 체크박스로만 생김 (`character-sheet.html:285`) |
| `true_look.check / img / name / effect / biography` | false / 기본 이미지 / "" / "" / "" | 진정한 모습 (발동 여부, 토큰 이미지·이름, 효과, 설명 HTML) | 발동하면 토큰 이름·이미지가 바뀜 (§4-6) |
| `duty` | 문자열 "" | 의무 (긴 입력) | |
| `status.seal / burn / weakness / sickness / block / misfortune / death / extinction` | 불리언 8개 | 상태 8종 = 봉인·타짐·허약·병마·차단·불운·사망·소멸 | 판정 계산에는 쓰이지 않음 (표시 전용) [사실: 코드 전체에서 `status`는 `_changeStatus`에서만 참조] |
| `details.magic_name` | "" | 마법명 | |
| `details.age / sex` | "" / "" | 나이 / 성별 (문자열) | |
| `details.grade` | "" | 계제 (**문자열**) | 숫자 아님 |
| `details.attack / defence / root_force` | 숫자 3 / 3 / 3 | 공격력·방어력·근원력 | 공격력·방어력은 플롯 주사위 개수로 쓰임 (§4-7) |
| `details.career / agency / identify` | "" | 경력 / 기관 / 사회적 신분 | 모두 자유 입력 문자열 |
| `details.exp / exp_abstruct` | "" / "" | 공적점 / 마화 | **숫자가 아니라 문자열** |
| `details.biography` | "" | 메모 (HTML) | |

액터 기본 필드: `actor.name` = **임시 이름** (`character-sheet.html:15`에서 `TmpName` 라벨), `actor.img` = 초상. [사실]

### 1-2. 데이터 구조상 주의점

1. **[사실]** `num`은 템플릿 기본이 숫자 `12`인데, 계산 함수는 문자열 `"5"`/`"12"`를 저장한다 (`actor.js:74,76,108`). 읽을 때 `Number()`로 바꿔야 한다.
2. **[사실]** `overflowX`, 칠한 갭 `gap`의 키는 문자열 `"0"`~`"5"`다.
3. **[사실]** 영역 이름·행 이름은 데이터에 없고 언어 키 `MAGICALOGIA.{A..F}{1..12}`로 결정된다 (`A`=별 … `F`=어둠, 숫자 1 = 영역 제목, 2~12 = 행). 월드 설정 `magicalogia.MAGICALOGIA.{A..F}{1..12}`가 비어 있지 않으면 그 값이 우선한다 (`settings.js:23-31`, 헬퍼 `localTalent` `settings.js:63-66`). 한국어 파일의 영역 제목에는 번호가 붙어 있다 (`"MAGICALOGIA.A1": "1. 별"`). **디자인의 "별"과 맞추려면 번호 접두사를 떼야 한다.**
4. **[사실]** `lang/ko.json`의 `A11`이 "전공"인데 시안은 "천공"이다. 오타 가능성이 있다 (시안 표와 비교한 결과).

## 2. 아이템 종류와 필드

출처: `template.json` `Item.types = ["bond","ability","item","handout"]`.

| 타입 | 한국어 UI 이름 | 필드 | 요약 |
| --- | --- | --- | --- |
| `ability` | **장서** (`MAGICALOGIA.Ability`) | `check`(봉인 체크), `type`, `class`(분류), `mana_mark`(마소 마크), `talent`(지정 특기), `target`, `cost`, `word`(주구 텍스트), `charge`(충전 수), `word_check`(주구 사용됨), `description` | 소환·주문·장비를 한 타입으로 처리 |
| `bond` | **관계/인물** (`Bonds`, `BondsList`="인물 목록") = **앵커** | `check`(운명의 힘 사용됨), `destiny`("1" 문자열), `attribute`, `description`, `actor`(연결 액터 id) | 액터를 시트에 드롭하면 `bond`가 자동 생성됨 (`actor-sheet.js:231-251`) |
| `item` | **아이템** | `description`, `requirement`(사용 자격), `require_exp`(필요 공적점), `quantity`, `format`(소유 형식) | 일반 아이템 (사용자 확인). 처음엔 프라이즈로 추정했으나 철회. 프라이즈는 `bond`로 처리하기로 결정 (§9-0). |
| `handout` | **핸드아웃** (`Handout`) → '비밀' 탭 | `visible`, `sVisible`(사용자 id → 불리언 맵), `description`, `secret` | GM이 사용자별 공개 여부를 정함 (§3-2) |

### 2-1. 세부 사항

- **장서 `type`은 번역된 문자열을 그대로 저장한다.** [사실] `ability-sheet.html:48-52`의 `<option value="{{localize 'MAGICALOGIA.Summon'}}">`. 한국어로 만든 장서는 `"소환"`, `"주문"`, `"장비"`, 일본어면 일본어 문자열이 들어 있다. 시안의 타입 태그(소환·주문·장비)를 만들려면 값 → 키 변환이 필요하다 (§3의 변환 필요 항목).
- **장서 `talent`는 특기 이름 문자열**이고 칸 참조가 아니다. [사실] 선택 다이얼로그가 선택한 칸 텍스트의 `/` 앞부분을 저장한다 (`talent-select-dialog.js` `confirm` 콜백). "가변" 버튼은 `"가변"`을 저장한다. 영역 제목 칸을 고르면 `"1. 별 가변"`처럼 저장된다. **시안의 `없음`처럼 어디에도 없는 문자열은 판정 시 아무 일도 일어나지 않는다** (`init.js:121-131`에서 일치하는 칸을 못 찾으면 반환 없이 종료).
- **장서 `charge`에는 상한이 없다.** [사실] `_changeItemCharge`는 0 미만만 막는다 (`actor-sheet.js:381`). 시안의 "충전 5칸"은 새 규칙(상한 5)이다.
- **장서 `check`는 "봉인" 체크로 표시되고(`ability-sheet.html`), 시트에서는 쓰는 버튼이 없다.** `bond.check`가 "운명의 힘 사용됨"이다 (`_useItemPower`, `actor-sheet.js:420-443`). [사실]
- **`bond.destiny`는 문자열 "1"이 기본.** 운명 5칸 표시는 `Number()` 변환이 필요하다. 운명 감소·증가 버튼은 없고 입력칸만 있다. [사실]
- **`bond.actor`가 있으면** 아이템 시트에 "액터 열기" 버튼이 나온다 (`bond-sheet.html`, `item-sheet.js:_onShowActor`). 이 값이 있는지로 "앵커(실제 PC/NPC) vs 직접 입력"을 구분할 수 있다. [사실]
- 아이템 생성 기본 아이콘은 `icons/svg/{book|mystery-man|item-bag|card-hand}.svg` (`character-sheet.html`의 `data-img`). [사실]
- 패키지 팩(`system.json packs`)은 **비어 있다.** 그래서 시안의 "마법 목록에서 고르거나"에 해당하는 **마법 목록 데이터가 시스템에 없다.** [사실] (월드의 컴펜디움이나 RollTable을 쓰려면 별도 설계 필요)

## 3. 현재 시트 구성

시트 클래스: `module/sheet/actor-sheet.js` `MagicalogiaActorSheet` (`init.js:31`에서 `makeDefault: true`로 등록). 템플릿: `templates/actor/character-sheet.html` 한 파일 (`actor-sheet.js:21-24`가 `${actor.type}-sheet.html`로 결정). 기본 옵션은 폭 800×높이 780, CSS 클래스 `magicalogia sheet actor`, 탭 그룹 `.sheet-tabs`/`.sheet-body`, 첫 탭 `skill` (`actor-sheet.js:8-16`).

### 3-1. 상단 고정 영역 (탭 밖) — `character-sheet.html:6-145`

| 영역 | 내용 | 데이터 |
| --- | --- | --- |
| 이름 칸 (`cell--name`) | 초상(클릭해 변경, `data-edit="img"`), 임시 이름, 마법명 | `actor.img`, `actor.name`, `details.magic_name` |
| 전투 칸 (`cell--battle`) | 중앙 원형 버튼 `.circle`(클릭 시 플롯 공격), 공격력·방어력·근원력 입력, 마력 게이지(− + 버튼, 현재/최대 입력), 일시적 마력 게이지 | `details.attack/defence/root_force`, `mana.*`, `tmp_mana.value` |
| 상태 칸 (`cell--state`) | 진정한 모습 버튼, 혼의 특기 입력(클릭=판정, 우클릭=불운), 영역(curiosity) 선택, 상태 8종 토글 | `true_look.check`, `talent.spirit_talent`, `talent.curiosity`, `status.*` |

### 3-2. 탭 6개 — `character-sheet.html:148-155` (탭 이름은 `ko.json` 기준)

| 탭 (`data-tab`) | 이름 | 템플릿 위치 | 보여주는 데이터 |
| --- | --- | --- | --- |
| `skill` | 특기 | `:161-295` | 특기표 11행×6영역, 갭 체크박스 6개, 각 칸의 습득 체크박스, `별↔어둠(overflowX)` 체크박스 |
| `description` | 개요 | `:298-363` | 성별, 나이, 계제, 경력, 기관, 사회적 신분, 공적점, 마화, 의무, 진정한 모습(이미지·이름·효과·설명 에디터), 메모(에디터) |
| `ability` | 장서 | `:367-415` | 장서 목록. 이름·타입·지정특기·목표·코스트, 충전 −/+, 주구 사용 버튼, 펼치기, 편집·삭제 |
| `bonds` | 관계 | `:419-458` | 관계 목록. 이름·운명·속성, 운명의 힘 사용 버튼, 편집·삭제 |
| `items` | 아이템 | `:462-493` | 아이템 목록. 이름, 펼치기(설명), 편집·삭제 (수량 등은 목록에 안 보임) |
| `secret` | **비밀** | `:497-538` | 핸드아웃 목록 |

### 3-3. '비밀' 탭의 용도와 사용법 [사실, 코드·템플릿 기준]

- **정체: 핸드아웃(`handout` 아이템) 목록이다.** 탭 제목은 "핸드아웃"이고 `+` 버튼으로 `handout` 아이템을 만든다 (`character-sheet.html:499-505`, `actor-sheet.js:259-275`). 새로 만들 때 만든 사용자에게 `visible[userId] = true`가 자동으로 설정된다 (`actor-sheet.js:271-272`).
- **보이는 사람 제어:**
  - 목록에 그 핸드아웃이 보이는지는 `visible[사용자id]` 또는 GM 여부 (`{{#ifOR ../isGM (checkVisible item.system.visible ../userId)}}`, `:510`).
  - 펼쳤을 때 `description`(공개 설명)은 항상, **`secret`(비밀 본문)은 GM이거나 `sVisible[사용자id]`가 참일 때만** 보인다 (`:527-530`).
  - 핸드아웃 아이템 시트에서 GM만 "공개", "공개(비밀)" 탭으로 사용자별 체크박스를 편집한다 (`handout-sheet.html` `visible`, `visible2` 탭, GM이 아닌 사용자 목록만).
- **시트 밖 사용:** 핸드아웃 아이템을 캔버스에 드롭하면 그 이미지·이름의 토큰이 만들어지고 `flags.magicalogia.uuid`에 아이템 UUID가 저장된다 (`init.js:52-66`). 토큰을 열면 액터가 없을 때 이 UUID의 아이템 시트가 열린다 (`token.js`).
- **쓰임새:** 마기카로기아의 핸드아웃(PC마다 GM이 주는 비밀 정보)을 담는 용도로 보인다 [추정]. 내용은 자유 서식이다.
- **디자인 명세 §2의 판단:** "핸드아웃 비밀이면 설정 탭 안 '비밀' 칸으로 옮긴다"에 따르면, **용도는 핸드아웃 비밀이 맞다.** 다만 이것은 액터 필드가 아니라 **아이템(`handout`) 목록**이라서, 설정 탭에 "비밀 칸"을 두면 아이템 목록 + 가시성 필터를 그대로 재현해야 한다. 가시성 규칙을 빼먹으면 **다른 플레이어의 비밀이 노출될 수 있으니** 반드시 위 규칙(`visible`, `sVisible`, GM)을 같이 옮겨야 한다.

### 3-4. 시트 데이터 준비 (`getData`, `actor-sheet.js:29-95`)

- `data.system.tables`: 2~12행 × 6영역 배열로 가공, 칸 id는 `col-{영역}-{행-2}`, 이름은 `system.talent.table.{영역}.{행-2}` (`:64-71`).
- 아이템을 타입별로 `actorData.abilityList / bondList / itemList / handoutList`에 분류 (`:73-87`).
- `enrichedBiography`, `enrichedTrueLook` 계산 (`:89-90`).
- **[사실] 주의:** `data.system = this.actor.system`으로 라이브 객체를 그대로 쓰고 거기에 `tables`, `isOwner`를 덮어쓴다 (`:46-47, 64`). 새 시트는 복사본을 써서 라이브 데이터를 건드리지 않아야 한다.
- `console.log(this)`가 렌더마다 찍힌다 (`:92`). 디버그 잔재.

### 3-5. 시트 이벤트 (`activateListeners`, `actor-sheet.js:100-149`)

`.talent-name` mousedown(좌=판정, 우=불운 토글), `.item-create/.item-edit/.item-delete`, `.circle`(공격 플롯), `.status-btn`, `.truelook-change`, `.mana-change`, `.charge-change`, `.use-word`, `.use-power`, `.echo-item`(채팅에 설명 출력), `.item-label`(펼치기). 읽기 전용 사용자는 `if (!this.options.editable) return;` 이후 핸들러를 못 쓴다.

### 3-6. 스타일

`styles/style.css` 751줄. 거의 모든 규칙이 `.magicalogia …`로 시작한다. **[사실]** 새 시트에 `magicalogia` 클래스를 붙이면 기존 규칙(`.magicalogia .sheet-body`, `.talent-table …` 등)이 번질 수 있다. 새 시트 루트는 `mglg-sheet`만 쓰고 `magicalogia` 클래스는 붙이지 않는 것을 권한다 (명세 §6의 "`.mglg-sheet.theme-*` 범위에만 적용"과 일치).

## 4. 판정·목표치·주사위·원형 처리

### 4-1. 판정 진입 경로

| 경로 | 위치 | 동작 |
| --- | --- | --- |
| 특기표 칸 클릭 | `actor-sheet.js:117` `.talent-name` mousedown → `_onRouteTalent` (`:164-169`) | 좌클릭 → `_onRollTalent`, 우클릭 → `_setMisfortuneTalent` |
| 혼의 특기 클릭 | 같은 핸들러 (`data-id="spirit"`) | 목표치는 템플릿의 `data-num`(6, 불운이면 12) |
| 채팅 카드의 "지정 특기" 버튼 | `init.js:73-133` `.roll-talent` | 장서 설명을 채팅에 올린 뒤 그 버튼을 누르면 이름으로 칸을 찾아 판정 |

수식어 키 (`_onRollTalent`, `actor-sheet.js:191-226`): **Ctrl** = 보정값 입력 다이얼로그 (월드 설정 아닌 **클라이언트 설정** `rollAddon`이 켜져 있으면 항상), **Alt** = 비밀 굴림(귓말 GM), **Shift** = 연결 판정(§4-3).

### 4-2. 목표치 계산 — `module/document/actor.js`

> **[사실] 알고리즘 요약**: 습득(`state`)했고 불운(`misfortune`)이 아닌 칸은 목표치 5의 시작점이다. 나머지는 12에서 시작해, 시작점에서 상하좌우로 퍼지며 더 작은 값을 얻을 때만 갱신한다.

| 이동 | 비용 | 코드 |
| --- | --- | --- |
| 같은 열 위·아래 | +1 | `move = [1, 1, 2, 2]`, `dy` 방향 (`actor.js:79-81`) |
| 옆 영역 | +2, **단 건너는 갭이 칠해져 있으면 +1** | `if (m == 2 && g) m = 1;` (`:103-105`) |
| 갭 위치 | 오른쪽으로 갈 땐 도착 열 번호, 왼쪽으로 갈 땐 출발 열 번호 = "큰 쪽 열의 왼쪽 갭" | `gap[(nx > now.x) ? nx : now.x]` (`:103`) |
| 별↔어둠 | `overflowX`가 켜졌을 때만 이어짐, 비용은 `gap[0]` 기준 | `:97-98, 103` |
| 상한 | 값이 12 이상이면 12 유지 (더 작을 때만 갱신) | `if (Number(...) > ...)` (`:107`) |

**디자인 명세와의 차이 (결정 필요):**

1. **칠한 갭 반영:** 계산 코드는 갭을 **반영한다** (위 표). 명세의 "칠한 갭이면 1"과 같은 규칙이다. 다만 아래 3번을 보라.
2. **별↔어둠:** 명세는 "이어지지 않는다"인데 시스템에는 `overflowX` 옵션이 있다. 새 시트는 **옵션이 켜져 있으면 그 값을 따라야** 기존 캐릭터와 결과가 같다.
3. **[추정, 중요] 재계산이 실제로 도는지 의심스럽다.** 재계산 진입 조건이 `if ('data' in data && 'talent' in data.system)` (`actor.js:24`)다. Foundry v10 이후 업데이트 데이터는 `data.data`가 아니라 `data.system`이라서, `'data' in data`가 거짓이 되어 **블록 전체가 건너뛰어질 가능성이 높다.** 이 줄은 2022-12-31 "remake" 커밋부터 있다 (`git log -S"'data' in data"`). 이 경우:
   - 습득 체크·갭 체크·영역 선택을 바꿔도 `num`이 다시 계산되지 않아 저장된 값(기본 12)이 그대로 쓰인다.
   - 영역(`curiosity`) 선택 시 갭 2칸이 자동으로 칠해지는 동작도 같은 블록이라 함께 죽어 있을 수 있다.
   - 월드 데이터에 습득 특기가 없어서(§0-3) 실제 값으로는 확인하지 못했다. 사용자가 이 시트에서 목표치가 정상으로 나온다면 내가 읽은 것과 다른 경로가 있다는 뜻이니 알려 주면 된다.
   - **[확인 방법 — 사용자 실행]** 테스트용 액터에서 특기 칸 하나를 습득하고 인접 칸의 `/ 숫자`가 12에서 바뀌는지 본다.
   - **새 시트의 권장 설계:** 저장된 `num`에 의존하지 않고, 시트가 `state`·`misfortune`·`gap`·`overflowX`로 **직접 계산**한다 (§6 step 2). 저장 숫자가 없어도 올바른 값이 나온다. 단, 기존 시트의 `num`을 읽는 코드(채팅 버튼 `init.js:117,129`, 장서 선택 다이얼로그 `talent-select-dialog.js`)는 낡은 값을 쓸 수 있으므로 새 시트가 발행하는 판정은 이 경로를 쓰지 않는다.
4. **상한 12:** 명세의 "5 + 거리"는 상한이 없지만 시스템은 12에서 멈춘다. 12 이상은 실제로는 스페셜(주사위 합 12)로만 성공하므로 **표시는 12 상한으로 하는 것이 시스템과 같다.**
5. **불운 영역 감점:** 영역 안에 불운(`misfortune`) 칸이 하나라도 있으면 그 영역 칸을 굴릴 때 수식어 `-1`이 붙는다 (`prepareData` → `debuf` → `formula += "-1"`, `actor.js:155-158`). 명세에는 없다. 새 시트가 이 감점을 빼먹으면 규칙이 달라진다. **그대로 유지하는 것을 권한다.**
6. **혼의 특기:** 목표치 6 고정은 템플릿 하드코딩이다. 명세의 **"굴리기 전 마력 1 소비"는 현재 시스템에 없는 동작**이다 (새 로직 필요).

### 4-3. Shift+클릭 연결 판정 (`actor-sheet.js:209-223`)

1회째 Shift+클릭이 `talent.subTitle`에 칸 id·이름을 저장하고(`state:true`), 2회째 Shift+클릭이 그 이름을 접두어로 붙인 `"A->B"` 제목으로 굴린다. 같은 칸을 다시 누르면 취소. 명세에 해당 UI가 없다. 시안에 빠진 기능이므로 유지 여부를 정해야 한다 (§7).

### 4-4. 굴림과 채팅 카드 — `actor.js:119-181`

1. `rollTalent(title, num, add, secret, debuf)`: 보정 입력이 필요하면 `Dialog`에서 입력받고, 아니면 바로 `_onRollDice`.
2. 공식 `"2d6"` + 보정(`+n`/`n`) + 불운이면 `-1`. `new Roll(...)`, `roll.roll({async:true})`.
3. `d = roll.terms[0].total` = **주사위 두 개 합(보정 전)**. `special = (d == 12)`, `fumble = (d == 2)`. 성공 판정은 `ifSuccess total num` 즉 **보정 포함 합 ≥ 목표치** (`settings.js` 헬퍼, `roll.html`). 스페셜·펌블이 우선해서 표시된다.
4. 비밀 굴림(Alt)이면 `gmroll`, 아니면 코어 `rollMode`를 따른다. gmroll/blindroll은 GM에게 귓말, blindroll은 blind, selfroll은 본인만 (`:149-152`).
5. 채팅 내용은 `templates/roll.html`을 렌더 (식, 목표치, 툴팁, 합계, 스페셜/펌블/성공/실패). `flavor`는 `<h2><b>제목</b></h2>`.
6. Dice So Nice(`game.dice3d`)가 있으면 3D 주사위를 보여준 뒤 채팅 생성, 없으면 `CONFIG.sounds.dice` 소리와 함께 생성.
7. **[사실] 버그 의심 지점:** `speaker: ChatMessage.getSpeaker({ actor: this.actor })` (`:145`). 여기서 `this`가 이미 액터라 `this.actor`는 undefined다. 그러면 화자가 이 액터가 아니라 **현재 선택된 토큰 또는 사용자 기본 캐릭터**가 된다. 새 시트에서 판정을 직접 구현할 때는 `{actor: this.actor}`(시트의 액터)로 명확히 지정해야 한다.
8. `roll.html`에는 `??`로 보이는 문자가 있다 (원래 기호가 인코딩에서 깨진 것으로 추정 [추정]). 새 채팅 카드는 새 템플릿으로 만든다.

### 4-5. 더블릿 (`tooltip.html`, `settings.js:'doublet'` 헬퍼 `:78-94`)

`Roll.TOOLTIP_TEMPLATE`이 `templates/tooltip.html`로 교체되어 있고 (`init.js:24`), 이 템플릿 첫 줄 `{{{doublet parts}}}`가 두 주사위가 같은 눈이면 `"Doublet! - {영역 이름}"`을 출력한다. 눈 n → 영역 `A..F`의 n번째 (`1=별 … 6=어둠`). **[사실] 마소 2점을 자동으로 주지는 않는다.** 표시만 한다. 명세의 "더블릿(그 눈의 영역 마소 2점)"은 표시만으로 충분한지, 자동 지급이 필요한지 정해야 한다 (마소를 저장할 필드가 액터에 없다).

### 4-6. 그 밖의 수동 채팅 출력

모두 코드 안의 문자열 HTML이다.

| 동작 | 위치 | 내용 |
| --- | --- | --- |
| 마력/일시적 마력 증감 | `actor-sheet.js:345-371` | `이름 / 라벨: 전 -> 후` |
| 충전 증감 | `:373-393` | `장서이름 / 전 -> 후` |
| 주구 사용 | `:395-418` | 이미 사용했으면 Dialog로 거부, 아니면 `word_check = true`와 채팅 |
| 운명의 힘 사용 | `:420-443` | 이미 사용했으면 거부, 아니면 `check = true`와 채팅 |
| 진정한 모습 발동 | `:304-343` | 발동 시 채팅 카드(이름·효과·설명), 현재 씬의 이 액터 토큰 이름·이미지를 진정한 모습 값으로 교체, 해제 시 되돌림 |
| 장서/관계/아이템 설명 올리기 | `actor.js:183-255` `_echoItemDescription` | 표 형태 HTML, 장서에는 `.roll-talent` 버튼 포함 |
| 플롯 공개 | `plot.js` `checkPlot` | 표 형태 HTML |

### 4-7. 플롯(마법전) — 새 시트와의 접점

중앙 `.circle` 클릭 → 대상 토큰 지정 확인 → 씬 플래그 `flags.magicalogia.magicZone[두 액터 id 정렬키]`가 있어야 시작 (`actor-sheet.js:446-515`). 공격자 주사위 수 = `details.attack`, 방어자 = `details.defence`, 입회인은 1개씩. `Hooks.call("initPlot")`, `Hooks.call("spreadPlot")`로 시작. **새 시트에도 공격력·방어력 표시 근처에 플롯 시작 진입점이 필요한지 정해야 한다.** 시안에는 `.circle` 버튼이 없다 (§7).

## 5. Hooks, 소켓, 채팅 카드 템플릿

### 5-1. 시스템이 쓰는 Hooks

| Hook | 위치 | 용도 |
| --- | --- | --- |
| `init` (once) | `init.js:21-41` | 문서 클래스 교체(`CONFIG.Actor.documentClass`, `CONFIG.Token.objectClass`), 시트 등록, 툴팁 템플릿 교체, 이니셔티브 `1d6`, 설정·플롯 초기화 |
| `ready` (once) | `init.js:44-50` | `.plot-bar` 요소를 `body.vtt.game.system-magicalogia`에 추가 |
| `dropCanvasData` | `init.js:52-66` | 핸드아웃 드롭 → 토큰 생성 + 플래그 |
| `renderChatLog`, `renderChatPopout`, `updatePlotBar` | `init.js:68-70` | 채팅 로그에 클릭 핸들러(`.roll-talent`, `.plot-dialog`) 위임 |
| `getSceneControlButtons` | `init.js:148-275` | "마법전 개시/종료" 버튼 (GM 전용) |
| 커스텀: `initPlot`, `spreadPlot`, `setPlotBar`, `checkPlot`, `releasePlot` | `plot.js` | 플롯 진행. 소켓 `system.magicalogia`의 `req/resp/release` 메시지와 연동 |

`Actors.registerSheet("magicalogia", MagicalogiaActorSheet, {makeDefault:true})` 한 번 외에 시트 관련 훅은 없다. **[사실]** `Hooks.on("renderActorSheet")` 등은 쓰지 않으므로, 모듈(예: Monk's Active Tile Triggers, Advanced Macros)이 걸어 둔 시트 훅과의 충돌 지점은 이 시스템에는 없다. (모듈 쪽은 [미확인])

### 5-2. 채팅 카드 템플릿

| 파일 | 용도 |
| --- | --- |
| `templates/roll.html` | 특기 판정 카드. 변수: `formula, flavor, user, tooltip, total, special, fumble, num` |
| `templates/tooltip.html` | 코어 `Roll.TOOLTIP_TEMPLATE` 대체. 더블릿 표시 포함 |
| (코드 내 문자열) | §4-6의 나머지 카드들 |

### 5-3. 등록된 Handlebars 헬퍼 (`settings.js:36-97`)

`ifEquals`, `ifOR`, `ifOrEquals`, `checkVisible`, `ifSuccess`, `localTalent`, `manaGauge`, `doublet`. 새 템플릿에서 재사용 가능하다. 단 `checkVisible`은 블록이 아니라 **불리언 값을 반환**하는 헬퍼라 서브표현식 `(checkVisible …)`으로 쓸 때만 맞다 (템플릿에도 두 방식이 섞여 있음).

### 5-4. 설정

| 키 | 범위 | 용도 |
| --- | --- | --- |
| `rollAddon` | client | 판정 시 항상 보정 다이얼로그 |
| `MAGICALOGIA.{A..F}{1..12}` (72개) | world | 특기 이름 덮어쓰기 (메뉴 `talentTable`, GM 전용) |

### 5-5. 호환성 선언

`system.json`: `compatibility.minimum 11`, `verified 11.315`. 사용자는 이 시스템을 v12에서 쓰고 있지만 (세션 전달 정보), 지원 선언은 v11이다. 코드에는 v12에서 deprecation 경고가 날 만한 호출이 있다 (`mergeObject`, `duplicate`, `TextEditor.enrichHTML({async})`, `roll({async:true})`). 새 코드는 `foundry.utils.*`를 쓴다.

또한 `system.json`의 일본어 항목 `name`이 깨진 문자열 (`"?ζ쑍沃?"`)이다. [사실, 이번 작업 범위 밖]

## 6. 명세 → 시스템 필드 대응표

범례: **그대로** = 기존 필드를 읽고 쓰기만 함 / **변환** = 기존 값을 계산·정규화해서 표시 / **새 필드** = 기존에 없음.

### 6-1. 빠른 굴림 바

| 명세의 칸 | 시스템 필드·코드 | 판정 | 메모 |
| --- | --- | --- | --- |
| 각종 표 드롭다운 8종 | 없음. 월드의 `RollTable` 문서(`game.tables`) | **새 필드(설정)** | 월드 설정 `v3TableMap: {장면표: <RollTable UUID> …}` + 설정 UI 또는 이름 규칙. 룰북 내용은 넣지 않고 사용자 표만 연결. 표가 없는 항목은 "표 없음"으로 비활성 + 이유 표기 (명세 원칙 5) |
| 굴리기 + 마지막 결과 한 줄 | `RollTable#draw`, 마지막 결과는 클라이언트 메모리 | 새 로직 | 결과를 채팅 카드로 남길지 정한다 |
| 일반 주사위 (2D6 + 0) | 없음. `new Roll(formula)` | 새 로직 | 수식 입력 검증 필요 (`Roll.validate`) |

### 6-2. 히어로

| 명세의 칸 | 시스템 필드 | 판정 | 메모 |
| --- | --- | --- | --- |
| 초상 4:5 | `actor.img` | 그대로 | CSS `object-fit: cover; aspect-ratio: 4/5`. 클릭 시 `FilePicker` (`data-edit="img"`와 같은 효과) |
| 마법명 | `system.details.magic_name` | 그대로 | |
| 임시 이름 | `actor.name` | 그대로 | 기존 시트도 `actor.name`을 "임시 이름"으로 씀 |
| 사회적 신분 | `system.details.identify` | 그대로 | |
| 경력 · 기관 | `system.details.career`, `system.details.agency` | 그대로 | 자유 입력 문자열 |
| 영역 | `system.talent.curiosity` (1~6, 0=없음) | 변환 | 번호 → 영역 이름. 0이면 "미정". 이름은 언어 파일 접두사 "1. " 제거 |
| 계제 배지 숫자 | `system.details.grade` (문자열) | 변환 | 숫자 추출 `parseInt`. 숫자가 없으면 원문 표시 |
| 마력 현재/최대 | `system.mana.value`, `system.mana.max` | 그대로 | −/+ 는 기존 `_changeManaGauge` 방식(채팅 로그 출력) 유지 여부 결정 |
| 일시적 마력 | `system.tmp_mana.value` | 그대로 | |
| 마력 칸 게이지 | `mana.value`, `mana.max` | 변환 | 칸 수 = `max`. 최대가 크면(예: 12 초과) 줄바꿈·압축 처리 필요 |
| 공적점 · 마화 | `system.details.exp`, `system.details.exp_abstruct` | **변환** | 문자열이라 숫자 아닐 수 있음. 표시는 원문, 증감 버튼을 넣으면 숫자 변환 필요 → 입력칸만 두는 것을 권장 |
| 공격력·방어력·근원력 | `system.details.attack/defence/root_force` | 그대로 | 숫자 입력 |
| 상태 8종 | `system.status.{seal, burn, weakness, sickness, block, misfortune, death, extinction}` | **그대로** | 라벨 순서 = 명세와 같음. 색+굵기 병행. 판정에 영향 없음 |

### 6-3. 특기

| 명세의 칸 | 시스템 필드 | 판정 | 메모 |
| --- | --- | --- | --- |
| 표 11행(2~12) × 6영역 | `system.talent.table[영역][행-2]` | 그대로 | 이름은 `localTalent` 규칙 (월드 설정 우선) |
| 행 번호 열 | 없음 (2~12 상수) | 그대로 | |
| 영역 머리 + 문장 아이콘 | 영역 이름만 있음. 아이콘은 SVG path (시안 `SIG`) | 새 자원 | 아이콘은 시안의 SVG 경로를 그대로 복사 |
| 자기 영역 강조 | `system.talent.curiosity` | 그대로 | 값 1~6 → 열 0~5 |
| 갭 열 칠하기 | `system.talent.gap[0..5]` | 그대로 | 자동 칠하기는 curiosity 변경 시 `gap[c-1]`, `gap[c]` (§4-2) |
| 습득 특기 강조 | `table[i][j].state` | 그대로 | |
| 불운 특기 표시 | `table[i][j].misfortune` | 그대로 | **명세에 없음.** 시스템에는 우클릭 토글이 있으므로 UI를 정해야 함 (§7) |
| 칸 클릭 = 판정 | `_onRollTalent` 로직 | 변환 | 새 시트의 판정 함수 + 올바른 `speaker` (§4-4) |
| 목표치 | `table[i][j].num` | **변환(재계산)** | 저장값을 믿지 않고 시트에서 직접 계산 (§4-2 ③). 습득 칸은 5, 상한 12, `overflowX` 반영, 불운 영역 `-1` 감점 반영 |
| 목표치 미리보기 토글 | 없음 | 새 필드 (세션 상태) | 클라이언트 설정 또는 시트 내 상태. 데이터 아님 |
| 혼의 특기 이름 | `system.talent.spirit_talent.name` | 그대로 | |
| 혼의 특기 목표치 6 | 템플릿 하드코딩 6, 불운이면 12 | 그대로 | `spirit_talent.misfortune` |
| "굴리기 전 마력 1 소비" | 없음 | 해당 없음 (§9-0 결정) | 자동 소비하지 않음. 안내 문구만 표시 |
| 습득 체크박스 / 영역(curiosity) 선택 / `overflowX` 체크 | `state`, `curiosity`, `overflowX` | 그대로 | **시안에 편집 UI 없음.** 시안 상단의 "편집" 버튼에 묶는 것을 제안 (§7) |
| 연결 판정(Shift) | `talent.subTitle` | 그대로 | 시안에 없음, 유지 여부 결정 |

### 6-4. 장서 (아이템 `ability`)

| 명세의 칸 | 시스템 필드 | 판정 | 메모 |
| --- | --- | --- | --- |
| 타입 태그 (소환·주문·장비) | `system.type` (번역 문자열) | **변환** | 문자열 → 키: 현재 언어의 `Summon/Spell/Equipment`와 일치 비교, 일본어·영어 값도 허용. 인식 못 하면 원문 그대로 태그에 표시 |
| 이름 | `item.name` | 그대로 | 클릭 = 지정 특기 판정 |
| 분류 | `system.class` | 그대로 | |
| 지정 특기 | `system.talent` (이름 문자열) | **변환** | 이름으로 칸을 찾는 함수 필요 (`init.js:100-131` 로직을 새 함수로 복제). `가변`·`영역 가변`·`없음` 처리, 못 찾으면 "특기 없음" 표시 + 버튼 비활성 |
| 목표 | `system.target` | 그대로 | 문자열 |
| 코스트 | `system.cost` | 그대로 | 문자열 ("짐승 1" 같은 자유 입력). **"코스트가 맞는 장서에 마소 충전"의 코스트 일치 판정에 쓰려면 파싱이 필요** → 이번 범위는 표시만 |
| 충전 5칸 | `system.charge` | **변환** | 칸 수 상한 5는 새 규칙. 기존 데이터에 5 초과가 있어도 값은 보존하고 표시만 5칸 + 초과 숫자. −/+는 `_changeItemCharge` 동작 유지 |
| 개수 (예: 1/5) | `charge`, 상한 | 변환 | 상한 없는 장서는 "—" |
| 주구 체크 | `system.word_check` | 그대로 | 체크는 사용 표시. 시스템은 "주구 사용" 버튼에서 `word` 텍스트를 채팅에 올림 → 체크만 두면 텍스트 출력이 빠짐. **체크 클릭 = 기존 `_useItemWord` 호출**로 맞출 것 |
| 효과 메모 (펼치기) | `system.description` | 그대로 | HTML. 안전한 렌더링 (`TextEditor.enrichHTML`) |
| "+ 장서 추가" | `createEmbeddedDocuments('Item', …)` | 그대로 | "마법 목록에서 고르기"는 목록이 없어 불가 (§2-1). 우선 빈 장서 생성 |

### 6-5. 관계 (아이템 `bond` + `item`)

| 명세의 칸 | 시스템 필드 | 판정 | 메모 |
| --- | --- | --- | --- |
| 종류 태그 앵커 | `bond` 아이템 | 그대로 | `system.actor`가 있으면 액터 연결 앵커 |
| 종류 태그 아이템 | `item` 아이템 | 그대로 | 단, 시스템의 `item`은 프라이즈 성격 [추정]. 시안 "아이템"에 합쳐도 되는지 결정 필요 |
| 종류 태그 **단장·봉서** | **없음** | **새 필드** | `bond`에 종류 구분 필드가 없다. `flags.magicalogia.sheetV3.kind = "anchor"|"binder"|"seal"` (기본 = anchor) 제안 |
| 이름 | `item.name` | 그대로 | |
| 운명 5칸 | `bond.system.destiny` ("1" 문자열) | **변환** | `Number()`. 칸 수 상한 5. 클릭으로 증감하려면 `destiny` 문자열에 숫자를 다시 저장 |
| 아이템 개수 | `item.system.quantity` | 그대로 | 현재 UI 목록에 안 보이는 필드 |
| 속성 | `bond.system.attribute` | 그대로 | |
| 설정 메모 | `bond.system.description`(HTML) | 그대로 | 짧은 메모칸이면 HTML 에디터가 아니라 텍스트 일부 발췌 표시 |
| 소원 | 없음 | **새 필드** | `flags.magicalogia.sheetV3.wish` (문자열) |
| 타락치 | 없음 | **새 필드** | `flags.magicalogia.sheetV3.corruption` (숫자/문자열) |
| 단장 "부담" | 없음 | 새 필드 (내용 정의 필요) | 시안의 라벨일 뿐 규칙 정의가 없음 → `attribute` 재사용 안(필드 추가 없음) 우선 |
| 운명의 힘 사용 | `bond.system.check` + `_useItemPower` | 그대로 | 시안에 버튼 자리가 없음. 관계 한 칸에 작은 버튼 추가 제안 |
| 프라이즈 | `bond` 아이템 + `flags…kind = "prize"` | **확정(사용자 결정)** | 프라이즈는 `bond`로 처리하고 관계 목록에 종류 태그 "프라이즈"로 둔다. `item` 타입은 일반 아이템이며 프라이즈가 아니다 (§2의 "프라이즈 추정"은 철회). |

### 6-6. 설정 · 공적점 탭

| 명세의 칸 | 시스템 필드 | 판정 | 메모 |
| --- | --- | --- | --- |
| 경력 신조 | 없음 | **새 필드** | `flags.magicalogia.sheetV3.careerCreed` (문자열). 시안은 경력(사서)에서 문장을 가져온 듯하지만 룰 텍스트는 넣지 않는다 |
| 의무 | `system.duty` | 그대로 | 긴 입력 |
| 기관 조건·특기사항 | 없음 | **새 필드** | `flags…agencyNote` |
| 진정한 모습 (사용 여부·효과) | `true_look.check`, `true_look.effect` (+ `name`, `img`, `biography`) | 그대로 | 발동 버튼은 `_changeTrueLook` 동작(토큰 교체 포함) 유지. 시안에는 `name/img/biography` 칸이 없음 → 접어서 노출 |
| 임시 이름 | `actor.name` | 그대로 | |
| 성별·연령 | `details.sex`, `details.age` | 그대로 | 시안은 한 칸이지만 필드는 둘 |
| 사회적 신분·종족 | `details.identify` (+ 종족) | **일부 새 필드** | 종족: `flags…race` |
| 계제·작위 (황혼선서) | `details.grade` (+ 작위) | **일부 새 필드** | 작위: `flags…rank` |
| 종족 신조 (황혼선서) | 없음 | **새 필드** | `flags…raceCreed` |
| 마력 최대치 계산 (1D6 + 근원력) | `details.root_force`, `mana.max` | 변환 | 표시용 문구. "굴려서 마력 최대치에 넣기" 버튼을 넣을지 결정 |
| 공적점 획득 조건 9종 | 없음 | **새 필드** | `flags…merits = {duty, victory, survival, creed, roleplay, heartstring, mission, sacrifice, other: boolean}` |
| 메모 | `details.biography` (HTML) | 그대로 | 에디터 |
| 비밀 | `handout` 아이템 (§3-3) | 변환 | 설정 탭 안 "비밀" 칸. 가시성 규칙(`visible`, `sVisible`, GM) 반드시 유지 |
| 판정 기록 (2차) | 채팅 로그 | 후속 | 이번 범위 밖 |

### 6-7. 테마

| 명세 | 필드 | 판정 | 메모 |
| --- | --- | --- | --- |
| 사용자별 테마 선택 | 클라이언트 설정 `mglg.theme` | 새 설정 | `scope: "client"`. 기본값은 월드 설정 `mglg.defaultTheme` |
| GM이 기본값 지정 | 월드 설정 `mglg.defaultTheme` | 새 설정 | 클라이언트 설정은 월드 기본값을 직접 못 쓰므로 `"inherit"` 값을 두고 코드에서 월드값으로 대체 |
| 움직임 줄이기 | CSS `@media (prefers-reduced-motion)` | 새 CSS | |
| 글꼴 | 구글 폰트 `<link>` | 새 자원 | 오프라인 환경이면 로컬 파일 필요. 라이선스 확인 (명세 §6). 폰트 요청이 외부로 나가므로 **로컬 파일 번들 여부를 사용자에게 확인** |

## 7. 새 필드 추가 방법 제안 (기존 월드 데이터와 충돌 없이)

### 7-1. 원칙

1. **flags 우선.** 새 시트 전용 정보는 `flags.magicalogia.sheetV3.*`에 둔다. [사실] 현재 `flags.magicalogia`는 씬(`magicZone`)·토큰(`uuid`)에만 쓰이고 **액터·아이템에는 쓰이지 않으므로 충돌하지 않는다.**
2. flags의 장점: `template.json`을 안 바꾸니 **기존 데이터·기존 시트가 영향을 받지 않고**, 시트를 지우거나 기존 시트로 돌아가도 데이터가 남아 있다 (삭제도 안 한다).
3. flags의 단점: 규칙에 가까운 데이터(마소 등)를 나중에 다른 기능이 쓰려면 이동이 필요하다. 이번 새 필드들은 대부분 서술형 메모·체크라서 flags로 충분하다.
4. **일괄 마이그레이션은 하지 않는다.** 값이 없으면 시트가 기본값으로 읽고(`getFlag`가 undefined면 빈 값), 사용자가 편집하는 순간에만 쓴다. 따라서 월드 전체를 건드리는 변환이 없다.

### 7-2. 대안: `template.json`에 필드 추가

- 장점: 시트 입력칸의 `name="system.x"` 바인딩이 단순해지고 기본값이 보장된다.
- 이 저장소에는 이미 같은 방식으로 `tmp_mana`를 마지막 커밋에서 추가한 선례가 있다 (`79c0469 add tmp related features`).
- **[추정]** template.json 방식에서는 저장 데이터에 없는 필드가 로드 시 템플릿 기본값으로 채워진다. 이 동작을 구현 단계에서 콘솔로 확인해야 한다 (테스트 액터에서 `game.actors.getName(...).system.새필드`).
- 단점: 업스트림과 `template.json`이 갈라진다 (v0.2.1에서도 이 파일이 수정됨). 기존 월드가 필드 없이 저장된 채로 오래 간 액터의 동작은 [미확인].
- **결론: flags로 시작하고, 규칙에 영향이 생기는 필드(예: 자동 마소 지급)가 필요해지면 그때 template.json에 올린다.**

### 7-3. 새 필드 목록 (모두 `flags.magicalogia.sheetV3.*`)

| 대상 | 키 | 타입 | 기본값 |
| --- | --- | --- | --- |
| 액터 | `careerCreed`, `agencyNote`, `race`, `rank`, `raceCreed` | 문자열 | "" |
| 액터 | `merits.{duty, victory, survival, creed, roleplay, heartstring, mission, sacrifice, other}` | 불리언 | false |
| 아이템 `bond` | `kind` (`anchor`·`binder`·`seal`·`prize`) | 문자열 | `anchor` (없으면 앵커로 취급) |
| 아이템 `bond` | `wish`, `corruption` | 문자열 | "" |
| 아이템 `ability` | `maxCharge` (선택) | 숫자 | 5 |
| 설정 (client) | `mglg.theme`, `mglg.targetPreview` | 문자열 / 불리언 | `inherit` / false |
| 설정 (world) | `mglg.defaultTheme`, `mglg.tableMap` | 문자열 / 객체 | `rulebook` / `{}` |

### 7-4. 데이터 안전 규칙

- 새 시트는 **기존 필드에 쓸 때 타입을 보존한다** (예: `destiny`는 문자열, `exp`는 문자열을 유지. 숫자로 바꿔 저장하지 않는다. 바꾸면 기존 시트의 `data-dtype`/입력과 어긋날 수 있다).
- 형식이 이상한 값(예: `grade`가 "제3계제")은 표시만 정규화하고 **저장값은 원문 그대로 둔다.**
- 구현 전에 월드 백업(`worlds/mglg` 폴더 복사)을 받고, 테스트는 **복제한 테스트 월드**에서 한다.
- 기존 시트로 되돌아갈 수 있어야 한다 (시트 설정 > 시트 클래스 선택).

## 8. 구현 계획 (새 `ActorSheet` 추가, 기존 시트 유지)

### 8-0. 파일 구성 (새 파일 중심)

```
module/sheet-v3/
  init-v3.js          # 시트 등록, 설정 등록
  actor-sheet-v3.js   # MagicalogiaActorSheetV3 extends ActorSheet
  talent-calc.js      # 순수 함수: 목표치 계산, 이름→칸 찾기 (UI 없이 테스트 가능)
  roll-v3.js          # 판정 실행, 채팅 카드 발행
templates/sheet-v3/
  character-sheet-v3.html
  partials/…          # 히어로, 특기표, 장서행, 관계행
  roll-v3.html        # 새 채팅 카드
styles/sheet-v3.css   # .mglg-sheet.theme-* 범위만
lang/ (키 추가)       # 기존 파일이 아니라 새 키 접두사 MGLG.V3.* 로 추가
```

기존 파일 수정은 최소 2곳이다: `system.json`(`esmodules`에 `module/sheet-v3/init-v3.js`, `styles`에 `styles/sheet-v3.css` 추가)과 `lang/ko.json`·`lang/ja.json`(새 키 추가). **기존 `init.js`는 건드리지 않는다.**

### 8-1. 단계

| # | 단계 | 산출물 | 완료 확인 |
| --- | --- | --- | --- |
| 0 | 사전 확인 | 이 문서의 [추정] 항목 검증: ① `_preUpdate` 재계산 동작 (§4-2) ② template.json 기본값 채움 (§7-2) ③ 장서 `type` 실제 저장 문자열 (월드 샘플) | 결과를 문서에 갱신 |
| 1 | 골격 | `init-v3.js`: `Hooks.once("init")`에서 `Actors.registerSheet("magicalogia", MagicalogiaActorSheetV3, {types:["character"], makeDefault:false, label:"MGLG.V3.SheetName"})`. 기존 시트가 `makeDefault:true`라 등록 순서와 무관하게 기존이 기본이다. 빈 시트가 열리고 시트 설정에서 고를 수 있어야 함 | 기존 시트 동작 불변, 새 시트 선택 가능 |
| 2 | 계산 함수 | `talent-calc.js`: `computeTargets(table, gap, overflowX)` → 6×11 목표치, `findTalentByName(name)`; 단위 테스트(노드 스크립트): §4-2의 규칙 표 케이스(습득 칸, 칠한 갭, overflow, 상한 12, 불운) | 기존 `_getTalentTable` 알고리즘과 동일 결과 (같은 입력으로 비교) |
| 3 | 데이터 준비 | `getData`: 복사본 사용(`foundry.utils.deepClone`), 영역·행·칸·목표치·갭·자기 영역 계산, 장서/관계/프라이즈/핸드아웃 분류, 값 정규화(§6) | 라이브 `actor.system` 객체가 변하지 않음 |
| 4 | 템플릿 + CSS | 히어로, 특기표, 장서, 관계, 설정 탭. 테마 4종 CSS 변수. 시안 `TH` 값을 CSS 변수로 이식. `sc-for/sc-if` → `{{#each}}/{{#if}}` | 4테마에서 레이아웃 동일, 글자 12px 미만 없음, 대비 4.5:1 확인 |
| 5 | 상호작용 | 상태 토글, 마력 −/+, 장서 충전 −/+, 주구/운명의 힘 사용, 갭·습득·영역 편집, 아이템 추가/삭제/편집, 초상 변경 | 읽기 전용 사용자는 편집 불가 |
| 6 | 판정 | `roll-v3.js`: `Roll("2d6 + 보정")`, 스페셜/펌블/더블릿, `ChatMessage.getSpeaker({actor})`, 롤 모드(Alt=비밀), Dice So Nice 호환, 새 채팅 카드(테마 적용). 혼의 특기: 마력 1 소비 확인 + 소비 후 굴림 | 기존 카드와 같은 판정 결과 (성공/실패/스페셜/펌블), 화자 정확 |
| 7 | 빠른 굴림 바 | RollTable 연결 설정, 일반 주사위 | 표 미연결 시 비활성 + 이유 |
| 8 | 설정 탭 + 비밀 칸 | flags 입력, 공적점 조건, 핸드아웃 가시성 규칙 유지 | **다른 플레이어로 로그인해 비밀 노출이 없는지 확인** |
| 9 | 마감 | 접근성(탭·아이콘 툴팁, 키보드), `prefers-reduced-motion`, 폰트 라이선스, 문서 | 체크리스트 |

### 8-2. 위험·주의 (구현 중 지킬 것)

1. **재계산 의존 금지** (§4-2). 새 시트는 저장된 `num`을 읽지 않는다.
2. **불운 영역 `-1` 감점 유지.**
3. **`speaker` 오류 재현 금지** (§4-4 ⑦).
4. **비밀 노출 방지** (§3-3).
5. **CSS 격리:** `.mglg-sheet` 아래에서만. `magicalogia` 클래스 미사용 (§3-6).
6. 시안의 `[일러스트]`·`방어의 달인` 같은 **더미 값은 화면 샘플**이다. 하드코딩 금지.
7. 외부 폰트 `<link>`는 GM 설정으로 끌 수 있게.
8. 기존 `getData`의 라이브 객체 변형(§3-4)을 따라 하지 말 것.
9. 커뮤니티 모듈(libWrapper, Monk's Active Tile Triggers 등)과의 충돌: 새 시트는 훅을 새로 걸지 않는다. 그래도 월드에서 켜 놓고 시트가 열리는지 확인한다 [미확인].

## 9. 결정이 필요한 질문 (사용자)

### 9-0. 확정된 결정 (사용자 답변)

- **질문 1 편집 방식:** 편집 모드 없이 원클릭. 갭 칸 클릭 = 칠하기 토글, 특기 칸 옆 체크칸 = 습득 토글(칸 본체 클릭은 판정), 표 아래 영역 선택 바 = 영역 선택 시 갭 2칸 자동 칠하기. 자동 칠하기는 기존 `_preUpdate`에 기대지 않고 새 시트가 `talent.gap`을 직접 저장한다.
- **질문 3 단장·봉서:** `bond`의 종류 필드(`flags…kind`)로 처리한다.
- **프라이즈:** `bond` + `kind = "prize"`로 처리한다 (위 §6-5). `item` 타입은 일반 아이템으로 따로 둔다.
- **질문 2 별↔어둠:** `overflowX` 옵션을 유지한다 (특정 장서 효과 때문). 새 시트의 목표치 계산은 `overflowX`를 따르고, 특기 탭에 토글을 둔다.
- **질문 5 더블릿:** 표시만 유지한다. 마소 관리는 플레이어가 시트에서 직접 한다 (자동 지급·저장 필드 없음).
- **질문 6 혼의 특기 마력 소비:** 자동 소비 없음. 플레이어가 직접 처리한다. §6-3의 "굴리기 전 마력 1 소비 → 새 로직" 항목은 **철회**하고, 혼의 특기는 목표치 6 고정(불운이면 12)으로 굴리기만 한다. 칸에는 "굴리기 전 마력 1 소비는 직접" 안내 문구만 둔다.
- **질문 7 플롯:** 별도 모듈로 만든다 (1~6 플롯을 각자 정하는 창, 결과는 채팅 출력). 새 시트에는 플롯 진입점(`.circle`)을 **두지 않는다.** 기존 시트와 시스템의 플롯 기능은 그대로 둔다.
- **질문 9 폰트:** 구글 폰트 `<link>`를 쓴다 (인터넷 필요). 로컬 번들·라이선스 확인은 불필요.
- **질문 10 마법 목록:** 컴펜디움은 나중에 새로 작성한다. 이번에는 장서를 빈 아이템으로 추가하거나 직접 입력한다.
- **질문 11 언어 접두사:** 진행. 새 시트에서만 "1. " 접두사를 제거하고 언어 파일은 바꾸지 않는다.
- **질문 8 판정 기록 탭:** 답변 없음. 명세대로 2차로 미루고 **이번 구현에서는 탭을 만들지 않는다** (설명 없는 탭을 두지 않는다는 명세 원칙 6).

### 9-1. 원래 질문 (질문 4는 위 결정으로 해소됨)

1. **편집 모드:** 시안 상단에는 "편집" 버튼만 있고 습득 체크·갭 칠하기·영역 선택·`별↔어둠`·불운 표시를 어디서 하는지 없다. 제안: "편집" 버튼을 켜면 특기표에서 클릭이 판정 대신 습득 토글이 되고, 갭 열과 영역 머리가 클릭 가능해진다. 이대로 가도 되는가?
2. **별↔어둠 연결 옵션**을 유지할 것인가 (시스템에 있음, 명세는 "이어지지 않음").
3. **단장·봉서:** `bond`의 종류 필드 (`flags…kind`)로 처리해도 되는가? "부담"이 무엇인지 정의가 있는가?
4. **프라이즈:** `item` 타입이 프라이즈인지 확인 요청. 맞다면 관계 목록과 분리해 설정·공적점 탭에 두는 안에 동의하는가?
5. **더블릿 마소 2점:** 표시만 유지(현재)인가, 마소를 저장해서 자동 지급인가?
6. **혼의 특기 마력 소비:** 소비는 자동인가 확인 대화상자를 거치는가? 마력 부족일 때 막을 것인가?
7. **플롯(마법전) 진입점:** 새 시트에 둘 것인가, 둔다면 어디인가?
8. **판정 기록 탭:** 2차로 미룬다고 했는데 탭 자리만 둘 것인가?
9. **폰트:** 구글 폰트 `<link>`(인터넷 필요)인가, 로컬 번들(라이선스 확인)인가?
10. **마법 목록(장서 추가 시 고르기):** 시스템에 목록 데이터가 없는데, 컴펜디움을 새로 만들 것인가 이번에는 직접 입력만 할 것인가?
11. 월드의 `lang` 접두사 "1. 별" 제거는 새 시트에서만 처리하고, 언어 파일은 바꾸지 않는 것으로 진행해도 되는가?

## 10. 이 분석의 한계

- Foundry를 실행해서 확인한 것은 없다. 코드 읽기와 월드 DB 문자열 확인뿐이다.
- 월드에 특기를 습득한 액터가 없어서 §4-2 ③은 [추정]이다.
- 시안 PNG 4장과 모듈 연동은 열어 보지 않았다.
- "프라이즈 = `item` 타입", "핸드아웃 = 마기카로기아의 핸드아웃" 같은 **게임 룰 의미**는 필드 이름에서 추정한 것이다. 룰북으로 확인한 것은 아니다.

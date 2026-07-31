---
name: build
description: 앱을 굽는다(아이폰 TestFlight + 안드로이드 APK). 사장님이 "빌드해" 한 마디만 하시면 검증→버전올리기→두 플랫폼 굽기→TestFlight 업로드→APK 바탕화면 다운로드까지 전부 자동. 사장님은 터미널을 모르시므로 AI 가 끝까지 한다.
---

# 앱 굽기 (아이폰 + 안드로이드)

> 사장님 지시(2026-07-31): *"지금 빌드와 업로드 방식을 개발하면서 수없이 해야할듯한데
> 매번 이렇게 지시 안 하고 나는 방법은… 자동화를 시켜야 함"*
>
> **사장님은 터미널을 모르신다.** 사장님이 하실 일은 **폰에서 설치 한 번**뿐이다.

## 인자

| 쓰는 법 | 무엇을 굽나 |
|---|---|
| `/build` | **둘 다**(아이폰 + 안드로이드) ← 기본 |
| `/build ios` | 아이폰만 |
| `/build aos` | 안드로이드만 |

---

## 절차 (이 순서를 지킬 것)

### 0-0. ⚠️ 정말 구워야 하는지 **먼저 확인** (2026-07-31 추가)

> 사장님 지시: *"이것 할 때마다 빌드를 해야 하냐? 정말 귀찮은데"*
> 이 스킬은 **부르면 무조건 굽는다.** 그래서 안 구워도 될 때 30분을 낭비했다.

```bash
node scripts/deploy-decide.mjs
```

- 답이 **`build` 가 아니면** = 굽지 말고 **`/deploy` 스킬로 넘긴다**(무선 업데이트 1~2분이면 끝).
- 답이 `build` 면 = 아래 절차 진행.
- 사장님이 **"그래도 구워라"** 하시면 = 구운다(사장님 결정이 우선 §1).

### 0. 미커밋이 있으면 먼저 처리

```bash
git status --short
```

- **미커밋이 있으면** → 사장님께 알리고 **커밋 지시를 받는다**(§10 = AI 가 임의 커밋 금지).
  커밋 안 된 코드로 구우면 폰에 들어간 것과 저장소가 달라져 나중에 추적이 안 된다.
- 깨끗하면 다음으로.

### 1. 검증 먼저 (사장님 확정 = 통과해야 굽는다)

```bash
node scripts/verify-before-commit.mjs
```

⚠️ 하나라도 실패하면 **굽지 말고** 고친다(§17 Ralph-loop). 오늘(2026-07-31) 검증 없이 구웠다가
**4번 연속 실패**했다 — 그 시간이 전부 낭비였다.

### 2. 버전 올리기 (아이폰만 해당)

애플은 **같은 버전 안에서 빌드 번호가 겹치면 거부**한다. `app.json` 을 읽어 처리:

| 상황 | 어떻게 |
|---|---|
| 기능이 크게 바뀜 | `version` 을 올림(예 1.0.2 → 1.0.3), `ios.buildNumber` = "1" |
| 같은 기능 재빌드 | `version` 그대로, `ios.buildNumber` 만 +1 |

🔴 **`version` 을 올렸으면 `runtimeVersion` 도 같은 값으로 올려라**(2026-07-31 추가).
`runtimeVersion` 은 `{"policy":"appVersion"}` 이 아니라 **숫자를 직접 적는 방식**이다
(이 프로젝트는 bare 로 인식돼 policy 를 못 씀). = **자동으로 안 따라간다.**
안 올리면 새로 구운 앱이 옛 번호표를 달고 나와 무선 업데이트가 어긋난다.

⚠️ **내손앱이 이미 올린 버전보다 높아야 한다**(같은 앱 번호를 쓰므로).
2026-07-31 실측 = 내손앱 최종 `1.0.1`.

⚠️ 안드로이드는 빌드 번호가 필요 없다.

### 3. 굽기 (둘 다면 **동시에** 시작 = 시간 절약)

**아이폰** — EAS 클라우드(맥이 필요해 GitHub 러너로는 불가):
```bash
npx eas build --platform ios --profile production --non-interactive --no-wait
```
→ 출력의 빌드 ID 를 기억한다. 보통 **4~7분**.

**안드로이드** — GitHub 러너에서 직접(무료):
```bash
gh workflow run build-android-apk.yml --ref main
sleep 10
gh run list --workflow=build-android-apk.yml --limit 1 --json databaseId --jq '.[0].databaseId'
```
→ 보통 **20~35분**. 아이폰보다 오래 걸리므로 **백그라운드로 걸어두고** 아이폰을 먼저 끝낸다.

### 4. 아이폰 = TestFlight 에 올리기

빌드가 `finished` 가 되면:
```bash
npx eas submit --platform ios --profile production --id <빌드ID> --non-interactive
```
→ 5~10분 뒤 애플에서 사장님께 메일이 간다.

⚠️ 애플이 **거부 메일**을 보내면 이유를 읽고 고쳐서 다시 굽는다. 흔한 것:
- `ITMS-90062` = 버전이 이전보다 낮음 → 2번으로 돌아가 올린다

### 5. 안드로이드 = **바탕화면에 다운로드** (AI 가 직접, 링크만 주지 말 것)

> 사장님이 **수없이 반복 지시**하신 것. 링크만 안내하면 안 된다.

```bash
gh run download <실행ID> -D apk-tmp -R VROIS/namaneul-wihan-yeohaeng-iljeong
# 찾은 .apk 를 C:\Users\hzino\Desktop\ 로 복사, 이름은 알아보기 쉽게
# 예: Tripis-BTS오버레이-2cfdc72.apk  (무엇을 고쳤는지 + 커밋 앞 7자)
rm -rf apk-tmp
```

### 6. 보고 (한국어 표)

| 무엇 | 내용 |
|---|---|
| 아이폰 | 버전·빌드번호, TestFlight 업로드 됨/안 됨 |
| 안드로이드 | 바탕화면 파일 이름·크기 |
| **사장님이 하실 일** | 아래 설치 방법 |
| **폰에서 봐주실 것** | 이번에 고친 것 중심으로 3~5줄 |

---

## 설치 방법 (매번 이대로 안내할 것)

### 아이폰 — 파일 받을 필요 없음
1. 아이폰에서 **TestFlight** 앱 열기(없으면 앱스토어에서 무료)
2. **내 손안에 가이드** 선택
3. **업데이트** 누르기

### 안드로이드 — 바탕화면 파일을 폰으로
1. 바탕화면 APK 를 **USB 로 폰에 옮기기**(또는 카톡 "나에게 보내기")
2. 폰에서 그 파일 눌러 설치
3. "출처를 알 수 없는 앱" 물으면 **허용**

---

## ⚠️ 함정 (전부 2026-07-31 실측 — 또 밟지 말 것)

| # | 증상 | 원인 | 해법 |
|---|---|---|---|
| 1 | 빌드 48초 만에 `Prebuild failed` | `.gitignore` 의 `*.json` 이 **`credentials.json`** 을 막아 서버로 안 감 | `.easignore` 에 예외(이미 있음) |
| 2 | 열쇠가 안 실려 로그인 버튼이 죽은 앱이 나옴 | EAS 환경이 `development`/`production` **따로**인데 production 이 비어 있음 | `eas.json` 의 production 에 `"environment": "development"`(이미 있음) |
| 3 | `EACCES: mkdir '.expo/web'` | 내 PC 의 `.expo` 캐시가 통째로 올라가 권한 충돌 | `.easignore` 에 `.expo`(이미 있음) + 로컬 폴더 삭제 |
| 4 | `INSTALL_PODS` 에서 `Swift pods cannot be integrated` | 구글 로그인이 끌고 오는 `AppCheckCore` 가 Swift | `app.json` 의 `expo-build-properties` → `ios.extraPods`(이미 있음). ⚠️ `useModularHeaders` 는 **없는 옵션**(AI 가 지어내 실패함) |
| 5 | 애플이 `ITMS-90062` 로 거부 | 버전이 이전 승인본보다 낮음 | 2번 절차대로 올린다 |

## ⚠️ 새 부품을 넣었으면 OTA 로는 안 간다

`package.json` 에 npm 부품이 추가/변경됐으면 **반드시 다시 구워야** 한다.
`eas update`(OTA)는 자바스크립트만 바꾸므로 네이티브 부품은 안 들어간다.
확인: `git diff <이전커밋> HEAD -- package.json`

## ⚠️ 서버(server/) 가 바뀌었으면 Replit 도

앱만 구워서는 반영되지 않는다. 사장님께 **Republish** 를 안내한다.
확인: `git diff --name-only <이전커밋> HEAD | grep "^server/"`

## 열쇠·서명 (전부 준비돼 있음 = 사장님 손 0)

| 무엇 | 어디 |
|---|---|
| 애플 인증서·프로비저닝 | `ios-credentials/` (git 에 안 올라감) |
| 비밀번호 | `credentials.json` (git 에 안 올라감) |
| 앱스토어 업로드 열쇠 | `ios-credentials/AuthKey_H92XS2QHYH.p8` |
| 앱 번호·발급자 번호 | `eas.json` 의 `submit.production.ios` |
| 로그인 열쇠(구글·카카오) | GitHub Secrets + EAS development 환경 |

⚠️ **애플 로그인을 사장님께 시키지 마라.** 위 파일들로 전부 자동이다.
막히면 `내손안에 가이드\mobile-app\` 을 먼저 뒤진다(원본이 거기 있다).

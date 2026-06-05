# EAS 대시보드 가이드 (비개발자용)

> **목적**: 터미널 전혀 쓰지 않고 iPhone/Android에서 앱 변경사항을 즉시 확인하는 셋업
> **결과**: Claude가 코드 고치면 → 1분 뒤 폰에서 앱 재시작만 하면 새 버전 확인
> **대상**: Vrois/vibetrip 프로젝트 (projectId: `f13f4f4b-7116-44be-b0c8-c91b633a5fb5`)

---

## 최종 워크플로우 (셋업 완료 후)

```
[Claude Code가 코드 수정]
        ↓
[git push (Claude 자동)]
        ↓
[GitHub Actions → EAS Update 자동 실행]
        ↓
[1분 뒤: iPhone + Android 앱이 자동으로 새 JS 감지]
        ↓
[사용자: 앱 닫았다 다시 열기만]
```

**사용자가 1000회 iteration 동안 할 일**: 앱 닫고 다시 열기. 끝.

---

## 초기 셋업 (딱 한 번, 약 30분)

### 액션 1 — Expo 대시보드에서 GitHub 연결 (2분)

1. 브라우저 → https://expo.dev/accounts/vrois/projects/vibetrip
2. **Overview** 탭에서 상단 **"Connect GitHub"** 박스 클릭
3. GitHub 로그인 팝업에서 **VROIS** 조직 선택
4. 저장소 목록에서 **`namaneul-wihan-yeohaeng-iljeong`** 선택
5. **"Install & Authorize"** 클릭
6. Expo 대시보드로 돌아와서 연결 확인 (Connected 뱃지)

### 액션 2 — EXPO_TOKEN 발급 + GitHub Secrets 등록 (3분)

**Part A: 토큰 발급**
1. Expo 대시보드 좌측 상단 **Vrois** 클릭 → 드롭다운에서 **Account Settings** 선택
2. 좌측 메뉴 **Access Tokens** 클릭
3. **"Create token"** 버튼
4. 이름: `github-actions` 입력 → Create
5. **표시된 토큰 문자열 복사** (다시 못 봄! 안전한 곳에 임시 저장)

**Part B: GitHub에 토큰 등록**
6. 새 탭: https://github.com/VROIS/namaneul-wihan-yeohaeng-iljeong/settings/secrets/actions
7. **"New repository secret"** 버튼
8. Name: `EXPO_TOKEN` (정확히 이 철자, 대소문자 포함)
9. Value: 복사한 토큰 붙여넣기
10. **"Add secret"** 클릭

### 액션 3 — Development Build 생성 (20~30분, 클라우드 대기)

**iOS (Apple Developer 계정 필요)**
1. 대시보드 좌측 **Development builds** 클릭
2. **"Get started with development builds"** 또는 **"Create build"** 클릭
3. 플랫폼: **iOS** 선택
4. Profile: **development** 선택
5. **Apple 로그인** — Apple Developer 계정 ID/비번 입력 (Expo가 서명 인증서 자동 생성)
6. **"Start build"** 클릭
7. 빌드 대기 (약 15-25분, 무료 플랜은 후순위)

**Android**
1. 같은 화면에서 **iOS 빌드 시작 후 추가로** **"Create build"** 다시 클릭
2. 플랫폼: **Android** 선택
3. Profile: **development** 선택
4. Keystore: **"Let EAS handle it"** (자동 생성)
5. **"Start build"** 클릭
6. 빌드 대기 (약 10-20분)

### 액션 4 — 폰에 설치 (5분)

**iPhone**
1. 대시보드에서 iOS 빌드 완료 확인
2. **"Install"** 버튼 → **QR 코드** 표시됨
3. iPhone 카메라 앱으로 QR 스캔 → 웹 페이지 링크 열기
4. **"프로파일 설치"** 안내 따라서 설정 앱 접근
5. 설정 → 일반 → VPN 및 장치 관리 → 프로파일 신뢰
6. 홈 화면에 **VibeTrip** 아이콘 등장 → 탭하여 실행

**Android**
1. 대시보드에서 Android 빌드 완료 확인
2. **"Install"** 버튼 → QR 코드 표시됨
3. Android 카메라로 QR 스캔 → `.apk` 다운로드
4. Android 설정 → 보안 → **"알 수 없는 출처 설치 허용"** (Chrome)
5. 다운로드 알림 탭 → 설치 진행
6. 홈 화면에 **VibeTrip** 아이콘 등장 → 탭하여 실행

---

## 셋업 완료 후: 1000회 iteration 사용법

### Claude가 코드 수정한 뒤 (Claude가 자동으로 하는 일)
1. `git add` → 변경 파일 스테이징
2. `git commit` → 커밋 생성
3. `git push origin main` → GitHub로 푸시
4. GitHub Actions가 자동 트리거 → EAS Update 배포 (약 30-60초)

### 사용자가 하는 일
1. Claude가 "푸시 완료" 메시지 보내면
2. 폰에서 VibeTrip 앱 **완전히 닫기** (앱 스위처에서 위로 밀어 종료)
3. 앱 다시 열기
4. 잠깐 "Updating..." 표시 후 새 버전 로드
5. 변경사항 확인 → 피드백을 Claude에게

---

## GitHub Actions 동작 확인

### 성공 여부 확인
- https://github.com/VROIS/namaneul-wihan-yeohaeng-iljeong/actions
- 최근 워크플로우에 **녹색 체크**(✓)면 성공, **빨간 X**면 실패
- 실패 시 클릭해서 로그 확인 후 Claude에게 공유

### 흔한 실패 사유
| 증상 | 원인 | 해결 |
|------|------|------|
| "EXPO_TOKEN secret is missing" | 토큰 등록 안 됨 | 액션 2 재확인 |
| "Invalid token" | 토큰 만료/잘못됨 | 액션 2 Part A부터 다시 |
| "Project not found" | Expo projectId 불일치 | `app.json`의 projectId 확인 |
| "Branch not found" | EAS 채널 없음 | Claude에게 `eas update --branch main --create` 필요 알림 |

---

## EAS Update vs EAS Build 차이 (기초)

| 구분 | Update (거의 매번) | Build (드물게) |
|-----|---|---|
| 트리거 | JS/이미지/스타일 변경 | 네이티브 패키지 추가/삭제, `app.json` 권한 변경 |
| 시간 | 30-60초 | 20-30분 |
| 빈도 | 1000회 iteration 대부분 | 월 1-5회 |
| 사용자 액션 | 앱 재시작 | QR로 재설치 |

**이번 세션의 Screen D 변경 = 100% Update로 전달됨**. 새 Build 필요 없음.

---

## 주의사항

1. **무료 플랜 한도**
   - EAS Build: 월 30회 (초기 + 네이티브 변경 시만 소모)
   - EAS Update: **무제한** (1000회 iteration OK)

2. **네이티브 변경 감지**
   - `package.json`에 expo-/react-native- 라이브러리 추가/삭제 시
   - `app.json` 의 plugins/permissions 변경 시
   - → 이때는 **Build 재생성** 필요 (액션 3 반복)

3. **EXPO_TOKEN 보안**
   - 외부에 공유 절대 금지
   - 유출 의심 시 대시보드에서 토큰 revoke → 재발급

---

## 문제 발생 시 체크리스트
- [ ] Expo 대시보드 GitHub 연결 상태 확인 (Connected 뱃지)
- [ ] GitHub repo Secrets에 `EXPO_TOKEN` 존재 확인
- [ ] 최근 GitHub Actions 실행 로그 확인
- [ ] 폰 WiFi/데이터 연결 확인 (Update fetch 필요)
- [ ] 앱 "완전히 종료 후 재실행"인지 확인 (백그라운드 복귀로는 업데이트 안 받음)
- [ ] 여전히 안 되면 Claude에게 GitHub Actions 로그 공유

# /deploy — 커밋 + 푸시 (원스톱 배포)

변경사항을 커밋하고 GitHub에 push합니다.
push 후 Replit에서 Pull + Deploy, EAS에서 앱 빌드가 진행됩니다.

## 실행 순서  **커밋전 Simplify+Review Skills 사용 2단계 검증 필수**

### 1. 변경사항 확인
- `git status`로 변경 파일 목록 확인
- `git diff --stat`로 변경 규모 확인
- 변경 없으면 "변경사항 없음" 출력 후 중단

### 2. 스테이징
- 변경된 파일을 개별적으로 `git add` (git add -A 사용 금지)
- 민감 파일 제외: `.env`, `credentials.json`, `*.p12`, `*.mobileprovision`, `*.keystore`, `*.jks`, `*.b64`, `*.p8`
- 제외된 파일이 있으면 사용자에게 알림

### 3. 커밋 메시지 생성
- `git diff --cached`를 분석하여 변경 내용 파악
- 한국어로 간결한 커밋 메시지 작성 (예: "TTS 자동재생 전환 + keepAwake 연결")
- 최근 커밋 스타일(`git log --oneline -5`)에 맞춤
- Co-Authored-By 포함

### 4. 커밋 실행
- HEREDOC 형식으로 커밋 메시지 전달
- pre-commit hook 실패 시 수정 후 새 커밋 (amend 금지)

### 5. 버전 코드 체크 (필수)
- `mobile-app/app.json` → `android.versionCode` 확인
- `mobile-app/app.json` → `ios.buildNumber` 확인
- Google Play 마지막 게시 versionCode보다 +1 이상인지 검증
- App Store 마지막 buildNumber보다 +1 이상인지 검증
- 부족하면 올린 후 커밋에 포함

### 6. GitHub push
- `git push origin main`
- push 실패 시 원인 분석 후 보고 (force push 절대 금지)

### 7. 결과 보고
push 성공 시 아래 메시지 출력:

```
✅ Push 완료
- 커밋: [커밋 해시] [메시지]
- 파일: [N]개 변경

📱 앱 빌드:
- EAS Build 수동 실행 필요: `cd mobile-app && eas build --platform android` (AAB) / `eas build --platform ios` (IPA)

🌐 서버 배포:
- Replit → Git 탭 → Pull 버튼 → Deploy
  (Deployment 설정에 Build command: npm run build 지정되어 있으면 자동 빌드)
```

---

## 배포 일지

### 2026-03-20
- **versionCode**: 10 → 11 (AAB), **buildNumber**: 3 → 4 (IPA)
- **커밋 내용**:
  - `83b7b17` 프로필 닫기 복구 + 네이티브 음성인식 + 인증모달 통합 + OAuth WebView 대응
  - `cda6335` versionCode 11
- **변경 파일 (7개)**:
  - `mobile-app/App.js` — expo-speech-recognition 활성화 (네이티브 음성인식)
  - `mobile-app/app.json` — speech-recognition 플러그인 + versionCode 11 + buildNumber 4
  - `mobile-app/package.json` — expo-speech-recognition 의존성 추가
  - `public/index.js` — 네이티브 마이크 브릿지 + OAuth WebView 대응 (openOAuthFlow 공용함수) + Apple 버튼 iOS 전체 표시
  - `public/profile.html` — backBtn 복구 + 구버전 인증모달 삭제 + 로그아웃 버튼 교체
- **비고**: expo-speech-recognition 네이티브 모듈 추가 → EAS 수동 빌드 필수 (`eas build --platform android/ios`)

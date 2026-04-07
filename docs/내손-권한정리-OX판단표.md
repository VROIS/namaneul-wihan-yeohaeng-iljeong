# Expo 모듈 + 권한 O/X 판단표

> → 뒤에 O(유지) 또는 X(삭제) 적어주세요

---

## 1. Expo 모듈 (33개)

### 현재 사용 중 (9개)
| # | 모듈 | 기능 | O/X |
|---|------|------|-----|
| 1 | expo-speech | TTS 가이드 읽어주기 |0 |
| 2 | expo-haptics | 버튼 터치 진동 |0 |
| 3 | expo-sharing | 가이드 외부 공유 |0 |
| 4 | expo-clipboard | 링크/텍스트 복사 |0 |
| 5 | expo-location | 현재 위치 관광 정보 | 0|
| 6 | expo-image-picker | 이미지 선택/첨부 |0 |
| 7 | expo-secure-store | 인증 토큰 암호화 저장 |0 |
| 8 | expo-localization | 다국어 감지가 아니라 언어선택 감지다  |o |
| 9 | expo-notifications | 푸시 알림 |o |

### 향후 사용 예정 (14개)
| # | 모듈 | 기능 | O/X |
|---|------|------|-----|
| 10 | expo-camera | 카메라 촬영 |o |
| 11 | expo-local-authentication | 지문/Face ID 생체인증 |o |
| 12 | expo-audio | 오디오 재생/녹음 |o |
| 13 | expo-video | 사용법 동영상 재생 |o |
| 14 | expo-file-system | 파일 다운로드/저장 |o |
| 15 | expo-linking | 외부 URL 열기 |o |
| 16 | expo-updates | 앱 OTA 자동 업데이트 |o |
| 17 | expo-network | 온라인/오프라인 감지 |o |
| 18 | expo-device | 기기 정보 확인 |o|
| 19 | expo-screen-orientation | 화면 세로 고정 |x |
| 20 | expo-keep-awake | TTS 중 화면 꺼짐 방지 | o|
| 21 | expo-splash-screen | 앱 시작 화면 |o |
| 22 | expo-web-browser | 인앱 브라우저 |o |
| 23 | expo-mail-composer | 문의 이메일 보내기 | o|

### ⚠️ 판단 필요 (10개) — 권한 자동 추가됨
| # | 모듈 | 기능 | 자동 추가 권한 | O/X |
|---|------|------|-------------|-----|
| 24 | expo-sensors | 가속도/자이로 센서 | ACTIVITY_RECOGNITION ← **구글 오류 원인** |x |
| 25 | expo-contacts | 연락처 읽기 | READ_CONTACTS | o|
| 26 | expo-sms | 문자 보내기 | SEND_SMS |o |
| 27 | expo-battery | 배터리 상태 | BATTERY_STATS |o |
| 28 | expo-brightness | 화면 밝기 조절 | WRITE_SETTINGS |o |
| 29 | expo-task-manager | 백그라운드 작업 | FOREGROUND_SERVICE |o |
| 30 | expo-document-picker | 문서 파일 선택 | 없음 |o |
| 31 | expo-crypto | 암호화 처리 | 없음 |o |
| 32 | expo-apple-authentication | iOS Apple 로그인 | iOS 전용 |o |
| 33 | expo-print | 가이드 인쇄 | 없음 |o |

---

## 2. Android 권한 — app.json (10개)

| # | 권한 | 기능 | O/X |
|---|------|------|-----|
| 1 | CAMERA | 카메라 촬영 |o |
| 2 | RECORD_AUDIO | 마이크 녹음 |o | 이거 대신에 마이크로 음성입력 
| 3 | VIBRATE | 진동 피드백 |o |
| 4 | ACCESS_FINE_LOCATION | 정밀 GPS | o|
| 5 | ACCESS_COARSE_LOCATION | 대략 위치 |o |
| 6 | READ_MEDIA_IMAGES | 갤러리 사진 |o |
| 7 | READ_MEDIA_VIDEO | 갤러리 동영상 |o |
| 8 | ACCESS_NETWORK_STATE | 인터넷 상태 |o |
| 9 | ACCESS_WIFI_STATE | Wi-Fi 상태 |o |
| 10 | RECEIVE_BOOT_COMPLETED | 재부팅 후 알림 유지 |o |

---

## 3. iOS 권한 — app.json (8개)

| # | 권한 | 기능 | O/X |
|---|------|------|-----|
| 1 | NSCameraUsageDescription | 카메라 |o |
| 2 | NSMicrophoneUsageDescription | 마이크 |o |
| 3 | NSLocationWhenInUseUsageDescription | 앱 사용 중 위치 |o |
| 4 | NSLocationAlwaysAndWhenInUseUsageDescription | 백그라운드 위치 |o |
| 5 | NSPhotoLibraryUsageDescription | 갤러리 접근 |o |
| 6 | NSContactsUsageDescription | 연락처 접근 |o |
| 7 | NSFaceIDUsageDescription | Face ID | o|
| 8 | NSMotionUsageDescription | 동작 센서 |0|

---

## 작업 순서
1. ✅ 위 표에 O/X 판단 완료
2. X 표시된 모듈 삭제 (npm uninstall)
3. X 표시된 app.json 권한 제거
4. AAB 재빌드 (Replit에서)
5. Google Play Console 재업로드

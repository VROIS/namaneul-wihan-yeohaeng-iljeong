@echo off
chcp 65001 >nul
echo ====================================
echo VibeTrip 개발 서버 시작 중...
echo ====================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo node_modules 폴더가 없습니다.
    echo 먼저 install.bat을 실행해주세요.
    echo.
    pause
    exit /b 1
)

echo 백엔드 서버를 시작합니다...
start "VibeTrip 백엔드 서버" cmd /k "set NODE_ENV=development && npx tsx server/index.ts"

timeout /t 3 /nobreak >nul

echo Expo 개발 서버를 시작합니다...
echo.
start "VibeTrip Expo 서버" cmd /k "npx expo start --port 8082"

echo.
echo ====================================
echo 서버가 시작되었습니다!
echo ====================================
echo.
echo 잠시 기다려주세요... (5초)
timeout /t 5 /nobreak >nul

REM IP 주소 가져오기
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "IP=%%a"
    goto :found_ip
)
:found_ip
set IP=%IP: =%

echo.
echo ====================================
echo 📱 모바일 접속 정보
echo ====================================
echo.
echo   🌐 현재 IP 주소: %IP%
echo.
echo   📱 Expo 앱 주소: exp://%IP%:8082
echo   💻 웹 브라우저:  http://%IP%:8082
echo   🔧 관리자:       http://localhost:5000/admin
echo.
echo ====================================
echo 📲 Expo Go 앱으로 연결하기
echo ====================================
echo.
echo   1. Expo Go 앱 설치 (App Store/Play Store)
echo   2. 같은 WiFi에 연결 (PC와 스마트폰)
echo   3. "VibeTrip Expo 서버" 창에서 QR 코드 찾기
echo   4. QR 코드 스캔:
echo      - Android: Expo Go 앱 → "Scan QR code"
echo      - iOS: 카메라 앱으로 스캔
echo.
echo ====================================
echo 💻 웹 브라우저에서 보는 방법:
echo ====================================
echo.
echo Expo 서버 창에서 'w' 키를 누르면
echo 브라우저에서 자동으로 열립니다
echo.
echo 또는 브라우저에서 직접 열기:
echo   http://localhost:8082
echo.
echo ====================================
echo.
echo 서버를 중지하려면 각 검은 창을 닫으세요.
echo.
pause

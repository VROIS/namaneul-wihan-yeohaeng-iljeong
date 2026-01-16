@echo off
chcp 65001 >nul
echo ====================================
echo VibeTrip 의존성 패키지 설치 중...
echo ====================================
echo.

cd /d "%~dp0"

if exist "node_modules" (
    echo node_modules 폴더가 이미 존재합니다.
    echo 의존성 설치를 건너뜁니다.
    echo.
    pause
    exit /b 0
)

echo npm install을 실행합니다...
echo 이 작업은 몇 분 정도 걸릴 수 있습니다.
echo.

call npm install

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================================
    echo 의존성 설치가 완료되었습니다!
    echo ====================================
) else (
    echo.
    echo ====================================
    echo 오류가 발생했습니다. 
    echo 터미널에 표시된 오류 메시지를 확인하세요.
    echo ====================================
)

echo.
pause

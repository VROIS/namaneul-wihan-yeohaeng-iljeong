@echo off
chcp 65001 >nul
title VibeTrip 앱 시작
color 0A

echo.
echo ╔════════════════════════════════════════╗
echo ║        VibeTrip 앱 시작 중...          ║
echo ╚════════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM 의존성 설치 확인
if not exist "node_modules" (
    echo [1/2] 의존성 패키지 설치 중...
    echo 이 작업은 처음 한 번만 실행되며 몇 분 걸릴 수 있습니다.
    echo.
    call install.bat
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo 오류: 의존성 설치에 실패했습니다.
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/2] 의존성 패키지는 이미 설치되어 있습니다.
    echo.
)

echo [2/2] 개발 서버 시작 중...
echo.

call start-dev.bat

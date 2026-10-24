// ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 구글맵 읽기 브라우저 = GMAPS_CDP(주소)가 있으면 사장님이 로그인해 둔 전용 크롬에 붙는다(로그인 상태 = 제한 보기 없음) · 20초 안에 못 붙으면(크롬은 살아 있는데 묵은 탭에 걸려 멈춤 = 92번 첫 판 사망) 같은 프로필의 전용 크롬을 닫고 최소화로 새로 켜서 한 번 더 붙는다 = 판이 멈추지 않는다 · 없으면 새 크롬 · 한 행 읽기 시간 제한 1벌 = 90초 안에 못 읽으면 그 행은 건너뛰고(다음 판에) 창을 새로 열어 다음 행으로(64번 = 읽기 2차가 검색 페이지 하나에서 11분 멈춤) (정본 §2026-10-24)
import { spawn, spawnSync } from "child_process";

const CHROME_EXE = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CHROME_PROFILE = "C:/Users/hzino/fillcity-chrome";
const CDP_TIMEOUT = 20_000;
async function restartDedicatedChrome(cdpUrl: string): Promise<void> {
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*fillcity-chrome*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  await new Promise((r) => setTimeout(r, 1500));
  spawn(
    "cmd",
    [
      "/c",
      "start",
      '""',
      "/min",
      CHROME_EXE,
      `--remote-debugging-port=${new URL(cdpUrl).port}`,
      `--user-data-dir=${CHROME_PROFILE}`,
    ],
    { detached: true, stdio: "ignore", windowsHide: true },
  ).unref();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const up = await fetch(`${cdpUrl}/json/version`, {
      signal: AbortSignal.timeout(3000),
    })
      .then((r) => r.ok)
      .catch(() => false);
    if (up) return;
  }
}
export const ROW_TIMEOUT_MS = 90_000;
export function withTimeout<T>(
  p: Promise<T>,
  ms: number = ROW_TIMEOUT_MS,
): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  p.catch(() => {});
  return Promise.race([
    p,
    new Promise<"timeout">((r) => {
      timer = setTimeout(() => r("timeout"), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
export async function launchBrowser(chromium: any): Promise<any> {
  const cdpUrl = process.env.GMAPS_CDP;
  if (!cdpUrl) return chromium.launch({ channel: "chrome", headless: true });
  try {
    return await chromium.connectOverCDP(cdpUrl, { timeout: CDP_TIMEOUT });
  } catch (e: any) {
    console.log(
      `  🟡 전용 크롬 연결 멈춤(${String(e?.message || e).slice(0, 80)}) = 닫고 최소화로 새로 켠 뒤 다시 붙는다`,
    );
    await restartDedicatedChrome(cdpUrl);
    return chromium.connectOverCDP(cdpUrl, { timeout: CDP_TIMEOUT });
  }
}

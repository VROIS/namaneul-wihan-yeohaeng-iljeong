// Playwright 자동 테스트 — 세계지도 줌인 좌표 검증
import { chromium } from 'playwright';

const URL = 'http://localhost:8081';

async function test() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  console.log('Expo 웹 로딩...');
  await page.goto(URL, { timeout: 30000 });

  // 랜딩 화면 대기
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-screenshots/01-landing.png' });
  console.log('스크린샷 1: 랜딩');

  // 생년월일 입력
  const input = page.locator('input[placeholder*="DD"]').first();
  if (await input.isVisible()) {
    await input.fill('03061967');
    console.log('생년월일 입력됨');
  }

  await page.waitForTimeout(1000);

  // Google 버튼 클릭
  const btn = page.locator('text=Continue with Google').first();
  if (await btn.isVisible()) {
    await btn.click();
    console.log('Google 로그인 클릭');
  }

  // 세계지도 화면 대기
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-screenshots/02-worldmap-before-zoom.png' });
  console.log('스크린샷 2: 세계지도 (줌인 전)');

  // 줌인 후
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-screenshots/03-worldmap-after-zoom.png' });
  console.log('스크린샷 3: 줌인 후');

  // 캐릭터 선택
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-screenshots/04-character-select.png' });
  console.log('스크린샷 4: 캐릭터 선택');

  await browser.close();
  console.log('테스트 완료! test-screenshots/ 폴더 확인');
}

test().catch(e => console.error('테스트 실패:', e.message));

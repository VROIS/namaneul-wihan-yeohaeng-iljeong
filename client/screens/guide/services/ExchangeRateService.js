// ⚠️ 수정금지(승인필요): 환율 서비스 — 무료 API + 1일 1회 캐시
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../config/constants';

const CACHE_KEY = 'exchange_rates';
const CACHE_TIMESTAMP_KEY = 'exchange_rates_timestamp';

// ⚠️ 수정금지(승인필요): 환율 조회 (캐시 우선)
// baseCurrency: 'USD', targetCurrency: 'KRW'
export async function getExchangeRate(baseCurrency = 'USD', targetCurrency = 'KRW') {
  // 캐시 확인
  const cached = await getCachedRates(baseCurrency);
  if (cached && cached[targetCurrency]) {
    return {
      rate: cached[targetCurrency],
      base: baseCurrency,
      target: targetCurrency,
      cached: true,
      timestamp: await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY),
    };
  }

  // API 호출 (온라인)
  try {
    const url = `${CONFIG.API.EXCHANGE_RATE_URL}/${baseCurrency}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.rates) {
      // 캐시 저장
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ base: baseCurrency, rates: data.rates }));
      await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, new Date().toISOString());

      return {
        rate: data.rates[targetCurrency],
        base: baseCurrency,
        target: targetCurrency,
        cached: false,
        timestamp: new Date().toISOString(),
      };
    }
    throw new Error('환율 데이터 없음');
  } catch (error) {
    throw new Error(`환율 조회 실패: ${error.message}`);
  }
}

// ⚠️ 수정금지(승인필요): 금액 환산
export async function convertCurrency(amount, fromCurrency, toCurrency) {
  // 같은 통화
  if (fromCurrency === toCurrency) return amount;

  // USD 기준으로 변환
  const fromRate = fromCurrency === 'USD' ? 1 : (await getExchangeRate('USD', fromCurrency)).rate;
  const toRate = toCurrency === 'USD' ? 1 : (await getExchangeRate('USD', toCurrency)).rate;

  const amountInUSD = amount / fromRate;
  return Math.round(amountInUSD * toRate * 100) / 100;
}

// ⚠️ 수정금지(승인필요): 캐시된 환율 반환 (24시간 유효)
async function getCachedRates(baseCurrency) {
  try {
    const timestamp = await AsyncStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (!timestamp) return null;

    const cacheAge = Date.now() - new Date(timestamp).getTime();
    const maxAge = CONFIG.API.EXCHANGE_RATE_CACHE_HOURS * 60 * 60 * 1000;
    if (cacheAge > maxAge) return null; // 만료

    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const data = JSON.parse(cached);
    if (data.base !== baseCurrency) return null; // 기준 통화 불일치

    return data.rates;
  } catch {
    return null;
  }
}

// ⚠️ 수정금지(승인필요): 음성용 환율 안내 텍스트 생성
export async function getExchangeRateText(fromCurrency, toCurrency, amount) {
  try {
    const result = await getExchangeRate(fromCurrency, toCurrency);
    const converted = Math.round(amount * result.rate);
    return `${amount} ${fromCurrency}는 약 ${converted.toLocaleString()} ${toCurrency}입니다.`;
  } catch {
    return '환율 정보를 가져올 수 없습니다. 인터넷 연결을 확인해주세요.';
  }
}

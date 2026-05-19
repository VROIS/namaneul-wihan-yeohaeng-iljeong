# Gemini 호출 통일 설정 (= 모든 prompt 3 종 동일 = 사용자 SSOT 2026-05-18)

> "**호출하는 방법에 따라 결과가 달라짐** = **통일된 프롬프트 보관 및 적용**" (= 사용자 명시)

## 모델 + 설정 (= 본 세션 검증 완료)

| 항목 | 값 |
|---|---|
| **모델** | `gemini-3-flash-preview` |
| **endpoint** | `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=$GEMINI_KEY` |
| **tools** | `[{ googleSearch: {} }]` ← **Google Search 그라운딩 필수** |
| **temperature** | `0.2` |
| **maxOutputTokens** | `50000` |
| **thinkingConfig.thinkingBudget** | `0` |
| **responseMimeType** | `application/json` |
| **timeout** | `420000` ms (= 7 분) |

## 응답 한계 + Adaptive Fallback

- **응답 토큰 한계** = **8192** (= grounding 활성 시 Google API 자체 제약)
- **계산**:
  - 1 곳 응답 ≈ 200-400 토큰 (= JSON 9-10 필드 + 한국어 큐레이션)
  - 안전 한계 = **30-40 곳 / 호출**
  - 50+ 곳 = 2 호출 분할 (= 호출 2 prompt 에 호출 1 응답 명시 = 중복 방지)
- **Adaptive Fallback** (= JSON 파싱 실패 / id 누락 시):
  - batch 40 → 30 → 20 → 10 (= 최소)
  - 첫 batch 성공 = 이후 batch 도 같은 사이즈

## API Key 로드

- **`api_keys` DB 테이블 → process.env**:
  ```ts
  import { loadApiKeysFromDb } from 'server/services/shared/api-keys-loader';
  await loadApiKeysFromDb(); // = process.env.GEMINI_API_KEY 자동 채움
  ```
- 또는 = 직접 SQL: `SELECT key_value FROM api_keys WHERE key_name='GEMINI_API_KEY' AND is_active=true`
- ⛔ 로컬 `.env` 의 `GEMINI_API_KEY` = 보통 빈 값 (= Replit Secrets 만) → 반드시 DB 로드

## 호출 코드 (= 표준)

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const response = await ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
  config: {
    temperature: 0.2,
    maxOutputTokens: 50000,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingBudget: 0 },
    tools: [{ googleSearch: {} }],
  } as any,
});
const text = (response as any).text || '';
const finishReason = (response as any).candidates?.[0]?.finishReason;
```

또는 = HTTP 직접 (= `scripts/seed-gemini.mjs` 패턴):

```typescript
const resp = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 50000,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    signal: AbortSignal.timeout(420000),
  }
);
const j = await resp.json();
const text = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
```

## JSON 파싱 + 잘림 복구 (= 표준 함수)

```typescript
function parse(text: string): any | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  const candidate = text.slice(start, text.lastIndexOf('}') + 1);
  try { return JSON.parse(candidate); } catch (e) {}
  // 잘림 복구 = 끝에서부터 } 찾기 + 카테고리/배열 닫기 시도
  for (let endIdx = text.length - 1; endIdx > start; endIdx--) {
    if (text[endIdx] !== '}') continue;
    const trimmed = text.slice(start, endIdx + 1);
    for (const suffix of [']}}', ']}', '}', '']) {
      try {
        const p = JSON.parse(trimmed + suffix);
        if (p.results || p.places) return p;
      } catch (e) {}
    }
  }
  return null;
}
```

## 응답 검증

- `finishReason` = `STOP` 이어야 정상 (= `MAX_TOKENS` = 잘림 / `SAFETY` = 차단)
- `parsed.places.length` 또는 `parsed.results.<tier>.length` = 입력 곳수와 일치
- `missingIds` (= 입력에 있는데 응답 없는 id) = 0 이어야 정상

## 비용 (= 본 세션 실측)

- 1 호출 약 6000-7500 토큰 (= 40 곳 batch)
- 비용 ≈ **$0.002 / 호출** (= 매우 저렴)
- Paris 11 batch = 약 **$0.02** 전체

# 일정 검증(Verification) 구현 · 배포 · 결과 피드백

> **작성일**: 2026-02-10  
> **목적**: 2차 가공된 일정표를 90% 이상만 프론트 전송하도록 검증 단계 추가 후, 배포 및 결과 피드백 정리

---

## 1. 구현 요약

| 항목 | 내용 |
|------|------|
| **검증 시점** | AG4(또는 Pipeline V3) 완료 후, **프론트엔드로 보내기 전** |
| **담당** | 메인 에이전트(파이프라인)가 호출. AG4가 검증하지 않음. |
| **모듈** | `server/services/agents/itinerary-verifier.ts` |
| **기준** | Gemini로 "네가 직접 만든다면?" 식 검토 → **score ≥ 90** 만 통과 |
| **체크** | 비용 합리성, 동선 논리, 실제 정보(장소·시간) 현실성 |
| **실패 시** | 사용자 노출 없이 throw → API 500 "일정 생성 실패" |
| **프론트** | 검증 과정·이슈 노출 없음. 통과한 일정만 수신. |

**적용 위치**
- `server/services/agents/pipeline-v3.ts` — 실제 사용 중인 파이프라인 (V3)
- `server/services/agents/orchestrator.ts` — 4-agent 파이프라인

---

## 2. 배포 절차

- **커밋·푸시하면 Koyeb으로 자동 배포** (별도 수동 재시작 불필요).
- **로컬호스트(`http://localhost:8082`)** = 내부테스트용. 배포 전 로컬에서 `.\dev\test-paris-a.ps1` 등으로 검증.

| 단계 | 작업 |
|------|------|
| 1 | `cursor-dev`(또는 배포 브랜치)에 커밋·푸시 |
| 2 | Koyeb 자동 배포 완료 대기 |
| 3 | 건강체크 200 확인 후 실제테스트 (배포 URL 기준) |

---

## 3. 실제테스트 (배포 후)

- **파리 1회**: `POST /api/routes/generate` (destination: Paris, 1~3일 등)
- **확인**: 응답 200 + 일정 데이터 수신 시 검증 통과. 500 + "일정 검증 미통과" 시 서버 로그에 `[Verifier] ❌` 및 score 확인.

---

## 4. 결과 피드백 (실제 테스트)

```
■ 일정 검증 배포 후 결과
- 배포 완료: cursor-dev 푸시 후 Koyeb 자동 배포
- 파리 1회 생성: POST https://legal-dannye-dbstour-4e6b86d5.koyeb.app/api/routes/generate
- 응답: 200, 일수 3일, 장소 18곳 (검증 통과)
- 샘플: Day1 Louvre Museum, Les Antiquaires 등
- 비고: 커밋·푸시·배포본 실제 테스트 자율 실행 완료
```

(추가 테스트 시 위 템플릿으로 채워서 공유)

---

## 5. 관련 문서

- [AGENT_PROTOCOL.md](./AGENT_PROTOCOL.md) — 최종 일정 검증 섹션
- [TASK.md](./TASK.md) — 현재 진행 상태

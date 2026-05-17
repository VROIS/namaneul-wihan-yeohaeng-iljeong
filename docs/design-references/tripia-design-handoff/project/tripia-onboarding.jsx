// Onboarding screens — variation-independent. Shows logo + model download + persona.

function OnboardingScreen({ onDone, dark = false, logoVariant = 'A' }) {
  const [step, setStep] = React.useState(0);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (step !== 2) return;
    const id = setInterval(() => setProgress(p => Math.min(100, p + 3)), 80);
    return () => clearInterval(id);
  }, [step]);

  const accent = 'var(--accent)';
  const bg = dark ? '#0B0B0D' : 'var(--bg)';
  const text = dark ? '#fff' : 'var(--ink)';
  const sec = dark ? 'rgba(255,255,255,0.55)' : 'var(--muted)';

  return (
    <div style={{ height: '100%', background: bg, color: text, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <StatusBar dark={dark} />

      {/* progress dots */}
      <div style={{ padding: '8px 24px', display: 'flex', gap: 6, justifyContent: 'center' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: i === step ? 22 : 6, height: 6, borderRadius: 3,
            background: i <= step ? accent : (dark ? 'rgba(255,255,255,0.15)' : 'var(--line-2)'),
            transition: 'width .3s',
          }} />
        ))}
      </div>

      <div style={{ flex: 1, padding: '20px 28px 0', display: 'flex', flexDirection: 'column' }}>
        {step === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ marginTop: 30, marginBottom: 24 }}>
              <img src="assets/tripis-mark.png" alt="Tripis" style={{ height: 120, width: 'auto', display: 'block', filter: dark ? 'brightness(1.15)' : 'none' }}/>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 28 }}>
              <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1.2, color: 'var(--accent)', lineHeight: 1 }}>Tripis</span>
              <span style={{ fontSize: 14, color: sec, letterSpacing: 1 }}>트리피스</span>
            </div>
            <h1 className="serif" style={{ fontSize: 30, lineHeight: 1.25, fontWeight: 700, margin: 0, letterSpacing: -0.6 }}>
              당신의 여행을 전담하는,<br/>세상에 하나뿐인 AI 비서
            </h1>
            <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.6, color: sec, maxWidth: 300 }}>
              초행 해외여행자를 위한 AI 동반자. 여정 생성부터 현장 통역까지, 이어폰만 꽂으면 옆에서 걸어갑니다.
            </p>

            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12, width: '100%', textAlign: 'left' }}>
              {[
                { icon: 'mic', title: '음성 우선', desc: '귀 → 입 → 음성 응답. 화면을 볼 필요 없음.' },
                { icon: 'camera', title: '실시간 가이드', desc: '카메라에 보이는 것을 그 자리에서 설명.' },
                { icon: 'shield', title: '오프라인 가능', desc: 'Gemma 4 온디바이스. 데이터 요금 0원.' },
              ].map(f => (
                <div key={f.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.05)' : '#fff', border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={f.icon} size={18} color={accent}/>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{f.title}</div>
                    <div style={{ fontSize: 13, color: sec, marginTop: 2, lineHeight: 1.5 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginTop: 40 }}>
              <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>
                Step 02 · 페르소나
              </div>
              <h1 className="serif" style={{ fontSize: 32, lineHeight: 1.2, fontWeight: 700, margin: 0, letterSpacing: -0.6 }}>
                어떤 여행자이신가요?
              </h1>
              <p style={{ marginTop: 10, fontSize: 14, color: sec }}>트리피스가 당신의 결에 맞게 추천을 조정합니다.</p>
            </div>

            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { id: 'luxury', title: 'Experience Luxury', kr: '시간 아끼고, 감도 높게', desc: '프리미엄, 포토제닉, MZ/VIP', color: 'var(--gold)' },
                { id: 'comfort', title: 'Practical Comfort', kr: '안전하게, 편안하게', desc: '검증된 식당, 가족·5060', color: 'var(--accent)' },
                { id: 'explorer', title: 'First-time Explorer', kr: '처음이라 걱정 많은', desc: '통역/SOS/오프라인 중심', color: 'var(--coral)' },
              ].map(p => (
                <div key={p.id} style={{
                  padding: 18, borderRadius: 18,
                  background: dark ? 'rgba(255,255,255,0.04)' : '#fff',
                  border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--line)',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: p.color, opacity: 0.15 }}/>
                  <div style={{ flex: 1 }}>
                    <div className="mono" style={{ fontSize: 9, color: p.color, letterSpacing: 1.2, textTransform: 'uppercase' }}>{p.title}</div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{p.kr}</div>
                    <div style={{ fontSize: 12, color: sec, marginTop: 2 }}>{p.desc}</div>
                  </div>
                  <Icon name="chevron" size={18} color={sec}/>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ position: 'relative', width: 160, height: 160, marginBottom: 30 }}>
              <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="70" fill="none" stroke={dark ? 'rgba(255,255,255,0.08)' : 'var(--line-2)'} strokeWidth="3"/>
                <circle cx="80" cy="80" r="70" fill="none" stroke={accent} strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 70}`}
                  strokeDashoffset={`${2 * Math.PI * 70 * (1 - progress / 100)}`}
                  transform="rotate(-90 80 80)" strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset .2s' }}/>
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span className="serif" style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.5 }}>{progress}%</span>
                <span className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, marginTop: 2 }}>GEMMA 4 E2B</span>
              </div>
            </div>
            <h1 className="serif" style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.4 }}>Tripis 설치 중</h1>
            <p style={{ marginTop: 10, fontSize: 13, color: sec, maxWidth: 260, lineHeight: 1.5 }}>
              2.4GB, Wi-Fi 권장. 설치 후에는 인터넷 없이도<br/>
              통역과 가이드가 가능해요.
            </p>
            <div style={{ marginTop: 24, display: 'flex', gap: 18, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: sec, letterSpacing: 1 }}>
              <span>· 140 LANG</span>
              <span>· OFFLINE</span>
              <span>· PRIVATE</span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <Icon name="check" size={44} color="#fff" strokeWidth={2.5}/>
            </div>
            <h1 className="serif" style={{ fontSize: 32, fontWeight: 700, margin: 0, letterSpacing: -0.6 }}>준비됐어요</h1>
            <p style={{ marginTop: 12, fontSize: 15, color: sec, maxWidth: 280, lineHeight: 1.6 }}>
              이제 어디든 함께해요.<br/>
              "트리피스, 어디로 떠날까?" 라고 말해보세요.
            </p>
          </div>
        )}
      </div>

      {/* footer button */}
      <div style={{ padding: '14px 24px 40px' }}>
        <button onClick={() => step < 3 ? setStep(step + 1) : onDone()}
          style={{
            width: '100%', height: 54, borderRadius: 16, border: 'none',
            background: step === 2 && progress < 100 ? (dark ? 'rgba(255,255,255,0.08)' : '#E5E0D5') : 'var(--ink)',
            color: step === 2 && progress < 100 ? sec : '#fff',
            fontSize: 16, fontWeight: 600, cursor: 'pointer', letterSpacing: -0.2,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
          disabled={step === 2 && progress < 100}>
          {step === 0 && '시작하기'}
          {step === 1 && '선택 완료'}
          {step === 2 && (progress < 100 ? '설치 중...' : '다음')}
          {step === 3 && '트리피스 시작'}
          {step !== 2 && <Icon name="chevron" size={16} color={step === 2 && progress < 100 ? sec : '#fff'}/>}
        </button>
      </div>
    </div>
  );
}

window.OnboardingScreen = OnboardingScreen;

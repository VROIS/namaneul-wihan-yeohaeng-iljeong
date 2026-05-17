// Variant C — Context hub. Location/situation detection drives home.
function VariantC_Home({ dark = false, tab, setTab }) {
  const text = dark ? '#fff' : 'var(--ink)';
  const sec = dark ? 'rgba(255,255,255,0.55)' : 'var(--muted)';
  const surface = dark ? 'rgba(255,255,255,0.04)' : '#fff';
  const line = dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid var(--line)';

  return (
    <div style={{ height: '100%', background: dark ? '#0B0B0D' : 'var(--bg)', color: text, display: 'flex', flexDirection: 'column' }}>
      <StatusBar dark={dark}/>
      <div style={{ padding: '8px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <TripiaLogo size={20} color={text} accent="var(--accent)"/>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ height: 32, padding: '0 10px', borderRadius: 10, background: surface, border: line, color: text, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="pin" size={12} color="var(--coral)"/>
            파리 · 1구
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 110px' }}>
        {/* context banner — detected */}
        <div style={{
          padding: 18, borderRadius: 22, marginBottom: 16,
          background: dark
            ? 'linear-gradient(135deg, rgba(66,133,244,0.18) 0%, rgba(66,133,244,0.06) 100%)'
            : 'linear-gradient(135deg, #E8EEF9 0%, #F4F7FD 100%)',
          border: dark ? '1px solid rgba(66,133,244,0.2)' : '1px solid rgba(66,133,244,0.14)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)', boxShadow: '0 0 0 4px rgba(66,133,244,0.22)' }}/>
            <span className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 600 }}>
              상황 감지 · 레스토랑
            </span>
          </div>
          <h2 className="serif" style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.4, lineHeight: 1.25 }}>
            Les Deux Magots에<br/>계시는 것 같아요
          </h2>
          <p style={{ fontSize: 13, color: sec, marginTop: 8, marginBottom: 14 }}>
            트리피스가 이 상황에 맞는 도움을 준비했어요.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--ink)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <Icon name="translate" size={14} color="#fff"/>
              메뉴 번역
            </button>
            <button style={{ padding: '10px 14px', borderRadius: 12, background: surface, color: text, border: line, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <Icon name="coins" size={14} color={text}/>
              팁 계산
            </button>
            <button style={{ padding: '10px 14px', borderRadius: 12, background: surface, color: text, border: line, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <Icon name="shield" size={14} color={text}/>
              알레르기
            </button>
          </div>
        </div>

        {/* situational modules */}
        <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 12 }}>지금 필요한 것</div>

        <Card dark={dark} pad={0} style={{ overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ display: 'flex' }}>
            <Placeholder label="메뉴 샷" w={90} h={112} r={0} hue="warm"/>
            <div style={{ flex: 1, padding: 14 }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--coral)', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 4 }}>AI 번역 준비됨</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>오늘의 메뉴 · Formule</div>
              <div style={{ fontSize: 12, color: sec, lineHeight: 1.5 }}>전채 + 메인 + 디저트 €28<br/>· 견과류 알레르기 1건 감지</div>
            </div>
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <Card dark={dark} pad={14}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Icon name="coins" size={18} color="var(--accent)"/>
              <span className="mono" style={{ fontSize: 9, color: sec, letterSpacing: 1 }}>EUR → KRW</span>
            </div>
            <div className="serif" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>€28 = ₩41,440</div>
            <div style={{ fontSize: 11, color: sec, marginTop: 2 }}>1€ = 1,480원 · 4.2h 전</div>
          </Card>
          <Card dark={dark} pad={14}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Icon name="clock" size={18} color="var(--accent)"/>
              <span className="mono" style={{ fontSize: 9, color: sec, letterSpacing: 1 }}>다음 일정</span>
            </div>
            <div className="serif" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>1h 24m</div>
            <div style={{ fontSize: 11, color: sec, marginTop: 2 }}>튀일리 정원 · 도보 12분</div>
          </Card>
        </div>

        {/* people nearby / safety */}
        <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 12 }}>안전 & 생활</div>
        <Card dark={dark} pad={14} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="shield" size={20} color="var(--success)"/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>이 구역 안전도 · 양호</div>
              <div style={{ fontSize: 12, color: sec, marginTop: 2 }}>관광지 · 소매치기 주의</div>
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, letterSpacing: 0.5 }}>87%</span>
          </div>
        </Card>
        <Card dark={dark} pad={14} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="bell" size={20} color="#F59E0B"/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>지하철 파업 · 내일 06시부터</div>
              <div style={{ fontSize: 12, color: sec, marginTop: 2 }}>4호선 · 대안 경로 3개 준비됨</div>
            </div>
            <Icon name="chevron" size={16} color={sec}/>
          </div>
        </Card>
        <Card dark={dark} pad={14}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(232,93,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="share" size={20} color="var(--coral)"/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>가족과 위치 공유 중</div>
              <div style={{ fontSize: 12, color: sec, marginTop: 2 }}>어머니 · 3시간 남음</div>
            </div>
            <div style={{ width: 36, height: 22, borderRadius: 11, background: 'var(--success)', position: 'relative' }}>
              <div style={{ position: 'absolute', width: 18, height: 18, borderRadius: 9, background: '#fff', top: 2, right: 2 }}/>
            </div>
          </div>
        </Card>
      </div>
      <TabBar tab={tab} setTab={setTab} dark={dark}/>
    </div>
  );
}

window.VariantC_Home = VariantC_Home;

// Variant B — Journey timeline as the hero
function VariantB_Home({ dark = false, tab, setTab }) {
  const text = dark ? '#fff' : 'var(--ink)';
  const sec = dark ? 'rgba(255,255,255,0.55)' : 'var(--muted)';
  const surface = dark ? 'rgba(255,255,255,0.04)' : '#fff';
  const line = dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid var(--line)';

  const items = [
    { t: '09:00', done: true, title: '카페 드 플로르', sub: '아침 · 크루아상 & 카페 알롱제', tag: '식사', hue: 'warm' },
    { t: '10:30', now: true, title: '루브르 박물관', sub: 'Porte des Lions 입구 · 대기 ~8분', tag: '관광', hue: 'neutral', ai: '트리피스: 2시간 머물기 추천. 모나리자는 Denon 1층.' },
    { t: '13:30', done: false, title: 'Les Deux Magots', sub: '점심 · 예약 필요 없음', tag: '식사', hue: 'warm' },
    { t: '15:00', done: false, title: '튀일리 정원', sub: '산책 · 셀카 포인트 3곳', tag: '관광', hue: 'cool' },
    { t: '19:00', done: false, title: 'Le Bouillon Chartier', sub: '저녁 · 오리 콩피 추천', tag: '식사', hue: 'warm' },
  ];

  return (
    <div style={{ height: '100%', background: dark ? '#0B0B0D' : 'var(--bg)', color: text, display: 'flex', flexDirection: 'column' }}>
      <StatusBar dark={dark}/>
      <div style={{ padding: '8px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <TripiaLogo size={20} color={text} accent="var(--accent)"/>
        <button style={{ width: 36, height: 36, borderRadius: 12, background: surface, border: line, color: text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="user" size={18} color={text}/>
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 20px 110px' }}>
        <div style={{ marginTop: 12, marginBottom: 18 }}>
          <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase' }}>DAY 3 / 5 · PARIS</div>
          <h1 className="serif" style={{ fontSize: 32, fontWeight: 700, margin: '6px 0 0', letterSpacing: -0.6, lineHeight: 1.15 }}>오늘의 여정</h1>
          <div style={{ fontSize: 13, color: sec, marginTop: 6 }}>5 stops · 도보 4.2km · €84</div>
        </div>

        {/* scrollable chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto' }}>
          {['전체', '식사', '관광', '이동', '숙소'].map((c, i) => (
            <Chip key={c} active={i === 0} dark={dark}>{c}</Chip>
          ))}
        </div>

        {/* timeline */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 18, top: 8, bottom: 8, width: 2, background: dark ? 'rgba(255,255,255,0.08)' : 'var(--line-2)' }}/>
          {items.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 14, position: 'relative' }}>
              <div style={{ flexShrink: 0, width: 38, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14 }}>
                <div style={{
                  width: s.now ? 16 : 12, height: s.now ? 16 : 12, borderRadius: 10, zIndex: 2,
                  background: s.now ? 'var(--coral)' : s.done ? 'var(--accent)' : (dark ? '#1a1a1a' : '#fff'),
                  border: s.done || s.now ? 'none' : (dark ? '2px solid rgba(255,255,255,0.15)' : '2px solid var(--line-2)'),
                  boxShadow: s.now ? '0 0 0 4px rgba(232,93,74,0.2)' : 'none',
                }}/>
              </div>
              <div style={{ flex: 1 }}>
                <Card dark={dark} pad={0} style={{
                  overflow: 'hidden',
                  border: s.now ? '1.5px solid var(--coral)' : line,
                  boxShadow: s.now ? '0 8px 24px rgba(232,93,74,0.12)' : 'none',
                }}>
                  <div style={{ display: 'flex' }}>
                    <Placeholder label={s.title} w={88} h={104} r={0} hue={s.hue} />
                    <div style={{ flex: 1, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1 }}>{s.t}</span>
                        <span style={{ fontSize: 9, padding: '3px 7px', borderRadius: 4, background: dark ? 'rgba(255,255,255,0.06)' : '#F1EEE8', color: sec, fontWeight: 600, letterSpacing: 0.3 }}>{s.tag}</span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2, marginBottom: 2 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: sec, lineHeight: 1.4 }}>{s.sub}</div>
                    </div>
                  </div>
                  {s.ai && (
                    <div style={{ padding: '10px 14px', borderTop: line, display: 'flex', gap: 8, alignItems: 'flex-start', background: dark ? 'rgba(66,133,244,0.06)' : 'rgba(66,133,244,0.04)' }}>
                      <Icon name="sparkle" size={14} color="var(--accent)"/>
                      <div style={{ fontSize: 12, color: text, lineHeight: 1.5 }}>{s.ai}</div>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          ))}
        </div>

        <button style={{
          width: '100%', height: 48, borderRadius: 14, marginTop: 4,
          background: 'transparent', border: `1.5px dashed ${dark ? 'rgba(255,255,255,0.15)' : 'var(--line-2)'}`,
          color: sec, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
        }}>
          <Icon name="plus" size={16} color={sec}/>
          일정 추가
        </button>

        <div style={{ marginTop: 24 }}>
          <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10 }}>다음 3일</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
            {[
              { d: 'DAY 4', c: '베르사유', stops: 4 },
              { d: 'DAY 5', c: '몽마르트', stops: 5 },
              { d: 'DAY 6', c: '공항 귀국', stops: 2 },
            ].map(d => (
              <Card key={d.d} dark={dark} pad={14} style={{ minWidth: 140, flexShrink: 0 }}>
                <div className="mono" style={{ fontSize: 9, color: sec, letterSpacing: 1.2 }}>{d.d}</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{d.c}</div>
                <div style={{ fontSize: 11, color: sec, marginTop: 2 }}>{d.stops} stops</div>
              </Card>
            ))}
          </div>
        </div>
      </div>
      <TabBar tab={tab} setTab={setTab} dark={dark}/>
    </div>
  );
}

window.VariantB_Home = VariantB_Home;

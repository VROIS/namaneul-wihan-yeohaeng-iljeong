// Shared screens — archive & profile, reused across variants

function ArchiveScreen({ dark = false, tab, setTab }) {
  const text = dark ? '#fff' : 'var(--ink)';
  const sec = dark ? 'rgba(255,255,255,0.55)' : 'var(--muted)';
  const line = dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid var(--line)';

  return (
    <div style={{ height: '100%', background: dark ? '#0B0B0D' : 'var(--bg)', color: text, display: 'flex', flexDirection: 'column' }}>
      <StatusBar dark={dark}/>
      <ScreenHeader title="여행 보관함" kicker="MEMORIES · 142 CAPTURES" dark={dark}
        right={<Icon name="search" size={20} color={text}/>}/>

      <div style={{ padding: '6px 20px 0', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {['전체', '파리 2024', '도쿄 2024', '부산 2023', '즐겨찾기'].map((c, i) => (
          <Chip key={c} active={i === 1} dark={dark}>{c}</Chip>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 110px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>DAY 3 · 10월 14일</div>
          <span className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1 }}>12 ITEMS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 22 }}>
          {['에펠탑', '카페 드 플로르', '지하철 6호선', '크루아상', '센 강', '루브르 피라미드'].map((l, i) => (
            <div key={l} style={{ position: 'relative' }}>
              <Placeholder label={l} w="100%" h={140} r={12} hue={i % 2 ? 'cool' : 'warm'}/>
              {i === 0 && <div style={{ position: 'absolute', top: 8, right: 8, padding: '3px 7px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', fontSize: 9, color: '#fff', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5 }}>TRIPIS</div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>DAY 2 · 10월 13일</div>
          <span className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1 }}>18 ITEMS</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {[0,1,2,3,4,5].map(i => (
            <Placeholder key={i} label="" w="100%" h={100} r={10} hue={i % 3 === 0 ? 'warm' : i % 3 === 1 ? 'cool' : 'neutral'}/>
          ))}
        </div>
      </div>
      <TabBar tab={tab} setTab={setTab} dark={dark}/>
    </div>
  );
}

function ProfileScreen({ dark = false, tab, setTab }) {
  const text = dark ? '#fff' : 'var(--ink)';
  const sec = dark ? 'rgba(255,255,255,0.55)' : 'var(--muted)';
  const line = dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid var(--line)';
  const surface = dark ? 'rgba(255,255,255,0.04)' : '#fff';

  return (
    <div style={{ height: '100%', background: dark ? '#0B0B0D' : 'var(--bg)', color: text, display: 'flex', flexDirection: 'column' }}>
      <StatusBar dark={dark}/>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 110px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <TripiaLogo size={20} color={text} accent="var(--accent)"/>
          <Icon name="settings" size={20} color={text}/>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 22 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg, var(--coral) 0%, var(--coral-deep) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 26, fontWeight: 700 }}>민</div>
          <div style={{ flex: 1 }}>
            <div className="serif" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>민지</div>
            <div style={{ fontSize: 12, color: sec, marginTop: 2 }}>First-time Explorer · 가입 62일</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 22 }}>
          {[{n:'4',l:'여행'},{n:'38',l:'일수'},{n:'412',l:'기억'}].map(s => (
            <Card key={s.l} dark={dark} pad={14} style={{ textAlign: 'center' }}>
              <div className="serif" style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>{s.n}</div>
              <div className="mono" style={{ fontSize: 9, color: sec, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>{s.l}</div>
            </Card>
          ))}
        </div>

        <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 12 }}>다녀온 곳</div>
        <Card dark={dark} pad={0} style={{ overflow: 'hidden', marginBottom: 22 }}>
          {[
            { city: '파리', date: '2024.10', day: '5일', now: true },
            { city: '도쿄', date: '2024.06', day: '4일' },
            { city: '부산', date: '2023.11', day: '3일' },
            { city: '제주', date: '2023.07', day: '2일' },
          ].map((t, i, a) => (
            <div key={t.city} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < a.length - 1 ? line : 'none' }}>
              <Placeholder label="" w={44} h={44} r={10} hue={i % 2 ? 'cool' : 'warm'}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{t.city} {t.now && <span style={{ fontSize: 10, color: 'var(--coral)', marginLeft: 6 }}>● 진행 중</span>}</div>
                <div style={{ fontSize: 11, color: sec, marginTop: 1 }}>{t.date} · {t.day}</div>
              </div>
              <Icon name="chevron" size={14} color={sec}/>
            </div>
          ))}
        </Card>

        <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 12 }}>트리피스 설정</div>
        <Card dark={dark} pad={0}>
          {[
            { icon: 'sparkle', label: 'AI 페르소나', val: 'First-time Explorer' },
            { icon: 'volume', label: '음성 스타일', val: '따뜻한 여성' },
            { icon: 'shield', label: '오프라인 모델', val: 'Gemma 4 · 2.4GB' },
            { icon: 'globe', label: '언어', val: '한국어 · 자동감지' },
          ].map((r, i, a) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: i < a.length - 1 ? line : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: dark ? 'rgba(255,255,255,0.04)' : '#F4EFE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={r.icon} size={16} color="var(--accent)"/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.label}</div>
              </div>
              <span style={{ fontSize: 12, color: sec, marginRight: 6 }}>{r.val}</span>
              <Icon name="chevron" size={14} color={sec}/>
            </div>
          ))}
        </Card>
      </div>
      <TabBar tab={tab} setTab={setTab} dark={dark}/>
    </div>
  );
}

Object.assign(window, { ArchiveScreen, ProfileScreen });

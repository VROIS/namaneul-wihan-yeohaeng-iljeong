// Variant A — Voice-first home
// The agent is the hero. Current journey is an ambient card below.

function VariantA_Home({ dark = false, tab, setTab }) {
  const text = dark ? '#fff' : 'var(--ink)';
  const sec = dark ? 'rgba(255,255,255,0.55)' : 'var(--muted)';

  return (
    <div style={{ height: '100%', position: 'relative', background: dark ? '#0B0B0D' : 'var(--bg)', color: text, display: 'flex', flexDirection: 'column' }}>
      <StatusBar dark={dark}/>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 0' }}>
        <TripiaLogo size={20} color={text} accent="var(--accent)"/>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: dark ? 'rgba(255,255,255,0.06)' : '#fff', color: text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bell" size={18} color={text}/>
          </button>
          <button style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: dark ? 'rgba(255,255,255,0.06)' : '#fff', color: text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="user" size={18} color={text}/>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 110px' }}>
        {/* greeting */}
        <div style={{ marginTop: 18, marginBottom: 20 }}>
          <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 }}>
            Paris · 화요일 오전
          </div>
          <h1 className="serif" style={{ fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: -0.6, lineHeight: 1.15 }}>
            좋은 아침,<br/>오늘은 루브르예요
          </h1>
        </div>

        {/* voice hero */}
        <div style={{
          position: 'relative', borderRadius: 26, padding: 24, marginBottom: 18,
          background: dark
            ? 'radial-gradient(circle at 20% 0%, rgba(232,93,74,0.22), transparent 55%), #161218'
            : 'radial-gradient(circle at 20% 0%, rgba(232,93,74,0.12), transparent 55%), #fff',
          border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid var(--line)',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--coral)', boxShadow: '0 0 0 4px rgba(232,93,74,0.18)' }}/>
            <span className="mono" style={{ fontSize: 10, color: 'var(--coral)', letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 600 }}>
              LISTENING · ALWAYS ON
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.4, letterSpacing: -0.3, marginBottom: 16 }}>
            "트리피스, 루브르 입구가<br/>어디야?"
          </div>
          {/* waveform */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 36, marginBottom: 14 }}>
            {[8,22,14,30,20,36,24,16,28,12,30,22,8,20,32,14,26,10,24,18,8].map((h,i) => (
              <div key={i} style={{
                width: 3, height: h, borderRadius: 2,
                background: `linear-gradient(to top, var(--coral), var(--coral-deep))`,
                opacity: 0.4 + (i % 3) * 0.2,
              }}/>
            ))}
          </div>
          <div style={{ fontSize: 13, color: sec, lineHeight: 1.5 }}>
            피라미드 입구는 줄이 길어요. Porte des Lions(라이언 문) 입구를 추천해요. 도보 4분.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={{
              flex: 1, height: 40, borderRadius: 12, border: 'none',
              background: 'var(--ink)', color: '#fff', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
            }}>
              <Icon name="route" size={14} color="#fff"/>
              길 안내
            </button>
            <button style={{
              width: 40, height: 40, borderRadius: 12,
              background: dark ? 'rgba(255,255,255,0.08)' : '#F1EEE8',
              border: 'none', color: text, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <Icon name="volume" size={16} color={text}/>
            </button>
            <button style={{
              width: 40, height: 40, borderRadius: 12,
              background: dark ? 'rgba(255,255,255,0.08)' : '#F1EEE8',
              border: 'none', color: text, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <Icon name="bookmark" size={16} color={text}/>
            </button>
          </div>
        </div>

        {/* current journey card */}
        <Card dark={dark} pad={0} style={{ overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="mono" style={{ fontSize: 9, color: sec, letterSpacing: 1.4, textTransform: 'uppercase' }}>진행 중인 여정 · DAY 3 / 5</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 3 }}>파리 5일 · 처음 혼자 떠나는 여행</div>
            </div>
            <Icon name="chevron" size={16} color={sec}/>
          </div>
          <div style={{ display: 'flex', gap: 0, padding: '0 16px 14px' }}>
            {[
              { t: '09:00', place: '카페 드 플로르', done: true },
              { t: '10:30', place: '루브르', now: true },
              { t: '14:00', place: '튀일리', done: false },
              { t: '19:00', place: 'Le Bouillon', done: false },
            ].map((s, i, a) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i < a.length - 1 && (
                  <div style={{ position: 'absolute', top: 7, left: '50%', right: '-50%', height: 1, background: s.done ? 'var(--accent)' : 'var(--line-2)' }}/>
                )}
                <div style={{
                  width: 14, height: 14, borderRadius: 7,
                  background: s.now ? 'var(--coral)' : s.done ? 'var(--accent)' : (dark ? 'rgba(255,255,255,0.15)' : '#E5E0D5'),
                  border: s.now ? '3px solid #fff' : 'none',
                  boxShadow: s.now ? '0 0 0 2px var(--coral)' : 'none',
                  zIndex: 2, marginBottom: 8,
                }}/>
                <div className="mono" style={{ fontSize: 9, color: sec, letterSpacing: 0.8 }}>{s.t}</div>
                <div style={{ fontSize: 11, fontWeight: s.now ? 600 : 500, color: s.now ? 'var(--coral)' : text, marginTop: 2, textAlign: 'center' }}>{s.place}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* quick actions */}
        <div style={{ marginBottom: 8 }}>
          <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 12 }}>빠른 도움</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { icon: 'translate', title: '메뉴판 번역', sub: '카메라로 비추기' },
              { icon: 'coins', title: '환율 계산', sub: '€1 = 1,480원' },
              { icon: 'shield', title: 'SOS', sub: '긴급 도움' },
              { icon: 'map', title: '길 찾기', sub: '지하철 · 도보' },
            ].map(a => (
              <Card key={a.title} dark={dark} pad={14} style={{ cursor: 'pointer' }}>
                <Icon name={a.icon} size={20} color="var(--accent)"/>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: sec, marginTop: 2 }}>{a.sub}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* recent captures */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase' }}>오늘의 기억</div>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>전체 보기</span>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
            {[
              { label: '에펠탑 · 09:14', hue: 'warm' },
              { label: '크루아상 · 09:45', hue: 'neutral' },
              { label: '지하철 6호선 · 10:02', hue: 'cool' },
            ].map(m => (
              <div key={m.label} style={{ flexShrink: 0 }}>
                <Placeholder label={m.label} w={140} h={180} r={14} hue={m.hue}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      <TabBar tab={tab} setTab={setTab} dark={dark}/>
    </div>
  );
}

// Variant A — Live camera screen
function VariantA_Live({ dark = true, tab, setTab }) {
  const text = '#fff';
  return (
    <div style={{ height: '100%', background: '#000', color: text, position: 'relative' }}>
      {/* fake camera feed */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #2a3140 0%, #1a1f2a 50%, #0b0e15 100%)' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 12px, rgba(255,255,255,0.03) 12px 13px)' }}/>
        <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translateX(-50%)', width: 120, height: 260, background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))', borderRadius: '50% 50% 8px 8px / 80% 80% 8px 8px' }}/>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to top, #000 0%, transparent 100%)' }}/>
      </div>

      <div style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <StatusBar dark/>

        {/* top bar */}
        <div style={{ padding: '8px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', backdropFilter: 'blur(8px)' }}>
            <Icon name="close" size={18} color="#fff"/>
          </button>
          <div style={{
            padding: '8px 14px', borderRadius: 999, background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--coral)', boxShadow: '0 0 0 3px rgba(232,93,74,0.3)' }}/>
            <span className="mono" style={{ fontSize: 10, letterSpacing: 1.3, color: '#fff' }}>LIVE · 2 FPS</span>
          </div>
          <button style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff' }}>
            <Icon name="settings" size={18} color="#fff"/>
          </button>
        </div>

        {/* AI overlay — top */}
        <div style={{
          margin: '20px 16px 0', padding: 16, borderRadius: 20,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="sparkle" size={14} color="#fff"/>
            </div>
            <span className="mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.3, textTransform: 'uppercase' }}>TRIPIS · 설명 중</span>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.55, color: '#fff' }}>
            이건 <strong style={{ color: 'var(--coral)' }}>에펠탑</strong>이에요. 1889년 만국박람회를 위해 지어졌고, 당시 파리 시민들은 "끔찍한 철탑"이라 불렀어요. 지금 보이는 방향은 남쪽이라 역광이라 사진은 조금 더 걸어가면 좋아요.
          </div>
        </div>

        <div style={{ flex: 1 }}/>

        {/* waveform + transcript */}
        <div style={{
          margin: '0 16px 16px', padding: '10px 16px', borderRadius: 16,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
            {[6,14,8,18,12,20,10,16,8].map((h,i) => (
              <div key={i} style={{ width: 2, height: h, background: 'var(--coral)', borderRadius: 1, opacity: 0.5 + (i % 2) * 0.4 }}/>
            ))}
          </div>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', flex: 1 }}>"사진 찍어줘"</span>
        </div>

        {/* 5 buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0 20px 110px' }}>
          {[
            { id: 'live', icon: 'signal', label: '라이브', active: true },
            { id: 'capture', icon: 'camera', label: '촬영', big: true },
            { id: 'upload', icon: 'image', label: '업로드' },
            { id: 'assistant', icon: 'globe', label: '여행비서' },
            { id: 'archive', icon: 'archive', label: '보관함' },
          ].map(b => (
            <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button style={{
                width: b.big ? 64 : 52, height: b.big ? 64 : 52, borderRadius: '50%',
                background: b.active ? 'var(--accent)' : (b.big ? '#fff' : 'rgba(0,0,0,0.55)'),
                border: b.big ? '3px solid rgba(255,255,255,0.3)' : 'none',
                backdropFilter: 'blur(12px)', color: b.big ? '#000' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                boxShadow: b.active ? '0 0 0 6px rgba(66,133,244,0.2)' : 'none',
              }}>
                <Icon name={b.icon} size={b.big ? 26 : 22} color={b.big ? '#000' : '#fff'}/>
              </button>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Voice full-screen overlay
function VariantA_Voice({ dark = false, tab, setTab }) {
  const text = dark ? '#fff' : 'var(--ink)';
  const sec = dark ? 'rgba(255,255,255,0.55)' : 'var(--muted)';
  return (
    <div style={{
      height: '100%', position: 'relative',
      background: dark
        ? 'radial-gradient(circle at 50% 40%, rgba(232,93,74,0.28) 0%, #0B0B0D 60%)'
        : 'radial-gradient(circle at 50% 40%, rgba(232,93,74,0.18) 0%, var(--bg) 60%)',
      color: text, display: 'flex', flexDirection: 'column',
    }}>
      <StatusBar dark={dark}/>
      <div style={{ padding: '8px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setTab('home')} style={{ width: 36, height: 36, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.06)' : '#fff', border: 'none', color: text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={18} color={text}/>
        </button>
        <div className="mono" style={{ fontSize: 10, color: 'var(--coral)', letterSpacing: 1.4, fontWeight: 600 }}>
          TRIPIS · LISTENING
        </div>
        <button style={{ width: 36, height: 36, borderRadius: 12, background: dark ? 'rgba(255,255,255,0.06)' : '#fff', border: 'none', color: text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="menu" size={18} color={text}/>
        </button>
      </div>

      {/* transcript */}
      <div style={{ flex: 1, padding: '40px 28px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
          <div className="mono" style={{ fontSize: 9, color: sec, letterSpacing: 1.3, marginBottom: 4, textAlign: 'right' }}>YOU · 10:23</div>
          <div style={{ padding: '12px 16px', background: 'var(--ink)', color: '#fff', borderRadius: '18px 18px 4px 18px', fontSize: 15, lineHeight: 1.5 }}>
            메뉴판 번역해줘
          </div>
        </div>
        <div style={{ maxWidth: '85%' }}>
          <div className="mono" style={{ fontSize: 9, color: sec, letterSpacing: 1.3, marginBottom: 4 }}>TRIPIS · 10:23</div>
          <div style={{ padding: '14px 16px', background: dark ? 'rgba(255,255,255,0.06)' : '#fff', borderRadius: '18px 18px 18px 4px', fontSize: 15, lineHeight: 1.55, border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid var(--line)' }}>
            카메라로 메뉴판을 비춰주세요. <strong style={{ color: 'var(--coral)' }}>알레르기 정보</strong>도 함께 알려드릴게요.
            <button style={{ marginTop: 10, width: '100%', height: 40, borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
              <Icon name="camera" size={14} color="#fff"/>
              카메라 열기
            </button>
          </div>
        </div>
      </div>

      {/* orb */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 40 }}>
        <div style={{
          width: 140, height: 140, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, var(--coral) 0%, var(--coral-deep) 60%, #6e1b12 100%)',
          boxShadow: '0 0 80px rgba(232,93,74,0.5), inset -10px -15px 40px rgba(0,0,0,0.25), inset 15px 20px 40px rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {[20,40,28,50,34,44,24].map((h,i) => (
              <div key={i} style={{ width: 4, height: h, background: 'rgba(255,255,255,0.85)', borderRadius: 2 }}/>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 14, color: sec, marginTop: 18 }}>탭하여 중지 · 길게 눌러 설정</div>
      </div>
    </div>
  );
}

Object.assign(window, { VariantA_Home, VariantA_Live, VariantA_Voice });

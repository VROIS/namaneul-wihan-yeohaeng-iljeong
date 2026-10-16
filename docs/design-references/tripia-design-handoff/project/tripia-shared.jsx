// Shared primitives: logo, icons, placeholder, context

const TripiaContext = React.createContext({});
const useTripia = () => React.useContext(TripiaContext);

// ─────────────────────────────────────────────────────────────
// Logo — uses the uploaded Tripis mark (winged eye + T)
// ─────────────────────────────────────────────────────────────
const TRIPIS_LOGO_SRC = 'assets/tripis-mark.png';

function TripiaLogo({ size = 22, color = 'var(--ink)', accent = 'var(--accent)', variant = 'inline', brand = 'Tripis' }) {
  // The mark has a 400:290 aspect — render by height = size*1.4 to keep wings visible
  const markH = Math.round(size * 1.35);
  const markW = Math.round(markH * (400 / 290));
  const mark = (
    <img src={TRIPIS_LOGO_SRC} alt="Tripis"
      style={{ height: markH, width: markW, objectFit: 'contain', display: 'block', flexShrink: 0 }}/>
  );
  if (variant === 'mark') return mark;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {mark}
      <span style={{
        fontSize: size * 1.0, fontWeight: 700, letterSpacing: -0.6,
        color, lineHeight: 1,
      }}>{brand}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Icon set — consistent 1.75 stroke line icons
// ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = 20, color = 'currentColor', fill = 'none', strokeWidth = 1.75 }) => {
  const s = { width: size, height: size, stroke: color, strokeWidth, fill, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    mic: <g><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></g>,
    camera: <g><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></g>,
    image: <g><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></g>,
    globe: <g><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></g>,
    archive: <g><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11h14V8M10 12h4"/></g>,
    signal: <g><path d="M4 10l4-4M4 10l4 4M20 10l-4-4M20 10l-4 4M12 3v18"/></g>,
    map: <g><path d="M3 6l6-2 6 2 6-2v16l-6 2-6-2-6 2z"/><path d="M9 4v16M15 6v16"/></g>,
    compass: <g><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" fill={color} fillOpacity="0.1"/></g>,
    plus: <g><path d="M12 5v14M5 12h14"/></g>,
    chevron: <path d="M9 6l6 6-6 6"/>,
    chevronDown: <path d="M6 9l6 6 6-6"/>,
    back: <path d="M15 6l-6 6 6 6"/>,
    search: <g><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></g>,
    settings: <g><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-1.4 3.4 2 2 0 0 1-1.4-.6l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></g>,
    user: <g><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></g>,
    bell: <g><path d="M18 16V11a6 6 0 0 0-12 0v5l-2 2h16zM10 20a2 2 0 0 0 4 0"/></g>,
    pin: <g><path d="M12 21s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></g>,
    clock: <g><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></g>,
    plane: <path d="M3 13l4-1 5-6 2 1-2 5 5 2 3-1 1 2-4 3-1 4-2-1v-4l-6 2-1 3-2-1 1-4-3-2z"/>,
    route: <g><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 9v4a3 3 0 0 0 3 3h6"/></g>,
    translate: <g><path d="M3 5h9M7 3v2M4 5c0 4 3 7 7 8M10 8c0 3-3 5-7 6"/><path d="M13 20l4-9 4 9M15 17h4"/></g>,
    shield: <g><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></g>,
    coins: <g><circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/></g>,
    sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/>,
    close: <path d="M6 6l12 12M18 6L6 18"/>,
    check: <path d="M5 12l5 5 9-11"/>,
    play: <path d="M7 5v14l12-7z" fill={color}/>,
    volume: <g><path d="M5 9h3l4-3v12l-4-3H5z"/><path d="M17 8a5 5 0 0 1 0 8M15 10a3 3 0 0 1 0 4"/></g>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>,
    bookmark: <path d="M6 4h12v17l-6-4-6 4z"/>,
    share: <g><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 11l8-4M8 13l8 4"/></g>,
  };
  return <svg {...s} viewBox="0 0 24 24">{paths[name] || null}</svg>;
};

// ─────────────────────────────────────────────────────────────
// Striped image placeholder
// ─────────────────────────────────────────────────────────────
function Placeholder({ label, w = '100%', h = 180, r = 16, hue = 'warm', stripe = true }) {
  const bg = hue === 'warm'
    ? 'linear-gradient(135deg, #EFE9DF 0%, #E4DCCF 100%)'
    : hue === 'cool'
      ? 'linear-gradient(135deg, #E2E8EE 0%, #D3DCE4 100%)'
      : 'linear-gradient(135deg, #F1EEE8 0%, #E8E3D9 100%)';
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: bg,
      backgroundImage: stripe
        ? `repeating-linear-gradient(135deg, transparent 0 9px, rgba(0,0,0,0.035) 9px 10px), ${bg}`
        : bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(26,26,26,0.5)', fontSize: 11,
      fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.3,
      textTransform: 'uppercase', overflow: 'hidden', flexShrink: 0,
    }}>
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// iOS-style status bar (light / dark aware)
// ─────────────────────────────────────────────────────────────
function StatusBar({ dark = false }) {
  const c = dark ? '#fff' : '#0B0B0B';
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 28px 6px', fontSize: 15, fontWeight: 600, color: c,
      position: 'relative', zIndex: 10,
    }}>
      <span style={{ letterSpacing: -0.2 }}>9:41</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <svg width="17" height="11" viewBox="0 0 17 11"><g fill={c}><rect x="0" y="7" width="3" height="4" rx="0.6"/><rect x="4.5" y="5" width="3" height="6" rx="0.6"/><rect x="9" y="2.5" width="3" height="8.5" rx="0.6"/><rect x="13.5" y="0" width="3" height="11" rx="0.6"/></g></svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill={c}><path d="M7.5 2.5c2 0 3.9.8 5.3 2.2L14 3.4A9 9 0 0 0 7.5 1 9 9 0 0 0 1 3.4l1.2 1.3A7.5 7.5 0 0 1 7.5 2.5z"/><circle cx="7.5" cy="9" r="1.2"/></svg>
        <svg width="25" height="11" viewBox="0 0 25 11"><rect x="0.5" y="0.5" width="21" height="10" rx="2.5" stroke={c} fill="none" strokeOpacity="0.45"/><rect x="2" y="2" width="18" height="7" rx="1.5" fill={c}/><path d="M23 3.5v4c.7-.2 1-.8 1-2s-.3-1.8-1-2z" fill={c} fillOpacity="0.45"/></svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Phone frame — simpler than IOSDevice, fits our content
// ─────────────────────────────────────────────────────────────
function Phone({ children, dark = false, label, W = 390, H = 810 }) {
  const bg = dark ? '#0B0B0D' : 'var(--bg)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      {label && (
        <div style={{
          fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase',
        }}>{label}</div>
      )}
      <div style={{
        width: W, height: H, borderRadius: 48,
        background: bg, overflow: 'hidden', position: 'relative',
        boxShadow: '0 1px 0 rgba(255,255,255,0.5) inset, 0 50px 90px rgba(20,15,5,0.13), 0 0 0 10px #111, 0 0 0 11px #2a2a2a',
        fontFamily: 'inherit',
      }}>
        {/* dynamic island */}
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          width: 120, height: 34, borderRadius: 20, background: '#000', zIndex: 60,
        }} />
        {children}
        {/* home indicator */}
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          width: 134, height: 5, borderRadius: 3,
          background: dark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.35)', zIndex: 80, pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom tab bar — 5 icons, center FAB-like voice
// ─────────────────────────────────────────────────────────────
function TabBar({ tab, setTab, dark = false }) {
  const tabs = [
    { id: 'home', icon: 'compass', label: '여정' },
    { id: 'live', icon: 'camera', label: '라이브' },
    { id: 'voice', icon: 'mic', label: null }, // center, big
    { id: 'archive', icon: 'bookmark', label: '보관함' },
    { id: 'profile', icon: 'user', label: '프로필' },
  ];
  const inactive = dark ? 'rgba(255,255,255,0.55)' : '#9CA3AF';
  const active = dark ? '#fff' : 'var(--ink)';
  const bg = dark ? 'rgba(20,18,22,0.85)' : 'rgba(255,253,250,0.9)';
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50,
      backdropFilter: 'blur(24px) saturate(160%)',
      WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      background: bg,
      borderTop: dark ? '1px solid rgba(255,255,255,0.07)' : '1px solid var(--line)',
      padding: '10px 14px 26px',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    }}>
      {tabs.map(t => {
        if (t.id === 'voice') {
          const isActive = tab === 'voice';
          return (
            <button key={t.id} onClick={() => setTab('voice')}
              style={{
                width: 52, height: 52, borderRadius: '50%',
                background: isActive
                  ? 'linear-gradient(160deg, var(--coral) 0%, var(--coral-deep) 100%)'
                  : 'linear-gradient(160deg, var(--ink) 0%, #000 100%)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', marginTop: -24,
                boxShadow: isActive
                  ? '0 8px 22px rgba(232,93,74,0.45), inset 0 1px 0 rgba(255,255,255,0.2)'
                  : '0 6px 18px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}>
              <Icon name="mic" size={22} color="#fff" strokeWidth={2} />
            </button>
          );
        }
        const isActive = tab === t.id;
        return (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '4px 10px',
              color: isActive ? active : inactive,
              fontSize: 10, fontWeight: 600, letterSpacing: 0.2,
            }}>
            <Icon name={t.icon} size={22} color={isActive ? active : inactive} strokeWidth={isActive ? 2 : 1.6} />
            {t.label && <span>{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Small header used above screens
// ─────────────────────────────────────────────────────────────
function ScreenHeader({ title, kicker, dark = false, right = null }) {
  const text = dark ? '#fff' : 'var(--ink)';
  const sec = dark ? 'rgba(255,255,255,0.55)' : 'var(--muted)';
  return (
    <div style={{ padding: '12px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <div>
        {kicker && (
          <div className="mono" style={{ fontSize: 10, color: sec, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 }}>
            {kicker}
          </div>
        )}
        <h1 className="serif" style={{ margin: 0, fontSize: 28, fontWeight: 700, color: text, letterSpacing: -0.5, lineHeight: 1.15 }}>
          {title}
        </h1>
      </div>
      {right}
    </div>
  );
}

// Chip
function Chip({ children, active = false, onClick, dark = false, tone = 'default' }) {
  const bg = active
    ? (tone === 'accent' ? 'var(--accent)' : 'var(--ink)')
    : (dark ? 'rgba(255,255,255,0.06)' : '#fff');
  const fg = active ? '#fff' : (dark ? 'rgba(255,255,255,0.75)' : 'var(--ink)');
  const border = active ? 'transparent' : (dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid var(--line)');
  return (
    <button onClick={onClick} style={{
      background: bg, color: fg, border,
      padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
      cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: -0.1,
    }}>{children}</button>
  );
}

// Card
function Card({ children, dark = false, pad = 16, style = {} }) {
  return (
    <div style={{
      background: dark ? 'rgba(255,255,255,0.04)' : 'var(--surface)',
      border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid var(--line)',
      borderRadius: 20, padding: pad,
      ...style,
    }}>{children}</div>
  );
}

Object.assign(window, {
  TripiaContext, useTripia, TripiaLogo, Icon, Placeholder, Phone, TabBar, StatusBar, ScreenHeader, Chip, Card,
});

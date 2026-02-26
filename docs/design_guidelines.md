# VibeTrip Design Guidelines (Compacted)

## Authentication & User Flow

**Required:** Yes - SSO via Apple/Google Sign-In

**Onboarding:** Post-login persona selection:
- **Experience Luxury** (MZ/VIP): Luxury, time-saving, photogenic
- **Practical Comfort** (50s/Family): Safety, verified dining, energy conservation

**Profile:** Avatar (2 presets: sophisticated/luxury, warm/family), display name, persona switcher, travel preferences, trip history. Settings → Account → Delete (double confirm).

---

## Navigation Structure

**4-Tab Bottom Navigation:**
1. **Discover** - Vibe-based exploration
2. **Map** - Route visualization
3. **Plan** (FAB) - Itinerary creation
4. **Profile** - Settings & history

**Tab Bar:** Bottom, translucent blur, Feather icons, FAB center-elevated above bar

**Modals:** Destination detail, itinerary editor, route comparison, reality alerts, video player

---

## Screen Layouts

### Discover (Home)
- **Header (transparent):** Avatar left → Search "어디로 떠나볼까요?" center → Filter right | Top: headerHeight + 24px
- **Content:** Horizontal Vibe chips → Masonry grid destination cards (16:10 images, Vibe badge overlay, parallax scroll)
- **Bottom:** tabBarHeight + 24px

### Map
- **Header (transparent/sliding):** Back left → Layer toggle right | Top: headerHeight + 24px
- **Content:** Full-screen map with color-coded markers (High 8-10: purple-pink gradient, Mid 5-7: orange-yellow, Low <5: gray) + route polylines
- **Bottom Sheet:** Draggable (collapsed/half/expanded) with route timeline | Collapsed bottom: tabBarHeight + 24px

### Plan (FAB Modal)
- **Header:** Cancel left → "새 여정 만들기" center | Top: 24px
- **Content:** Destination autocomplete, date picker, travel style segmented control, budget slider, persona suggestions
- **Footer (fixed):** "여정 생성" button | Bottom: insets.bottom + 24px

### Profile
- **Header:** "프로필" center → Settings right | Top: 24px
- **Content:** User card, travel stats, saved destinations (horizontal scroll), trip history list
- **Bottom:** tabBarHeight + 24px

### Destination Detail (Modal)
- **Header (transparent blur):** Back (white/shadow) left → Save right | Top: headerHeight + 24px
- **Content:** Hero carousel (16:9) → Vibe score circle → Tags → Gemini AI summary → Reality checks → Photo gallery
- **Bottom:** insets.bottom + 24px

---

## Design System

### Colors
**Primary:** Purple `#8B5CF6`, Pink `#EC4899`, Gradient (purple→pink)  
**Neutrals:** BG `#FFFFFF`, Surface `#F9FAFB`, Border `#E5E7EB`, Text `#111827`/`#6B7280`/`#9CA3AF`  
**Semantic:** Success `#10B981`, Warning `#F59E0B`, Danger `#EF4444`, Info `#3B82F6`  
**Persona:** Luxury Gold `#F59E0B`, Comfort Blue `#3B82F6`

### Typography (System: SF Pro/Roboto)
- Display: 32px Bold, -0.5px tracking
- H1: 24px Bold, -0.25px | H2: 20px Semibold | H3: 16px Semibold
- Body: 16px Regular, 24px line | Small: 14px, 20px line
- Caption: 12px Medium, 16px line | Label: 14px Medium

### Spacing
xs:4px | sm:8px | md:12px | lg:16px | xl:24px | 2xl:32px | 3xl:48px

### Components

**Cards:** 16px radius, 16px padding, white BG, 1px border. Elevated: shadow(0,4,0.08,12)

**Buttons:** 
- Primary: Purple gradient, white text, 48px H, 16px radius, bold
- Secondary: White BG, purple border/text, 48px H
- Active: scale(0.95), no shadow standard

**FAB:** 56px circle, purple→pink gradient, white icon, center-bottom 16px above tabs, shadow(0,2,0.10,2)

**Inputs:** 48px H, 1px border (12px radius), 12px H-padding, purple focus

**Vibe Badge:** 48px circle, gradient by score, white bold 18px, absolute top-right

**Tab Bar:** 56px+inset H, white 80% opacity blur, 24px icons (gradient active, gray inactive), 11px medium labels

---

## Assets Required

**Avatars (2):** Luxury (geometric gold/purple), Comfort (friendly blue/green)

**Vibe Icons (8-10, 2px line art, purple):**
- 몽환적인 (cloud/star) | 힙한 (lightning) | 클래식한 (column) | 로맨틱한 (heart) | 모험적인 (compass)

**Empty States:** Map pin (no destinations), suitcase (no trips), compass (no results)

**Icons:** Feather (@expo/vector-icons) for UI, custom for Vibe categories, gradient markers for map

---

## Interactions & Animation

**Touch:** Scale 0.98 + haptic (light), cards increase shadow, buttons 90% opacity

**Transitions:** Stack slide-right, modal slide-up (bounce), tab crossfade 200ms

**Content:** Cards stagger fade-in (50ms), map markers drop-in, bottom sheet spring, Vibe badge circular progress

**Loading:** Skeleton screens, shimmer effect, purple gradient spinner (AI)

---

## Safe Area Handling

- **Discover (transparent header + tabs):** Top: headerHeight+24px | Bottom: tabBarHeight+24px
- **Map (full screen + bottom sheet):** Bottom sheet respects tab bar
- **Profile (standard header + tabs):** Top: 24px | Bottom: tabBarHeight+24px
- **Modals (no tabs):** Top: 24px | Bottom: insets.bottom+24px

---

## Critical Patterns

**Vibe Scoring:** 8-10 High (purple-pink), 5-7 Mid (orange-yellow), <5 Low (gray)

**Persona Adaptation:** Luxury = gold accents/time-optimized, Comfort = blue accents/safety-first

**Reality Checks:** Weather (green/yellow/red), safety alerts, crowd levels overlay on destinations

**Gemini Integration:** AI summaries, Vision photo analysis, personalized suggestions by persona
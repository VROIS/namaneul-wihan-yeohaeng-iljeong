# BTS Mini-App — FlutterFlow Designer Prompt

> **Context**: Design a BTS World Tour 2026 travel mini-app. The landing page and world map are already built. Design all screens from character selection to final itinerary.
> **Style**: Minimal, premium, Apple HIG level. Image = Button. No emoji anywhere. Text-minimal. No generic CTA buttons like "Start your journey" — use progressive gauge bars and image taps instead.
> **Phone**: iPhone 15 Pro frame (393 x 852)
> **Language in UI**: Korean text placeholders are provided in romanized descriptions. Use placeholder text blocks in the design — actual Korean text will be injected during development.

---

## DESIGN SYSTEM

### Colors
- **Light Background**: `#FFFFFF` (Screen C only)
- **Dark Gradient**: `#1E1040` to `#05050A` (Screens D, E, F, G)
- **Arirang Purple**: `#6C2DC7` (brand primary)
- **Neon Purple**: `#A855F7` (highlights, gauge, selection)
- **Army Gold**: `#D4AF37` (badges, accents)
- **Glass Border**: `rgba(255, 255, 255, 0.1)`
- **Glass Background**: `rgba(255, 255, 255, 0.05)`
- **Text Primary (dark)**: `#F5F0EB`
- **Text Primary (light)**: `#1A1A1A`
- **Text Secondary**: `#9B95A8`

### Character Gradients (used for avatar borders and card accents)
| Character | Persona | Gradient |
|-----------|---------|----------|
| REALM | Culture collector | `#0D7377` to `#064E4F` (Teal) |
| VEIL | Romantic wanderer | `#C74B7A` to `#8E2E55` (Rose) |
| HYPE | Trend explorer | `#E8720C` to `#B85A09` (Orange) |
| SURGE | Adventure seeker | `#2563EB` to `#1D4ED8` (Blue) |
| SHINE | Caring companion | `#6B9E78` to `#4A7A58` (Green) |
| SAVOR | Luxury recharger | `#D97706` to `#B45309` (Amber) |
| STILL | Minimal chiller | `#64748B` to `#475569` (Slate) |

### Typography
- **Heading**: Pretendard Bold, 24px
- **Subheading**: Pretendard SemiBold, 20px
- **Body**: Pretendard Regular, 16px
- **Caption**: Pretendard Medium, 13px
- **English Title**: SpaceGrotesk Bold

### Components
- **Card radius**: 16-20px, subtle shadow `(0, 2, 8, rgba(0,0,0,0.08))`
- **Touch feedback**: scale 0.97 on press
- **Minimum touch area**: 44px (Apple HIG)
- **Frosted glass**: blur 20px + rgba background + 1px border
- **Spring animation**: damping 15-20

---

## SCREEN C: CHARACTER SELECTION

### Description
Full-screen character selection. 7 anime-style illustrated characters arranged in a natural, organic circular cluster. A single question text sits below the group: "Who do you want to travel with?" (displayed in Korean in production). Clean white background. **No buttons at all** — tapping a character avatar IS the selection. Nothing else on screen.

### Layout Reference
Based on approved mockup: 7 characters gathered in a natural, organic circular cluster — NOT a symmetrical grid. Some avatars higher, some lower, like friends casually standing together in a group. The question text sits below the group.

### Visual Description
Imagine 7 friends standing in a loose circle, viewed from above. They are not evenly spaced — some overlap slightly, some are offset. The arrangement feels human and organic, like a group photo formation:

- **Top area**: 1 character (slightly centered-top)
- **Upper-middle**: 2 characters (left and right, slightly asymmetric)
- **Middle**: 2 characters (wider apart, flanking the center space)
- **Lower-middle**: 2 characters (closer together)
- **Below the group**: Question text (3 lines, centered)

The avatars should feel like they are floating and gathered — not snapped to a grid. Vary the vertical positions slightly (plus/minus 10-15px random offset) for organic feel.

### Specifications
- **Background**: Pure white `#FFFFFF`, clean, no decoration
- **7 circular avatars**: 
  - Size: 72-80px diameter each (slightly varied sizes OK for depth)
  - Circular mask with 2px gradient border (character-specific color from table above)
  - Content: Anime-style character bust illustration (manga aesthetic, shoulders up)
  - Organic circular cluster — NOT evenly spaced on a perfect circle
  - Each avatar positioned with slight random offset for natural feel
  - Subtle drop shadow for floating effect
  - Each avatar is tappable (image = button)
- **Question text**: Placeholder text block, 3 lines
  - Pretendard Bold 24px, `#1A1A1A`
  - Center-aligned
  - Positioned below the character cluster (not inside it)
  - This is the ONLY text on screen
- **Selection state**:
  - Selected avatar: scale 1.3x + gradient border glow (3px) + elevation shadow
  - Other 6 avatars: opacity 0.35, scale 0.85, slight blur
  - Selected avatar moves slightly toward center
- **Transition**: 0.5s after selection, slide to Screen D
- **No header, no footer, no buttons, no navigation bar, no back button**
- **Nothing else on screen** — just avatars + one question

### Characters (7 avatars, clockwise from top)
1. **REALM** — Teal gradient border — Culture/Art persona
2. **VEIL** — Rose gradient border — Romantic persona  
3. **HYPE** — Orange gradient border — Trendy/SNS persona
4. **SURGE** — Blue gradient border — Adventure persona
5. **SHINE** — Green gradient border — Healing/Caring persona
6. **SAVOR** — Amber gradient border — Luxury persona
7. **STILL** — Slate gradient border — Chill/Minimal persona

---

## SCREEN D: PLACE SELECTION

### Description
The selected character is the HERO — displayed as a large, prominent 3D card in the center. 8 recommended travel spots orbit around the character as circular photo thumbnails, scattered organically. User taps place photos to select/deselect (2-8 picks). A progressive gauge bar at the bottom fills with each selection. The character is the star, places are supporting elements.

### Layout Reference
Based on approved mockup: Think of a movie poster — the main character dominates the center, and around them, circular glimpses of the world they will explore. The place photos are scattered at varying distances and angles — some closer, some further, some overlapping the card edge slightly. It feels like the character's world is unfolding around them.

### Visual Description
- **Top**: Title text showing the character archetype journey name (e.g., "Romanticist's Journey")
- **Center**: Large character card (the hero, dominant, 3D depth)
- **Surrounding**: 8 circular place photos, scattered organically around the card
  - Some photos slightly overlap the card edges
  - Varying distances from center (not uniform radius)
  - Varying sizes (50-70px) for depth and perspective
- **Bottom**: Progressive gauge bar + city selector chips

### Specifications
- **Background**: Purple gradient `#1E1040` to `#05050A`
- **Title**: Character archetype journey name — Pretendard SemiBold 20px, `#F5F0EB`, center
- **Center character card (HERO)**:
  - Size: approximately 200 x 280px (dominant, takes center stage)
  - Content: Full character illustration, name + archetype label below
  - Style: 3D card (Layla-style) — slight perspective tilt, layered shadow, depth
  - Glassmorphism border with character-specific gradient
  - Elevated feel — card floats above the place photos
  - Not tappable (display only)
- **8 place thumbnails (scattered around hero)**:
  - Size: varying 50-70px diameter (closer = larger, further = smaller for depth)
  - Content: Real place photos (circular mask)
  - Organic scatter — NOT a perfect circle. Vary distance from center (120-170px)
  - Some photos slightly overlap or peek behind the character card edge
  - Subtle drop shadow for floating feel
  - Each photo IS a button — tap to select/deselect (toggle)
  - Selected: Neon purple border `#A855F7` 3px + subtle glow + slight scale-up
  - Unselected: opacity 0.45, slightly desaturated
  - Tap animation: scale 0.93 to 1.05 to 1.0 spring bounce
- **Progressive gauge bar** (bottom, fixed):
  - Full width minus 48px padding
  - Track: `rgba(255, 255, 255, 0.08)`, height 5px, pill radius
  - Fill: Neon purple gradient `#A855F7` to `#6C2DC7`
  - Width = (selectedCount / 8) * 100%
  - Right side text: "3/8" — Caption 13px, `#9B95A8`
  - Under 2 selections: gray fill (cannot proceed)
  - 2 or more selections: purple fill (proceed-ready)
  - At 8/8: auto-advance or pulse animation
- **City selector** (above gauge or below title):
  - Horizontal scroll chips
  - Pill shape (999px radius), 32px height
  - Active: purple fill `#A855F7` + white text
  - Inactive: glass background + `#9B95A8` text
- **No CTA button** — gauge bar filling IS the progress indicator

### Place Data (per thumbnail)
- Photo from API (imageUrl)
- On long-press or info tap: brief popup showing place name + price (optional)
- seedCategory determines the color accent of the selection overlay

---

## SCREEN E: LOADING + BGM

### Description
Dark immersive loading screen with a neon ring animation and sequential status messages. Background music (matched to character Vibe) plays automatically. This screen shows while the AI generates the optimized itinerary.

### Layout
- Dark solid background
- Center: Neon purple gradient ring, rotating and pulsing
- Below ring: Sequential status messages (5 stages)
- Bottom: City name, character name, selected place count

### Specifications
- **Background**: `#05050A` solid
- **Neon ring**: 
  - Size: approximately 120px diameter
  - Purple gradient ring (stroke only, not filled)
  - Animation: 360 degree rotation (1.2s linear, infinite) + pulse (scale 1.0 to 1.1, 1.6s)
  - Center: small character avatar or abstract icon
- **Loading messages** (5 stages, 1.2s each, fade-in from below):
  1. "Syncing vibe..." (placeholder for Korean text)
  2. "Optimizing route..." 
  3. "Local info scan complete!"
  4. "Weather and transit checked"
  5. "Final route generated"
  - Pretendard Medium 16px, `#F5F0EB`
  - Each message slides in from below with fade
- **Info line**: "City · Character · N spots"
  - Caption 13px, `#9B95A8`
- **BGM indicator**: Small music note icon + "Playing" (subtle, bottom corner)
- **No skip button, no progress bar** — just immersive waiting

### BGM Mapping
| Character | Vibe | Music Genre |
|-----------|------|-------------|
| REALM | Culture | Jazz / Acoustic |
| VEIL | Romantic | Piano / Emotional |
| HYPE | Hotspot | EDM / Pop |
| SURGE | Adventure | Rock / Upbeat |
| SHINE | Healing | Ambient / Nature |
| SAVOR | Luxury | Lounge / Bossa nova |
| STILL | Chill | Lo-fi / Jazz hip-hop |

---

## SCREEN F: SHORTFORM PREVIEW

### Description
Full-screen vertical video-style preview. Each scene = one selected place. The character appears as an animated overlay on the place photo background. A first-person dialogue bubble explains why this place was chosen. Swipe horizontally to navigate between scenes.

### Key Rule
Number of selected places = Number of scenes.
4 places selected = 4 scenes. 8 places = 8 scenes.

### Layout (per scene)
- Fullscreen place photo as background with Ken Burns slow zoom effect
- Character animation overlay (lower-center or lower-left, approximately 150px height)
- Dialogue bubble (semi-transparent dark background, white text, bottom-center)
- Scene indicator dots (horizontal, filled = current, empty = remaining)
- Horizontal swipe navigation between scenes

### Specifications
- **Background**: Place photo, fullscreen, Ken Burns slow zoom
- **Character overlay**: 
  - Animated character (Rive or Remotion render)
  - Position: lower-center or lower-left
  - Size: approximately 150px height
  - Action matched to place category:
    - attraction: amazed, photographing, pointing
    - healing: sitting, walking, waving
    - restaurant: eating, sitting
    - hotspot: selfie, photographing, pointing
    - adventure: walking, riding, amazed
- **Dialogue bubble**:
  - Semi-transparent dark background `rgba(0, 0, 0, 0.6)`, rounded 16px
  - White text, Pretendard Medium 16px
  - Max 2 lines
  - Bottom-center position
- **Scene dots**: horizontal indicator dots
- **Navigation**: Horizontal swipe between scenes
- **BGM**: Continues from Screen E without interruption
- **After last scene**: Action to proceed to Screen G

### Dialogue Examples (for placeholder text)
- VEIL at Eiffel Tower: "The golden hour here is pure magic..."
- SURGE at Seine River: "They have kayak tours! See the tower from the water!"
- STILL at Montmartre: "Just sit on the steps and watch the world go by"

---

## SCREEN G: FINAL ITINERARY

### Description
The generated day plan displayed as 3D Layla-style cards in a timeline. Each time slot is a card with place photo, time, name, price, and the character selection reason. Cards should feel premium and dimensional — like physical cards floating with depth.

### Layout
- Frosted glass header: close (X) left + title center + share icon right
- Horizontal reel cards: snap scroll, 75% screen width, 3D tilt and parallax
- Vertical timeline: purple dots with connector lines
- Summary card: spot count + estimated hours + total cost
- Bottom actions: restart (secondary) + share (primary gradient)

### Specifications
- **Header**: Frosted glass effect, height 56px
  - Left: X icon (close/restart)
  - Center: Title text (e.g., "My BTS Tour - Goyang")
  - Right: Share icon
- **Reel cards** (horizontal scroll):
  - Width: 75% of screen width
  - Snap scroll behavior
  - Content: Place photo (top 60%), time + name + category badge (bottom 40%)
  - Style: 3D card — slight tilt, layered shadow, Layla aesthetic
  - Cards grouped by time slot (morning / lunch / afternoon / dinner / evening)
- **Timeline** (vertical):
  - Purple dot `#A855F7` + thin connector line `rgba(255,255,255,0.1)`
  - Each entry: time (bold) + place name + selection reason (italic, secondary) + price badge
  - Cards have 3D depth with subtle shadow
  - Time-of-day grouping visible
- **Summary card**: 
  - Gradient border, 3D feel
  - Content: "N spots · Xh · total cost"
  - Spot count + estimated time (count times 1.5 hours) + total cost in EUR
- **Bottom actions**: 
  - Restart — secondary style, subtle
  - Share — primary style, gradient purple

### Time Slot Structure (8 max per day)
```
09:30-11:00  Morning 1
11:00-12:30  Morning 2
12:30-14:00  Lunch
14:00-15:30  Afternoon 1
15:30-17:00  Afternoon 2
17:00-18:30  Evening 1
18:30-20:00  Dinner
20:00-21:30  Night
```

---

## SCREEN H: SHARE (integrated in Screen G)

### Description
Not a separate screen. Share functionality is embedded in Screen G header (share icon) and bottom action button.

### Share Options
- Native OS share sheet (iOS/Android)
- Generated image: Itinerary summary as shareable card image
- Deep link: Opens the app with this itinerary

---

## SCREEN I: MY PAGE (Saved Itineraries)

### Description
User profile with a list of previously generated itineraries. Each saved trip shows as a 3D card with the city, character, date, and thumbnail photos.

### Layout
- Header: back arrow left + "My Trips" center + settings gear right
- Trip cards: vertical list, 3D Layla-style
- Each card: character avatar circle + city name + date + spot count + cost + small thumbnail row
- Tap card: opens Screen J
- Empty state: minimal illustration + "No trips yet" text

### Specifications
- **Trip cards**: 
  - 3D depth shadow, Layla-style
  - Character avatar (small circle, 36px) + city name (bold) + date
  - Stats: "N spots · cost" 
  - Thumbnail row: 3-4 small circular place photos (preview)
  - Full width minus 32px padding, rounded 20px
- **Tap**: Opens Screen J (saved trip detail)
- **Empty state**: Centered illustration + single line text

---

## SCREEN J: SAVED TRIP DETAIL

### Description
Same layout as Screen G (Final Itinerary) but for a previously saved trip. Includes ability to replay the shortform video and share again.

### Additional Features
- Replay shortform button: replays Screen F with saved data
- Edit and delete options in header menu
- Same 3D card timeline layout as Screen G
- All data loaded from saved state (offline capable)

---

## DESIGN CHECKLIST

### Per Screen
- [ ] C: White background, 7 circular avatars in organic cluster layout, single question text below
- [ ] D: Purple gradient, large character card center (hero), 8 place photos scattered around, gauge bar bottom
- [ ] E: Dark background, neon ring animation rotating and pulsing, 5-stage messages, BGM indicator
- [ ] F: Fullscreen place photo background, character animation overlay, dialogue bubble, swipe navigation, scene dots
- [ ] G: 3D reel cards horizontal scroll, vertical timeline with dots, summary card, frosted glass header
- [ ] H: Share integration in Screen G (not separate screen)
- [ ] I: Saved trips list with 3D cards, character avatars, thumbnail previews
- [ ] J: Saved trip detail same as G plus replay shortform button

### Global Rules
- [ ] No emoji anywhere in the UI
- [ ] No generic CTA text ("Start your journey", "Let's go", "Begin", etc.)
- [ ] All images are tappable (image = button principle)
- [ ] Progressive gauge bar instead of explicit "Next" buttons
- [ ] 3D card aesthetic (Layla-style) for all cards throughout the app
- [ ] Consistent with BTS Landing page design (purple theme, SpaceGrotesk for English)
- [ ] Frosted glass effect for all headers and overlays
- [ ] Minimum 44px touch targets (Apple HIG compliance)
- [ ] Spring animations with damping 15-20
- [ ] No decorative elements — every element serves a function
- [ ] White background for selection screens, dark gradient for content screens

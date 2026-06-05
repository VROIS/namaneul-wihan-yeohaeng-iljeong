# Screen D — Place Selection (Stitch Prompt)

Design a single mobile screen. iPhone 15 Pro (393 x 852).

## Concept
This is NOT a travel booking app. This is an **interactive movie poster** — the selected character is the HERO in the center, and their world of travel destinations unfolds around them as floating circular photo glimpses. Think Marvel movie poster composition meets Instagram story circles.

## What to design
A dark purple screen. One large character card dominates the center like a movie poster hero. 8 circular travel place photos float around the card at varying distances — some closer (larger), some further (smaller, faded). A thin progress gauge bar sits at the bottom. A single title line at the top.

## Exact Layout (393 x 852)

**Background**: Vertical gradient from `#1E1040` (top) to `#05050A` (bottom)

**Title** (top area):
- Position: x center, y: 60
- Text: "Romanticist's Journey" (placeholder — will be character archetype + "Journey")
- Font: SemiBold 20px, color `#F5F0EB`, center-aligned
- This is the ONLY text besides the gauge label

**Center Character Card (HERO)** — the star of this screen:
- Position: centered, y: 250 to 530 (approximately 200 x 280px)
- Content: Large anime character illustration filling the card
- Below illustration: character name in bold, archetype label in caption
- Style: 3D depth card — glassmorphism background `rgba(255,255,255,0.08)`, rounded 20px
- Border: 2px gradient border matching character color (e.g., Rose `#C74B7A` for Romanticist)
- Shadow: layered — `0 8px 32px rgba(0,0,0,0.3)` + `0 0 20px rgba(199,75,122,0.2)` (character color glow)
- Slight perspective tilt (2-3 degrees) for 3D feel
- NOT tappable — display only

**8 Place Photo Thumbnails** — scattered around the hero card like orbiting satellites:

Each thumbnail is a circular photo with subtle shadow. They are NOT evenly spaced — organic scatter with depth variation:

| # | Position (x, y) | Size | Opacity | z-index | Content |
|---|-----------------|------|---------|---------|---------|
| 1 | (55, 140) | 62px | 0.85 | behind card | Place photo 1 |
| 2 | (280, 120) | 56px | 0.7 | behind card | Place photo 2 |
| 3 | (320, 310) | 68px | 0.9 | in front | Place photo 3 |
| 4 | (300, 500) | 58px | 0.75 | behind card | Place photo 4 |
| 5 | (200, 600) | 64px | 0.85 | in front | Place photo 5 |
| 6 | (80, 580) | 54px | 0.65 | behind card | Place photo 6 |
| 7 | (30, 420) | 66px | 0.9 | in front | Place photo 7 |
| 8 | (50, 260) | 60px | 0.8 | behind card | Place photo 8 |

- Each photo has a circular mask (rounded full)
- Subtle drop shadow `0 4px 12px rgba(0,0,0,0.15)`
- Some thumbnails peek behind the character card edges (z-index variation)
- **Each photo is tappable** — image itself is the button
- Selected state: Neon purple border `#A855F7` 3px + slight glow + scale 1.1
- Unselected state: no border, lower opacity (see table)
- Show 3 thumbnails in "selected" state as example

**Progressive Gauge Bar** (bottom, fixed):
- Position: x: 24 to 369 (full width minus 48px padding), y: 760
- Track: `rgba(255, 255, 255, 0.08)`, height 5px, pill radius (full rounded)
- Fill: gradient `#A855F7` to `#6C2DC7`, width = 37.5% (showing 3/8 selected)
- Right of bar: text "3/8", caption 13px, color `#9B95A8`

**City Selector Chips** (above gauge):
- Position: y: 710, horizontal scroll
- 4-5 city name pills visible
- Active pill: filled `#A855F7`, white text
- Inactive pills: `rgba(255,255,255,0.06)` background, `#9B95A8` text
- Pill size: height 32px, padding horizontal 14px, rounded full
- Example cities: "Goyang", "Tokyo", "LA", "Paris", "London"

## What NOT to include
- No header navigation bar
- No bottom tab bar
- No explicit "Next" or "Continue" button — the gauge bar IS the progress
- No list views or table layouts
- No text descriptions on place thumbnails
- No emoji
- No search bar
- No settings icon
- No generic travel app elements

## Visual References
- Marvel/DC movie poster composition (hero center, world around them)
- Apple Music "spatial audio" visualizer (floating elements with depth)
- Instagram close friends story circles (but scattered, not in a row)
- Layla.ai trip cards (3D glassmorphism depth on the center card)

## One sentence summary
Dark purple screen with a large 3D character card in center, 8 circular place photos floating around it at varying depths, thin gauge bar at bottom.

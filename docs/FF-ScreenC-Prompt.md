# Screen C — Character Selection (FlutterFlow Prompt)

Design a single mobile screen. iPhone 15 Pro (393 x 852).

## Concept
This is NOT a travel app. This is a **character selection screen from a story-driven mobile game**. Think Genshin Impact character select meets Apple Music artist page. Premium, minimal, cinematic.

## What to design
A clean white screen with 7 anime-style character avatars floating in a loose organic circle. Below them, a single 3-line question. That's it. Nothing else.

## Exact Layout

**Background**: Pure white `#FFFFFF`. No gradients, no patterns, no decoration.

**7 Character Avatars** — circular portraits, arranged like friends gathered in a group photo:

Each avatar is a circular frame (72-80px diameter) containing an anime character bust illustration. Each has a unique colored gradient border (2px):

| Position | Character | Border Color |
|----------|-----------|-------------|
| Top center (x:196, y:120) | REALM | Teal `#0D7377` |
| Upper right (x:275, y:190) | VEIL | Rose `#C74B7A` |
| Right (x:300, y:320) | HYPE | Orange `#E8720C` |
| Lower right (x:250, y:440) | SURGE | Blue `#2563EB` |
| Lower left (x:120, y:440) | SHINE | Green `#6B9E78` |
| Left (x:70, y:320) | SAVOR | Amber `#D97706` |
| Upper left (x:95, y:190) | STILL | Slate `#64748B` |

- Avatars have subtle drop shadows for a floating effect
- Arrangement is organic and asymmetric — NOT a perfect circle or grid
- Each avatar is tappable (the image itself is the button)

**Question Text** — positioned below the avatar cluster:
- Position: centered horizontally, y: 560
- Font: Bold, 24px, color `#1A1A1A`
- 3 lines, center-aligned
- Placeholder text: "Who do you / want to travel / with?"
- This is the ONLY text element on the entire screen

**Selection State** (show one avatar in selected state as example):
- Selected: scale 1.3x, border glow 3px, elevated shadow
- Other 6: opacity 0.35, scale 0.85

## What NOT to include
- No header or navigation bar
- No bottom tab bar
- No buttons (no "Next", no "Continue", no CTA)
- No search bar
- No text labels on avatars
- No cards or panels
- No icons
- No emoji
- No dark mode — white background only
- No travel-app elements (no maps, no dates, no prices)

## Visual References
- Genshin Impact character selection (circular portraits, clean background)
- Apple Music artist bubbles
- Instagram story circles but larger and floating

## One sentence summary
7 floating anime character circles on white, one question below, nothing else.

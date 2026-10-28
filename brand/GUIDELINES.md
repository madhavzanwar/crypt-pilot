# FinPilot Brand & Logo System Guidelines

## 1. Brand Essence & Mark Anatomy
**FinPilot** is the *Autonomous AI Financial Health Copilot & Private Wealth Intelligence Engine*.

The FinPilot official identity (**Financial Growth Compass Apex**) is composed of two unified symbolic tiers:
1. **The Compounding Wealth Baseline & Pillars (Finance)**: A grounded horizontal foundation anchor and 3 ascending financial wealth bars representing capital growth, compounding equity, and the 5-pillar health score.
2. **The Supersonic Compass Pointer (Pilot Guidance)**: An aerodynamic dual-tone navigation arrowhead pointing $45^\circ$ northeast towards financial sovereignty and goal achievement.

---

## 2. Color Palette & Token Specifications

| Token Name | HEX | RGB | HSL | Semantic Role |
| :--- | :---: | :---: | :---: | :--- |
| **Ember** | `#ff5900` | `255, 89, 0` | `21°, 100%, 50%` | Primary Hero Accent, Navigation Apex, Active Telemetry |
| **Ink** | `#090a0f` | `9, 10, 15` | `230°, 25%, 5%` | Primary Grounding Canvas, Monogram Structure, Typography |
| **Paper** | `#ffffff` | `255, 255, 255` | `0°, 0%, 100%` | Clean Canvas, High-Contrast Negative Space |
| **Fog** | `#f8f9fa` | `248, 249, 250` | `210°, 17%, 98%` | Subtle Ambient Card & Header Surface |
| **Carbon** | `#181a20` | `24, 26, 32` | `225°, 14%, 11%` | Dark Mode Elevated Glass Surfaces |
| **Mist** | `#d9dce5` | `217, 220, 229` | `225°, 18%, 87%` | Crisp Hairline Borders & Dividers |

---

## 3. Typography Hierarchy

### 3.1 Display Font: **Fraunces**
- **Classification**: Optical variable serif.
- **Weights Used**: Medium (`500`), SemiBold (`600`).
- **Application**: Brand wordmark ("FinPilot"), editorial headlines, executive statement titles.
- **Tracking**: `-0.025em` to `-0.015em`.

### 3.2 Interface Font: **Inter**
- **Classification**: High-legibility geometric neo-grotesque sans-serif.
- **Weights Used**: Regular (`400`), Medium (`500`), SemiBold (`600`).
- **Application**: Navigation items, telemetry badges, body copy, tabular numeric data (`.font-tabular` / `tabular-nums`).
- **Tracking**: `-0.012em`.

---

## 4. Logo Lockups & Clear Space

```
       ┌─────────────────────────────────────────────────────────┐
       │                       CLEAR SPACE [X]                   │
       │                                                         │
       │   [X]     ▲                                       [X]   │
       │         ▲██▲       FinPilot ●                           │
       │        ▲█  █▲      AUTONOMOUS WEALTH COPILOT            │
       │       █ █  █ █                                          │
       │       ▀ ▀▀ ▀▀▀                                          │
       │                                                         │
       │                       CLEAR SPACE [X]                   │
       └─────────────────────────────────────────────────────────┘
```

- **Clear Space ($X$)**: The minimum clear space surrounding the mark is equal to **$0.5 \times \text{width of the mark}$** (or the height of the capital letter "F" in the wordmark). No text, graphics, or borders should intrude into this zone.
- **Minimum Digital Size**:
  - Logo Mark Only: $16 \times 16\text{px}$ (favicon), $24 \times 24\text{px}$ (mobile nav).
  - Horizontal Wordmark Lockup: $120 \times 28\text{px}$.
- **Minimum Print Size**:
  - Mark Only: $6\text{mm} \times 6\text{mm}$.
  - Horizontal Lockup: $25\text{mm} \times 6\text{mm}$.

---

## 5. Official Asset Roster

| File Path | Description | Recommended Usage |
| :--- | :--- | :--- |
| `logo-mark.svg` | Standalone multi-color vector mark (Ink + Ember) | Web app header, mobile splash, social avatar |
| `logo-mark-white.svg` | Standalone monochrome white mark | Dark surfaces, solid color badges |
| `logo-mark-black.svg` | Standalone monochrome black mark | 1-color print, monochrome invoices |
| `logo-mark-ink.svg` | Mark on solid Ink background | App store icon, social profiles |
| `logo-horizontal.svg` | Mark + "FinPilot" in Fraunces serif on transparent | Web header, investor presentations |
| `logo-horizontal-dark.svg` | White wordmark + Ember dot on Ink background | Dark mode navbar, footer |
| `logo-horizontal-black.svg` | 1-color black horizontal lockup | Legal filings, print statements |
| `logo-stacked.svg` | Vertical centered badge lockup | Merch, app loading splash screen |
| `favicon.ico` | Multi-resolution icon (16, 32, 48, 64px) | Browser tab icon |
| `icon.svg` / `icon-192.png` / `icon-512.png` | Standard PWA web manifest icons | Mobile homescreen & PWA installation |
| `apple-touch-icon.png` | 180x180 iOS touch icon | iOS Safari bookmarks |
| `maskable-icon.png` | 512x512 Android adaptive maskable icon | Android Chrome install prompt |
| `og-image.png` | 1200x630 high-contrast social preview | OpenGraph, Twitter Cards, LinkedIn share |

---

## 6. Do's and Don'ts

### ✅ Do:
- Always maintain the $45^\circ$ upward-northeast trajectory of the compass needle.
- Keep the Ember accent (`#ff5900`) vibrant and unpolluted by extra gradient hues.
- Pair the logo mark with Fraunces serif for formal branded headlines and Inter for data telemetry.
- Use `logo-mark-black.svg` for print and PDF statements for maximum laser-print sharpness.

### ❌ Don't:
- Never rotate, shear, or flip the compass needle (it must always guide up and to the right).
- Never introduce secondary accent colors (like purple, cyan, or neon green) into the core logo.
- Never add drop shadows, 3D bevels, or gradient overlays onto the flat vector mark.
- Never crowd the logo mark without respecting the defined clear space $X$.

# Agent Pulse Brand Guide

## Logo Assets

| File | Use Case |
|------|----------|
| `svg/logo-primary.svg` | Primary mark (dark backgrounds) |
| `svg/wordmark-dark.svg` | Logo + "AGENT PULSE" text (dark bg) |
| `svg/inline-horizontal.svg` | Horizontal layout with tagline |
| `svg/logo-mono-white.svg` | Monochrome white (dark bg) |
| `svg/logo-mono-dark.svg` | Monochrome dark (light bg) |
| `favicon/favicon.svg` | Simplified 16-32px favicon |

## Color System

| Swatch | Hex | Role |
|--------|-----|------|
| Void | `#0A0F0A` | Page background |
| Surface 0 | `#0D150D` | Card / logo background |
| Surface 1 | `#111A11` | Elevated surface |
| Surface 2 | `#162016` | Higher elevation |
| Surface 3 | `#1A2A1A` | Highest elevation |
| Green Dim | `#1A5C2A` | Subtle accents |
| Green Muted | `#2D6B3F` | Secondary green |
| **Green** | **`#4ADE80`** | **Primary signal color** |
| Green Bright | `#86EFAC` | Highlights |
| Green Light | `#BBF7D0` | Light mode accents |

## Typography

- **Primary:** JetBrains Mono (all text)
- **Weights:** 300 (light), 400 (regular), 500 (medium), 600 (semi), 700 (bold)
- **Wordmark:** "AGENT" in 400 weight `#D4E8D4`, "PULSE" in 700 weight `#4ADE80`
- **Letter spacing:** 2px for wordmark, 3px for labels/eyebrows

## Usage Rules

1. **Clear space:** Minimum 1× mark width on all sides
2. **Background:** Dark surface (#0A0F0A – #1A2A1A) only; never busy images
3. **Color:** Brand green #4ADE80 for primary signal; never change waveform color
4. **Typography:** JetBrains Mono only; never serif or decorative
5. **Waveform:** Keep exact pulse shape — it IS the mark; never redraw
6. **Minimum size:** Full mark ≥32px; simplified favicon SVG for 16px

## Animation

- Pulse glow: `3s ease-in-out infinite` between 6px and 18px drop-shadow
- Trace: `2s ease-out forwards` stroke-dashoffset animation
- Active dot blink: `1.5s ease-in-out infinite` opacity 0.3–1.0

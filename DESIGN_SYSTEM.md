# THE RECEIPT — Design System

This document records the current implementation, not a proposed redesign.

## Typography

| Role | Family | Weight | Current use |
| --- | --- | --- | --- |
| Display | Space Grotesk | 600–700 | Hero, page headings, prediction text, feature stats |
| Body | DM Sans | 400–700 | Explanations, form text, buttons where needed |
| Metadata | DM Mono | 400–500 | Eyebrows, labels, timestamps, receipt details, status stamps |

The fonts are loaded from Google Fonts in `client/src/index.css`.

Current type behavior includes a hero heading that scales from roughly 60px on small screens up to 122px on large screens, page headings from roughly 42px to 74px, receipt predictions around 21px, and compact receipt predictions around 16px. Letter spacing is intentionally tight on display text and labels use generous tracking.

## Colors

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#11110f` | Primary text, dark buttons, borders |
| `--paper` | `#f9f7f1` | Global background |
| `--paper-deep` | `#eeeae0` | Secondary surfaces, tags, demo notes |
| `--white` | `#fffefb` | Cards and receipt paper |
| `--line` | `#d9d4c8` | Dividers and field borders |
| `--acid` | `#c4fa57` | Primary highlight, daily selection, receipt stage |
| `--acid-deep` | `#8dbb15` | Accent bars and success emphasis |
| `--coral` | `#ff6a5e` | Hero emphasis, wrong state, miss card |
| `--sky` | `#87d9f4` | Reserved accent token |
| `--lavender` | `#c8bbfb` | Share hook and avatar surfaces |
| `--muted` | `#77746d` | Supporting text |

## Receipt-paper signature component

`ReceiptPaper` in `client/src/App.tsx` is the product’s signature component. It uses a warm near-white paper surface, monospaced metadata, dotted and solid rules, receipt number, status stamp, prediction, category, confidence, printed date, resolution date, and a perforated edge created with CSS gradients. It supports full and compact variants, demo labeling, and status-specific color classes.

The receipt must remain visually distinct from a normal card. It should read as a physical thermal-paper artifact and be shareable on its own.

## Layout and spacing

The app uses a centered max width of 1240px with 28px desktop gutters and 18px mobile gutters. Common vertical spacing is built from 9px, 12px, 18px, 21px, 25px, 28px, 34px, 42px, 52px, and 64px intervals. Borders are generally 1px solid `--line`; primary form cards and daily cards use a 1px `--ink` border.

There are intentionally few rounded corners. Avatars and the streak icon are circular; most product surfaces are square or lightly geometric to echo paper, tickets, and print objects.

## Buttons and controls

Buttons are bordered, compact, uppercase DM Mono labels with 44px minimum height. Primary buttons use dark ink with acid text; secondary buttons are transparent with an ink border. Active press uses `transform: scale(.97)` over approximately 160ms. Disabled controls reduce opacity and are not decorative.

Inputs use paper backgrounds, 1px line borders, 14px padding, and an ink focus border with an acid offset shadow. The confidence slider uses the native range control with ink accenting.

## States

- RIGHT: green text/status treatment.
- WRONG: coral/red text/status treatment.
- PARTIALLY RIGHT: amber treatment.
- TOO EARLY: blue treatment.
- PENDING/LOCKED: neutral status treatment.
- Loading: plain text loading state in the current MVP.
- Empty: icon, short explanation, and a next-action CTA; demo content is labeled.
- Error: pale coral surface with dark red monospace explanation.

## Animation and interaction

The current design uses restrained motion. The hero receipt enters with a short transform/opacity animation when reduced motion is not requested. Hover states lift receipt links and challenge cards slightly. Buttons use short ease-out transitions and pressed scaling. Motion should stay under roughly 300ms and must respect `prefers-reduced-motion`.

## Responsive breakpoints

The primary breakpoint is `820px`. Below it, navigation becomes a menu, multi-column layouts become single-column, the create form appears before its preview, tables hide the least important streak column, and spacing/heading sizes reduce. A secondary `420px` breakpoint tightens receipt padding and form controls.

## Reusable UI primitives

- `Header`
- `Page`
- `ButtonLink`
- `Tag`
- `ReceiptPaper`
- `SectionLabel`
- `AuthPrompt`

Preserve the receipt-paper visual identity and mobile-first daily flow when extracting or splitting these components.

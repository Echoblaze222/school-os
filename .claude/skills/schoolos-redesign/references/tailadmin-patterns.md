# TailAdmin patterns to port (read from the template source)

Translate these Tailwind classes into CSS Modules using the tokens in `assets/tokens.css`. Template licence: MIT (TailAdmin).

## Page
Background `gray-50`; font Outfit; base text 14px. Cards sit on it with clear gaps (16px mobile, 24px from md up).

## Card
Rounded 16px, 1px `--border`, white (`--bg-card`), padding 20px (24px from md). No heavy shadow; depth comes from the border.

## Stat card (metric)
Card with a 48x48 icon tile (radius 12px, `gray-100` background, 24px icon in `gray-800`). Below, 20px gap, then the label (14px, `gray-500`) and the value (30px, bold, `gray-800`). An optional small badge shows change.

## Sidebar item
Full width, radius 8px, padding 8px 12px, gap 12px, 14px medium. Active: brand-tinted background and brand text/icon. Inactive: `gray-700` text, hover `gray-100`.

## Button
Inline-flex, centred, gap 8px, radius 8px, medium weight, smooth transition. Primary: brand fill, white text. Secondary: white with a 1px border. Sizes sm and md. Disabled lowers opacity and blocks pointer. Focus shows `--focus-ring`.

## Table
White card wrapper, header row in `gray-50` with 12px medium `gray-500` text, rows separated by 1px borders, 14px body text, status shown with a Badge, right-aligned actions. Wide tables scroll inside their own container on mobile.

## Badge
Small pill, 12px medium. Light tinted background with matching darker text (success, warning, error, info, neutral).

## Form field
Label 14px medium `gray-700`; input height 44px, radius 8px, 1px `gray-300` border, brand focus border with `--focus-ring`; error text 12px in error-500.

## Header
Sticky, white, bottom border, holds menu toggle, search, theme toggle, notifications, user avatar menu.

## Dark mode
Page `gray-950`, cards `white/3%`, borders `gray-800`, strong text `white/90%`, muted `gray-400`.

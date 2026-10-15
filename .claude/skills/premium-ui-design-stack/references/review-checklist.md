# UI review checklist

Run this after building and before reporting back. Fix failures, do not just list them. Sections marked (Vercel) paraphrase items that were visible on screen in the Web Interface Guidelines; the rest is general good practice that matches the videos' "anti-slop" goal.

## 1. Slop tells (fail on any of these)

- Centered hero with a vague headline ("Unlock your potential today", "Build faster with intelligent workflows") and two generic buttons
- Default purple/blue gradient, glassmorphism or glowing blobs with no reason
- Three or four identical rounded cards in a row, each with an icon, a title and one line
- Emoji or stock-icon-only illustration as the main visual
- Fake precision with no source (invented user counts, "86% finish rate", testimonials) that is not clearly marked as placeholder
- One font at similar weights everywhere; no clear type hierarchy
- Same border radius, shadow and padding on everything
- Placeholder or lorem-style copy that was never rewritten for this product

## 2. Product and content

- The page has one primary action and it is obvious within a few seconds
- Copy is specific to this product, audience and tone, and says something only this product could say
- Invented content is flagged to the user and kept easy to replace

## 3. Visual system

- Type scale, colour tokens, spacing scale, radii and shadows come from one defined set, and the code reuses them
- Real hierarchy: size, weight, colour and whitespace each doing work
- Contrast passes (body text and interactive elements); colour is not the only signal
- Imagery and icons share one style

## 4. Motion (Emil Kowalski layer, in spirit)

- Every animation has a purpose: orientation, feedback or hierarchy. Remove decorative motion.
- Some things deliberately do not move
- One set of durations and easing curves reused across the UI
- Honour `prefers-reduced-motion` and provide a reduced-motion variant (Vercel)
- Prefer CSS; avoid main-thread JS-driven animation where possible (Vercel)

## 5. Interaction and accessibility (Vercel)

- Keyboard works everywhere; all flows are keyboard-operable
- Do not disable browser zoom
- Do not block paste in inputs
- Inputs must not lose focus or value after hydration
- Do not pre-disable the submit button; allow submitting and show validation instead
- Buttons that trigger async work show a loading state
- No dead zones: the whole visual control is clickable
- Handle device insets with safe-area variables; no excessive or unnecessary scrollbars; fix overflow issues rather than hiding them
- Let the browser size things: prefer flex, grid and intrinsic layout over measuring in JS

## 6. Responsive and rendered check

- Look at real screenshots at a desktop width and a phone width, not only the code
- No horizontal scroll, clipped text, orphaned single words in headings, or alignment that changes arbitrarily between breakpoints (for example a centred heading over left-aligned body text that looks like a wrap accident)
- Empty, loading and error states exist for anything data-driven

## 7. Report

State which items you fixed, which you left and why, and any assumptions or placeholder content the user must replace.

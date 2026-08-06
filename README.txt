SchoolOS Logo Package — "The System"
======================================

WHAT'S INSIDE
-------------
schoolos-system-final.html   Full logo system reference: construction grid,
                              clear space, minimum sizes, monochrome, outline
                              variant, app icon treatment, wordmark lockup,
                              and exact color values. Open in any browser.

schoolos-animated.html       The animated version — 4 tiles zoom out/in in
                              sequence, looping. Includes the ready-to-use
                              CSS at the bottom of the page.

assets/
  schoolos-mark-color.svg          Primary mark, full color, for light backgrounds
  schoolos-mark-color-darkbg.svg   Same mark, lighter tints, for dark backgrounds
  schoolos-mark-mono-black.svg     Single-color (black) version
  schoolos-mark-mono-white.svg     Single-color (white) version, for dark backgrounds
  schoolos-mark-outline.svg        Stroke-only version
  schoolos-favicon.svg             Simplified single-tile version for small sizes (<24px)
  schoolos-wordmark.svg            Icon + "schoolOS" wordmark lockup

COLORS
------
Maroon             #4A0012
Maroon (dark bg)   #7A1030
Cyan               #006B85
Cyan (dark bg)     #1C93AC
Ink                #14161A

RULES, IN SHORT
----------------
- Clear space: 1 tile-width on every side, minimum.
- Minimum size for the full 4-tile mark: 24px. Below that, use the favicon variant.
- Don't mix filled and outline tiles in the same lockup.
- The wordmark SVG references "Space Grotesk" — if that font isn't loaded
  wherever you use it, the text will fall back to the browser's default
  sans-serif. Load the font, or convert the text to outlines before using
  it somewhere you can't guarantee the font is available.

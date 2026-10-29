# The five layers: purpose, tool, install, fallback

Install commands below are what appeared on screen in the source videos or are the standard route for each tool. Tools change quickly, so verify against each project's README before telling a user to run anything.

## Contents
1. Product layer: Impeccable
2. Structure layer: Anthropic frontend-design
3. Taste layer: taste-skill
4. Knowledge layer: UI UX Pro Max
5. Motion and interaction layer: Emil Kowalski skills
6. Extras: 21st.dev MCP, Vercel Web Interface Guidelines

---

## 1. Product layer: Impeccable (impeccable.style)

**Role:** the overall design-quality layer. Helps Claude understand the product, avoid common AI-generated patterns, and hold design standards. The video calls it "the layer that fights AI slop".

**What it does (as shown):** supports Claude Code, Codex, Cursor, Gemini CLI, OpenCode and others. Provides precise commands for steering design (critique, audit, polish and similar) and works from a `PRODUCT.md` and `DESIGN.md` in the project. When `PRODUCT.md` is missing it prompts you to run its init command first. The site advises uninstalling any other frontend skill and replacing it with Impeccable.

**Install (as shown):** `npx impeccable install`, then choose the detected harness (e.g. Claude Code) and install location (project or global). In Claude Code it can also appear as a plugin; restart or `/reload-plugins` afterwards.

**Fallback without it:** do the product layer by hand. Write down audience, single success action, tone, constraints, and what is placeholder. Then use `review-checklist.md` as the anti-slop pass.

## 2. Structure layer: Anthropic's frontend-design skill

**Role:** shapes page structure and front-end direction. Its guidance: ground the design in the subject, commit to a distinctive aesthetic, make typography, colour and layout decisions that do not read as templated defaults, and iterate (brainstorm, explore, critique, build, critique again).

**Install:** the official Anthropic `frontend-design` plugin/skill for Claude Code (look under Anthropic's `claude-code` plugins on GitHub, or install through `/plugin`).

**Fallback:** pick one specific aesthetic direction, name it, and write the type pairing and section order before coding.

## 3. Taste layer: taste-skill (author: Leonxlnx)

**Role:** the visual taste layer. Claude can make almost anything but does not naturally know what feels premium. This layer translates references, screenshots and visual directions into actual design rules, so the output is a consistent design language.

**Install (as shown):** add the `taste-skill` marketplace in Claude Code, install the plugin, then run `/reload-plugins`. The plugin description reads "Frontend design taste skills including brutalist, minimalist, redesign, stitch, and more". Variants visible in the slash-command list (partly blurry on screen, so confirm names after install) include `gpt-taste`, `design-taste-frontend`, `stitch-design-taste`, `minimalist-ui`, `industrial-brutalist-ui`, `redesign-existing-projects`, `high-end-visual-design`, `full-output-enforcement`, `image-to-code`.

**Fallback:** extract rules from whatever references the user gives: type scale, colour tokens, spacing, radii, shadows, imagery, copy voice. Write them to `DESIGN.md`.

## 4. Knowledge layer: UI UX Pro Max

**Role:** the design knowledge layer. Structured knowledge around typography, colours, layouts, UX patterns, and industry-specific recommendations. In the video it helps choose the right layouts, typography, colours and UX patterns.

**Install:** search for the `ui-ux-pro-max` skill and follow its README. The video only showed it as a project workspace and a described capability, not an install command.

**Fallback:** reason from category conventions (what do the best products in this category do for layout, type and colour, and why) and state the choice and reason.

## 5. Motion and interaction layer: Emil Kowalski skills

**Role:** teaches Claude interaction judgement: how things should move and when they should stay still, so it neither skips animation nor adds it everywhere. Based on Emil Kowalski's experience building interfaces at companies such as Vercel and Linear, framed in the README as "skills for design engineers".

**Install (as shown):** `npx skills@latest add emilkowalski/skills`

**Fallback:** follow the motion rules in `review-checklist.md`: purposeful motion only, CSS first, one set of durations and easing curves, reduced-motion variant.

---

## 6. Extras from the second video

**21st.dev MCP.** An MCP server you can plug into Claude or Codex. It pulls ready-made UI components (hero sections, animated sections, shader and liquid/metal effects and more) instead of having Claude build them from scratch. Check 21st.dev for the current install command. Restyle pulled components to the project's design language.

**Vercel Web Interface Guidelines.** A living, framework-agnostic checklist of interface decisions (some items specific to React/Next.js). Give it to the agent as a checklist for a clean UI; the creator calls it especially good for UX and accessibility. The key items are summarised in `review-checklist.md`.

# Claude Code project notes

## Installed skills

### Impeccable (frontend design)

Source: https://github.com/pbakaus/impeccable (Apache 2.0)
Installed: `.claude/skills/impeccable/` + `.claude/agents/impeccable-*.md` + `.claude/settings.json`
Version at install time: 4.3.1 (see `.claude/skills/impeccable/scripts/VERSION`)

A frontend design skill covering UI/UX review, layout, typography, color,
motion, accessibility, and anti-pattern detection - see
`.claude/skills/impeccable/SKILL.md` for the full command list (audit,
critique, polish, harden, animate, colorize, etc.).

**This also installs active PostToolUse/Stop hooks** (`.claude/settings.json`)
that run a bundled launcher script after edits to UI files and at the end of
a session, for automatic design checks - not just a passive skill. The
launcher (`.claude/skills/impeccable/scripts/impeccable`) may download a
self-contained binary on first run per its own docs.

Not yet run against this codebase - installed and verified discoverable
only, per explicit instruction to stop before any redesign work.

### Taste / taste-skill - not installed, pending confirmation

Multiple unrelated projects share this name (Leonxlnx/taste-skill,
senlindesign/taste-skill, obakeng-develops/taste, VOIDXAI/taste,
draftbit/mobile-taste-skill), with different scope and install
requirements - one requires a Playwright MCP server dependency. Not
installed until the correct one is confirmed.

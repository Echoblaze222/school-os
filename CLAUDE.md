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

### Taste (design-taste-frontend)

Source: https://github.com/Leonxlnx/taste-skill (MIT), the `skills/taste-skill/`
sub-skill specifically - the current/default one per the repo's own docs
(as opposed to `taste-skill-v1`, the pinned legacy version, or the ~10
other specialized sub-skills in that repo: redesign-skill, soft-skill,
minimalist-skill, brutalist-skill, stitch-skill, etc. - not installed,
since the request didn't call for those and installing everything
un-asked isn't in the spirit of "no unnecessary" scope).

Installed: `.claude/skills/design-taste-frontend/SKILL.md`
(folder renamed from the source's `taste-skill` to `design-taste-frontend`
to match Claude Code's requirement that a skill's folder name equal its
frontmatter `name:` field - the two didn't match in the source repo.)

Anti-slop frontend design guidance for landing pages, portfolios, and
redesigns - brief inference, a "Design Read" step before generating,
contextual rules rather than a fixed aesthetic. Single markdown file,
no hooks, no bundled scripts or binaries, no network calls.

Assumption made without further confirmation: multiple unrelated
projects share the "taste-skill" name (see prior note, now resolved
in git history) - picked Leonxlnx/taste-skill specifically because
other projects in the ecosystem (draftbit/mobile-taste-skill,
h3nryprod01/design-taste) cite it as their origin/inspiration, the
same reasoning used to confirm Impeccable's canonical repo. If this
isn't the one you meant, it's a clean, isolated addition to remove.

# Source notes

This skill was written from two short vertical videos. Claude read them as sampled frames plus on-screen text (OCR); there was no audio transcription, so wording below comes from the burned-in captions. Treat tool names and commands as leads to verify, not as documentation.

## Video 1: "Probably the best design setup in Claude Code" (TikTok, @codenameposhan, ~3:30)

The creator's argument: this setup costs more tokens, but if you are setting up a new design system or a product where quality matters more than saving tokens, it is the one he would use. It gives Claude five layers of design thinking:

| # | Layer | Tool | One-line role |
|---|-------|------|---------------|
| 1 | Product (design quality) | Impeccable | Understand the product, avoid AI-generated patterns, hold design standards; "fights AI slop" |
| 2 | Structure | Anthropic's frontend-design skill | Stronger front-end foundation; shapes structure and direction |
| 3 | Taste | taste-skill | Translates references, screenshots and visual directions into design rules |
| 4 | Knowledge | UI UX Pro Max | Structured knowledge: typography, colours, layouts, UX patterns, industry recommendations |
| 5 | Motion and interaction | Emil Kowalski skills | Judgement on how things move and when to stay still |

Demo prompt: "Build a premium landing page for AI courses." Described division of labour: Impeccable defines the product experience and avoids a generic AI landing page; frontend-design shapes structure; taste skill sets the visual style and a consistent design language; UI UX Pro Max picks layouts, type, colour and UX patterns; Emil's skills refine animation and interactions. The claim: the result is Claude following an actual design process rather than just generating components.

Honest caveat from the video: taste skill and Impeccable overlap the most. Both are anti-slop systems with strong opinions. Running just one is a big improvement; they catch different things; when they disagree the disagreement is informative. Running both is better but uses more context, and you would not run all five for every small prototype.

Workflow aside (sponsor segment): running multiple branches in parallel in isolated workspaces with different agents (one builds, one reviews, one experiments with designs), via DevSwarm. Not part of the skill's process.

On-screen details seen: the Impeccable site and installer ("Detected harnesses" list; project or global install), Claude Code plugin flow for taste-skill ("Successfully added marketplace: taste-skill", "Installed taste-skill. Run /reload-plugins"), the Emil Kowalski README ("Skills For Design Engineers", `npx skills@latest add emilkowalski/skills`), and a build that produced `PRODUCT.md`, `DESIGN.md`, `PLACEHOLDERS.md`, with the agent marking invented stats and testimonials as placeholders.

## Video 2: "3 proven ways to unslop your UI" (TikTok, @aimn.dev, ~25s)

Opens by showing what AI slop looks like (a generic "Build faster with intelligent workflows" landing page, "Unlock your potential today" form). Then:

1. **Impeccable skill.** Detects anything that looks like AI slop in your UI and fixes it for you (shown as a before/after).
2. **21st.dev MCP.** Plug it into Codex or Claude and it pulls beautiful UI components (hero sections, animated sections, shader/liquid-metal effects) instead of building from scratch.
3. **Vercel Web Interface Guidelines.** Gives your agent a checklist for what it needs to get a clean UI; "amazing for UX and accessibility too".

## Limits of this extraction

- Some command names (notably the taste-skill slash commands) were blurry and are listed with a "confirm after install" note.
- No install command was shown for UI UX Pro Max or the 21st.dev MCP, so none is given.
- The videos are enthusiast recommendations, not benchmarks. The claimed quality gain is the creators' experience.

# Imagery rules for SchoolOS

Images should make screens feel real without slowing phones on weak networks.

## Sources (pick in this order)
1. **The school's own uploads:** logo, building photo (already uploadable by the principal), student and staff avatars.
2. **Licensed stock via Unsplash:** only through the Unsplash API with the `UNSPLASH_ACCESS_KEY` (already planned for the content bot), keeping photographer credit and the required download-tracking call. Do not hotlink random web images.
3. **Original illustrations or icons** drawn as SVG for empty states and onboarding.

Never copy images from the TailAdmin template's `public/images`; they are demo placeholders for a different product. Never commit images of real students without the school's consent.

## Where images belong
- Public landing: one strong hero photo (classroom or school life), small supporting photos, school logos.
- Dashboards: avatars, school logo in the sidebar, subtle illustrated empty states. No decorative photo banners on data screens.
- Cards (announcements, news): optional 16:9 cover image.

## Technical rules
- Use `next/image` with explicit `width`/`height` or `fill` plus `sizes`; set `priority` only for the above-the-fold hero.
- Descriptive `alt` text (empty `alt=""` only for decorative images).
- Prefer WebP/AVIF, keep each image under ~200 KB; hero under ~400 KB.
- Provide a neutral placeholder (blur or brand-tinted block) so layout does not jump.
- Store static images in `public/images/<area>/`; user uploads stay in Supabase Storage with existing bucket policies. Allow remote hosts in `next.config` only for the ones actually used.

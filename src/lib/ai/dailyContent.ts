// src/lib/ai/dailyContent.ts
// Generates one verified content_posts draft per run for the daily-content
// cron. Scoped deliberately to categories the bot can actually have real
// information about - education news, scholarships/guides, tutorials,
// success stories. It never writes 'platform_announcement',
// 'product_update', or 'feature_announcement' posts about SchoolOS itself:
// the bot has no ground truth about the platform's own roadmap, and
// official posts about SchoolOS should stay human-authored.
//
// Tries Claude with the native web_search tool first (needs that feature
// enabled on the Anthropic account); falls back to Gemini's Google Search
// grounding on any failure, same fallback shape as /api/ai/chat.
// Returns null (never throws) if nothing genuinely current/verifiable was
// found - the cron should skip posting rather than force a post daily.

import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'

export interface DailyContentDraft {
  title: string
  category: 'education_news' | 'education_article' | 'guide' | 'success_story' | 'tutorial'
  excerpt: string
  body: string
  source_url: string
  image_query: string
}

const ALLOWED_CATEGORIES = new Set(['education_news', 'education_article', 'guide', 'success_story', 'tutorial'])

const PROMPT = `You are a content researcher for SchoolOS, a school-management platform used by private schools in Nigeria. Your job today is to find ONE genuinely current, verifiable item worth sharing with school administrators and parents in Nigeria - a real scholarship or bursary with a deadline that has not yet passed, or a notable piece of current Nigerian/African education news or policy change.

Rules:
- Use web search and confirm the details (especially any deadline) are accurate and still current before writing anything.
- Never write about SchoolOS itself - you have no reliable information about this platform's own roadmap or announcements.
- Write the body entirely in your own words. Do not copy sentences verbatim from any source.
- If you cannot find and verify anything genuinely current, respond with exactly: NO_VERIFIED_CONTENT

If you found something, respond with ONLY this JSON (no markdown fences, no extra text before or after):
{
  "title": "string",
  "category": "education_news" | "education_article" | "guide" | "success_story" | "tutorial",
  "excerpt": "one or two sentence summary, under 400 characters",
  "body": "full article body in markdown, 300-600 words, clear and informative for school admins and parents",
  "source_url": "the URL you verified this against",
  "image_query": "a short generic 2-4 word stock-photo search phrase for this topic - no brand names, no real people's names"
}`

function parseDraft(raw: string): DailyContentDraft | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === 'NO_VERIFIED_CONTENT') return null
  try {
    const jsonStart = trimmed.indexOf('{')
    const jsonEnd = trimmed.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) return null
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1))
    if (!parsed.title || !parsed.body || !parsed.source_url) return null
    if (!ALLOWED_CATEGORIES.has(parsed.category)) parsed.category = 'education_news'
    return {
      title: String(parsed.title).slice(0, 200),
      category: parsed.category,
      excerpt: parsed.excerpt ? String(parsed.excerpt).slice(0, 400) : '',
      body: String(parsed.body),
      source_url: String(parsed.source_url),
      image_query: parsed.image_query ? String(parsed.image_query).slice(0, 60) : 'education students',
    }
  } catch {
    return null
  }
}

async function tryClaude(): Promise<string | null> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
    messages: [{ role: 'user', content: PROMPT }],
  })
  const textBlock = response.content.find(b => b.type === 'text')
  return textBlock && 'text' in textBlock ? textBlock.text : null
}

async function tryGemini(): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const genai = new GoogleGenAI({ apiKey: key })
  const response = await genai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: PROMPT,
    config: { tools: [{ googleSearch: {} }] } as any,
  })
  return response.text ?? null
}

export async function generateDailyContent(): Promise<DailyContentDraft | null> {
  let raw: string | null = null
  try {
    raw = await tryClaude()
  } catch {
    try {
      raw = await tryGemini()
    } catch {
      return null
    }
  }
  return raw ? parseDraft(raw) : null
}

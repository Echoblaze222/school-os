// src/lib/images/unsplash.ts
// Sources a real, licensed photo for daily-content posts rather than
// scraping an arbitrary image off the web (copyright + reliability risk).
// Requires UNSPLASH_ACCESS_KEY (free at unsplash.com/developers). If it's
// not set, or the request fails for any reason, callers get null and the
// post is simply created without a cover image - never a hard failure.

export interface UnsplashPhoto {
  url: string
  attribution: string
}

export async function findStockPhoto(query: string): Promise<UnsplashPhoto | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return null

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const photo = data?.results?.[0]
    if (!photo) return null

    // Unsplash's API guidelines require attribution to the photographer
    // and Unsplash, and a request to their download-tracking endpoint
    // when a photo is actually used (not just previewed).
    if (photo.links?.download_location) {
      fetch(photo.links.download_location, { headers: { Authorization: `Client-ID ${key}` } }).catch(() => {})
    }

    return {
      url: photo.urls?.regular ?? photo.urls?.full,
      attribution: `Photo by ${photo.user?.name ?? 'Unsplash'} on Unsplash`,
    }
  } catch {
    return null
  }
}

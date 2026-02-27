import { MetadataRoute } from 'next'

export const dynamic = 'force-static'

const BASE_URL = 'https://nania-ssimdang.pages.dev'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/admin/',
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}

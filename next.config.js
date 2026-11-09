/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    // Keep sharp on the server filesystem for PDF image resizing.
    serverComponentsExternalPackages: ['sharp'],
    // Load instrumentation.js before routes open a database connection.
    instrumentationHook: true,
    // The lot catalogue is read from disk. Include it in the server functions that load it.
    outputFileTracingIncludes: {
      '/api/grounds-maintenance-sites': ['./data/grounds-maintenance-sites.json'],
      '/api/analytics/grounds-lots': ['./data/grounds-maintenance-sites.json'],
      '/api/analytics/grounds-sites/links': ['./data/grounds-maintenance-sites.json'],
    },
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Inline env at build time (set these in Vercel for deployments)
  env: {
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
    AIRTABLE_API_TOKEN: process.env.AIRTABLE_API_TOKEN,
    AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
}

module.exports = nextConfig

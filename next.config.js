/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Keep pdfkit (and sharp) on the server filesystem so standard font metrics (.afm) resolve on Vercel.
  serverExternalPackages: ['pdfkit', 'sharp'],
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

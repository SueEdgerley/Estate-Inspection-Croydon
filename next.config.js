/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Ensure API routes are included in build
  experimental: {
    serverActions: true,
  },
}

module.exports = nextConfig

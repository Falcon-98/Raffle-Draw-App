/** @type {import('next').NextConfig} */
// GitHub Pages serves a project site from /<repo-name>. The deploy workflow sets
// NEXT_PUBLIC_BASE_PATH automatically; leave it empty for local dev or a custom domain.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;

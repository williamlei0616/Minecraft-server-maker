// Static export for GitHub Pages. One place decides where
// the site is served from: PAGES_BASE (e.g. "/Minecraft-server-maker" on a Pages subpath,
// empty for a custom domain or "/"). The versions.json URL is derived from the same value.
const base = (process.env.PAGES_BASE ?? '').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Lets a second dev server run beside the first (Next locks its build folder):
  //   NEXT_DIST_DIR=.next-alt npx next dev -p 3100
  distDir: process.env.NEXT_DIST_DIR || '.next',
  basePath: base,
  assetPrefix: base || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: base },
  reactStrictMode: true,
};

export default nextConfig;

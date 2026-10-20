/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  output: 'export',
  basePath: process.env.GITHUB_PAGES === 'true' ? '/MILLER' : '',
  trailingSlash: true
};

export default nextConfig;

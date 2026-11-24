import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@trackdailytrade/shared'],
  devIndicators: false,
};

export default nextConfig;

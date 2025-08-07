import type { NextConfig } from "next";

const allowedDevOrigins = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];

const nextConfig: NextConfig = {
  transpilePackages: ['@lobehub/tts'],
  async headers() {
    return [
      {
        source: "/(.*)", // Match all routes
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: allowedDevOrigins.length > 0 ? allowedDevOrigins[0] : "*", // Use the first origin or wildcard
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_TWITCH_CLIENT_ID: process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID!,
    TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET!,
    ALPHA_VANTAGE_API_KEY: process.env.ALPHA_VANTAGE_API_KEY!
  }
};

export default nextConfig;

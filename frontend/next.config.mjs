/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Preserve the registered Google callback URL; authentication itself lives in FastAPI.
  async rewrites() {
    return [{ source: "/api/auth/callback/google", destination: "http://127.0.0.1:8005/api/auth/callback/google" }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "ik.imagekit.io" },
      { protocol: "https", hostname: "images.unsplash.com" }
    ]
  }
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  optimizeFonts: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
      // Esto es específico para Server Actions
      allowedOrigins: [
          'localhost:3000', 
          '*.cloudworkstations.dev', 
          '*.googleusercontent.com',
          '*.idx.dev'
      ],
      // Desactivamos el chequeo de origen solo en desarrollo.
      checkOrigin: process.env.NODE_ENV === 'development' ? false : undefined,
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        dns: false,
        net: false,
        tls: false,
        bindings: false,
        'better-sqlite3': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;

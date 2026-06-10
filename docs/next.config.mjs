import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Pin the workspace root to this app. Without it, Next walks up to the
  // monorepo root (it sees the parent package-lock.json) and pulls in the main
  // app's instrumentation.ts / file tracing. This docs app is built in isolation.
  turbopack: {
    root: import.meta.dirname,
  },
  outputFileTracingRoot: import.meta.dirname,
};

export default withMDX(config);

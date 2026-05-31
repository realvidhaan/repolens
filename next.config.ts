import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project sits beside sibling projects that also have lockfiles, so Next
  // would otherwise infer the wrong workspace root. Pin it to this folder.
  turbopack: { root: __dirname },
};

export default nextConfig;

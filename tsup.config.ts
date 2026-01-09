import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: "es2022",
  outDir: "dist",
  external: [
    "zlib", // Node.js built-in module, used via dynamic import with fallback
    "@noble/hashes",
    "@noble/hashes/blake3.js",
    "@noble/post-quantum",
    "@noble/post-quantum/ml-dsa.js",
    "@noble/post-quantum/ml-kem.js",
  ],
  esbuildOptions(options) {
    options.platform = "neutral";
  },
});


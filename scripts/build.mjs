import { mkdir, cp, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await cp("src/features/warm-redesign-v3", "dist/preview/warm-v3", {
  recursive: true,
});
console.log(
  "Built preview assets in dist; run python3 server.py for role-filtered API.",
);

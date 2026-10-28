const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  });
  const host = await b.newContext();
  const player = await b.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const base = process.env.PREVIEW_URL || "http://127.0.0.1:3333";
  for (const [c, role] of [
    [host, "host"],
    [player, "player"],
  ])
    await c.request.post(base + "/api/login", {
      data: { role, name: "QA", code: "PREVIEW-HOST", player: 0 },
    });
  const act = async (a, v) => {
    let r = await host.request.post(base + "/api/action", {
      data: { action: a, value: v },
    });
    assert(r.ok());
  };
  const p = await player.newPage();
  await act("phase", "memorize");
  await p.goto(base + "/preview/warm-v3/?screen=player-07");
  await p.locator(".shelf").waitFor();
  await p.screenshot({
    path: "qa/screenshots/state-shelf-memorize-touch.png",
    fullPage: true,
  });
  await act("phase", "reconstruct");
  await player.request.post(base + "/api/action", {
    data: { action: "shelf", value: Array(14).fill(null) },
  });
  await p.reload();
  await p.locator('[data-card="Кофе"]').tap();
  await p.locator('[data-slot="0"]').tap();
  await p.locator('[data-slot="0"] [data-item="Кофе"]').waitFor();
  await p.screenshot({
    path: "qa/screenshots/state-shelf-touch-placement.png",
    fullPage: true,
  });
  const hp = await host.newPage({ viewport: { width: 1440, height: 900 } });
  await hp.goto(base + "/preview/warm-v3/?screen=host-12");
  await host.request.post(base + "/api/action", { data: { action: "round" } });
  await host.request.post(base + "/api/action", {
    data: { action: "resolve" },
  });
  await hp.reload();
  await hp.getByText("Ничья — нужен новый тур").first().waitFor();
  await hp.screenshot({
    path: "qa/screenshots/state-vote-tie.png",
    fullPage: true,
  });
  console.log("PASS touch selection/placement + state screenshots");
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

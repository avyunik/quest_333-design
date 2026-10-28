const { chromium } = require("playwright");
const fs = require("fs");
const assert = require("node:assert/strict");
const base = process.env.PREVIEW_URL || "http://127.0.0.1:3333";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  });
  const errors = [];
  const host = await browser.newContext();
  const player = await browser.newContext();
  const observer = await browser.newContext();
  async function login(ctx, role, p = 0) {
    let r = await ctx.request.post(base + "/api/login", {
      data: {
        role,
        player: p,
        name: role === "host" ? "Ведущий" : "Участник",
        code: "PREVIEW-HOST",
      },
    });
    assert(r.ok());
  }
  async function act(ctx, action, value, extra = {}) {
    let r = await ctx.request.post(base + "/api/action", {
      data: { action, value, ...extra },
    });
    assert(r.ok(), await r.text());
    return r.json();
  }
  await login(host, "host");
  await login(player, "player");
  await login(observer, "player", 1);
  await act(host, "reset");
  const hp = await host.newPage(),
    pp = await player.newPage();
  for (const p of [hp, pp]) p.on("pageerror", (e) => errors.push(e.message));
  async function open(p, id) {
    await p.goto(base + "/preview/warm-v3/?screen=" + id);
    await p.locator(".episode-heading,.landing").waitFor();
  }
  // Pilot: book error and success, shelf phases and all 14 placements, cash count.
  await open(hp, "host-05");
  await hp.locator("input[name=answer]").fill("000");
  await hp.locator(".answer button").click();
  await hp.getByText("Номер не отвечает. Проверьте цифры.").first().waitFor();
  await hp.locator("input[name=answer]").fill("3331998");
  await hp.locator(".answer button").click();
  await hp.getByText("Номер найден").first().waitFor();
  await act(host, "phase", "memorize");
  await open(pp, "player-07");
  assert.equal(await pp.locator(".slot").count(), 14);
  await act(host, "phase", "reconstruct");
  await open(pp, "player-08");
  const key = [
    "Кофе",
    "Мыло",
    "Атлас",
    "Лампа",
    "Соус",
    "Термос",
    "Свеча",
    "Чай",
    "Крекер",
    "Шнур",
    "Радио",
    "Календарь",
    "Вода",
    "Аптечка",
  ];
  for (let i = 0; i < key.length; i++) {
    await pp.locator(`[data-card="${key[i]}"]`).click();
    await pp.locator(`[data-slot="${i}"]`).click();
    await pp.locator(".toast").getByText("Готово", { exact: true }).waitFor();
  }
  await pp.getByRole("button", { name: "Проверить порядок" }).click();
  await pp.getByText("14 из 14 на своих местах").waitFor();
  await open(hp, "host-11");
  await hp.locator('[data-drum="1"][data-team="alpha"]').selectOption("ключ");
  await hp.locator("[data-action=pull][data-team=alpha]").click();
  await hp.getByText("2 из 5 совпало").waitFor();
  fs.mkdirSync("qa/screenshots", { recursive: true });
  await hp.screenshot({
    path: "qa/screenshots/pilot-cash-attempt.png",
    fullPage: true,
  });
  // Roles, drawing, voting, results.
  await act(player, "role", "giver");
  await act(host, "confirm");
  await open(pp, "player-04");
  await pp.locator("[name=clue]").fill("солнце");
  await pp.locator("#clue button").click();
  await pp.getByText("солнце", { exact: true }).waitFor();
  await open(pp, "player-11");
  const box = await pp.locator("#drawing").boundingBox();
  await pp.mouse.move(box.x + 40, box.y + 40);
  await pp.mouse.down();
  await pp.mouse.move(box.x + 170, box.y + 150, { steps: 8 });
  await pp.mouse.up();
  await pp.locator(".toast").getByText("Готово", { exact: true }).waitFor();
  let r = await observer.request.post(base + "/api/action", {
    data: { action: "answer", kind: "puzzle", value: "маяк" },
  });
  assert(r.ok());
  await open(hp, "host-10");
  await hp.getByRole("button", { name: "Принять ответ", exact: true }).click();
  await hp.getByText("Принято ведущим").waitFor();
  await act(player, "vote", "Лес");
  await act(observer, "vote", "Шоссе");
  await open(hp, "host-12");
  await hp.locator("[data-action=resolve][data-team=alpha]").click();
  await hp.getByText("Ничья — нужен новый тур").first().waitFor();
  await hp.locator("[data-action=round][data-team=alpha]").click();
  await open(pp, "player-14");
  await pp
    .getByRole("button", { name: "Preview: перейти к результатам" })
    .click();
  await pp.getByRole("heading", { name: "Итоги ночной смены" }).waitFor();
  // Complete route/viewport QA; prepare the correct shelf phase per screen.
  const screens = JSON.parse(
    fs.readFileSync("design/redesign-warm-v3/SCREENS.json"),
  ).screens;
  let shots = 0;
  let overflow = [];
  for (const [w, h] of [
    [1440, 900],
    [1280, 900],
    [768, 1024],
    [390, 844],
  ]) {
    for (const s of screens) {
      if (s.id === "player-07") await act(host, "phase", "memorize");
      if (s.id === "player-08") await act(host, "phase", "reconstruct");
      const p = s.role === "host" ? hp : pp;
      await p.setViewportSize({ width: w, height: h });
      await open(p, s.id);
      await p.screenshot({
        path: `qa/screenshots/${s.id}-${w}.png`,
        fullPage: true,
      });
      shots++;
      if (
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        overflow.push(s.id + "@" + w);
    }
  }
  assert.deepEqual(overflow, []);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "qa/browser-results.json",
    JSON.stringify(
      {
        shots,
        viewports: 4,
        screens: 28,
        overflow,
        errors,
        scenarios: [
          "book invalid/valid",
          "shelf show/hide/place/check",
          "cash attempt count",
          "role confirmation and clue",
          "drawing/team answer/host accept",
          "vote/tie/new round",
          "finale preview/results",
        ],
      },
      null,
      2,
    ),
  );
  await browser.close();
  console.log(
    `PASS: ${shots} screenshots; 7 scenario groups; no page errors or horizontal overflow`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

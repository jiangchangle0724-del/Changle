// The tool on real pages: a host makes a gathering, guests fill in on their own phones, everyone
// sees the same counts without reloading, the host sets the time, every page then asks what's next,
// and another phone takes over with the admin code. Each phone is its own browser context, so each
// has its own storage.
import { expect, test } from "@playwright/test";
import { addDays, dayNoteText, vancouverDay } from "../../src/engine";
import { ANDROID, KEY, WECHAT, calendarFile, catchCopies, cell, copied, join, make, phone, saved } from "./helpers";

test("make, fill in on two phones, set the time", async ({ browser }) => {
  const host = await phone(browser);
  await catchCopies(host);
  const { url, code } = await make(host, "周末火锅");
  await expect(host).toHaveTitle(/周末火锅/);
  expect((await host.request.get(calendarFile(code))).status(), "no calendar file before a time is set").toBe(404);
  await expect(host.locator(".event-head h1")).toHaveText("周末火锅");

  // tapping a slot before giving a name asks for the name instead
  await cell(host, 2).click();
  await expect(host.locator(".name-form .problem")).toBeVisible();
  await host.fill(".name-form input", "Steve");
  await host.click(".name-form .btn");
  await expect(host.locator(".you")).toContainText("Steve");

  // one tap is free, two is could-move-things, three clears
  await cell(host, 2).click();
  await expect(cell(host, 2)).toHaveAttribute("data-mine", "yes");
  await cell(host, 5).click();
  await cell(host, 5).click();
  await expect(cell(host, 5)).toHaveAttribute("data-mine", "maybe");
  await cell(host, 8).click();
  await cell(host, 8).click();
  await cell(host, 8).click();
  await expect(cell(host, 8)).toHaveAttribute("data-mine", "no");
  await saved(host);

  // a guest opens the link on another phone: sees the host's answers, adds their own
  const guest = await phone(browser);
  await join(guest, url, "阿May");
  await expect(guest.locator(".meta")).toContainText("2");
  await expect(guest.locator(".link-btn", { hasText: "我是发起人" })).toBeVisible();
  await cell(guest, 2).click();
  await cell(guest, 4).click();
  await saved(guest);

  // the host's page catches up by itself
  await host.click(".seg button:nth-child(2)");
  await expect(host.locator(".meta")).toContainText("2");
  await expect(cell(host, 2).locator("b")).toHaveText("2");
  await expect(cell(host, 4).locator("b")).toHaveText("1");
  await expect(host.locator(".best li").first()).toContainText("2 个人里 2 个有空");

  // a guest has no way to set the time; the host does, and the guest's page shows it
  await guest.click(".seg button:nth-child(2)");
  await expect(guest.locator(".best .btn")).toHaveCount(0);
  await host.locator(".best li").first().locator(".btn").click();
  await expect(host.locator(".set")).toContainText("定了");
  await expect(guest.locator(".set")).toContainText("2 个人里 2 个有空");

  // everyone can put it in their calendar: an iPhone gets the file, with Google Calendar beside it
  for (const page of [host, guest]) {
    await expect(page.locator(".set a.btn")).toHaveAttribute("href", calendarFile(code));
    await expect(page.locator(".set a.btn")).toHaveText("加到日历");
    const google = new URL((await page.locator(".set a.link-btn").getAttribute("href"))!);
    expect(google.origin + google.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(google.searchParams.get("text")).toBe("周末火锅");
    expect(google.searchParams.get("dates")).toMatch(/^\d{8}T010000Z\/\d{8}T050000Z$/);
    expect(google.searchParams.get("details")).toContain(`/when/${code}`);
  }
  // the file itself: this evening, 18:00 to 22:00 in Vancouver, written in UTC
  const file = await host.request.get(calendarFile(code));
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
  expect(file.headers()["cache-control"]).toBe("no-store");
  const ics = await file.text();
  expect(ics).toContain("SUMMARY:周末火锅\r\n");
  expect(ics).toContain(`UID:${code}@when.changle.ca\r\n`);
  expect(ics).toMatch(/DTSTART:\d{8}T010000Z\r\nDTEND:\d{8}T050000Z\r\n/);

  // then every page asks what's next. The words for the group chat, in Chinese and in English:
  await expect(guest.locator(".after")).toContainText("接着定什么");
  await host.locator(".after .copy .btn").first().click();
  await expect(host.locator(".after .copy .btn").first()).toContainText("复制好了");
  expect(await copied(host)).toMatch(new RegExp(`^「周末火锅」定了：\\d+月\\d+日 周. 晚上。2 个人里 2 个有空。\\n\\S+/when/${code}$`));
  await host.locator(".after .copy .btn").nth(1).click();
  await expect.poll(() => copied(host)).toMatch(new RegExp(`^"周末火锅" is set: \\w{3}, \\w{3} \\d+, evening\\. 2 of 2 free\\.\\n\\S+/when/${code}$`));
  // on to 随便 with the day, dinner time, the occasion and who can come: the host only, so one
  // gathering opens one table. Tonight is within the week 随便 plans for.
  await expect(host.locator(".after a[href^='/eat/']")).toHaveAttribute("href", new RegExp(`^/eat/\\?from=when&code=${code}&date=\\d{4}-\\d\\d-\\d\\d&time=18%3A30&occasion=friends&people=2$`));
  await expect(guest.locator(".after a[href^='/eat/']")).toHaveCount(0);
  await expect(guest.locator(".after")).toContainText("等发起人");
  await expect(host.locator(".after a[href='/']")).toBeVisible();

  // it all survives a reload, and each phone is still who it was
  await guest.reload();
  await expect(guest.locator(".you")).toContainText("阿May");
  await expect(guest.locator(".set")).toBeVisible();
  await host.reload();
  await expect(host.locator(".you")).toContainText("Steve");
  await expect(host.locator(".stepper")).toBeVisible();
});

test("a day more than a week away: 随便 opens for it that week, and reopening takes the question away", async ({ browser }) => {
  const host = await phone(browser);
  const { url, code } = await make(host, "下下周烧烤");
  await join(host, url, "Steve");
  // three slots a day: the 27th is the evening eight days from today
  await cell(host, 26).click();
  await saved(host);
  await host.click(".seg button:nth-child(2)");
  await host.locator(".best li").first().locator(".btn").click();
  await expect(host.locator(".after")).toBeVisible();
  await expect(host.locator(".after a[href^='/eat/']")).toHaveCount(0);
  await expect(host.locator(".after button:disabled")).toHaveText("那周再来选");
  await expect(host.locator(".after")).toContainText("起可以选");
  // in English too
  await host.click(".bar-lang");
  await expect(host.locator(".after button:disabled")).toHaveText("Come back that week");
  await expect(host.locator(".after .panel-title")).toHaveText("What's next?");
  // the host picks again: nothing is set, so there's nothing to ask
  await host.locator(".set button.link-btn").click();
  await expect(host.locator(".set")).toHaveCount(0);
  await expect(host.locator(".after")).toHaveCount(0);
  expect((await host.request.get(calendarFile(code))).status(), "and the calendar file goes with it").toBe(404);
});

test("a holiday among the days is said above its day, in both languages", async ({ browser }) => {
  // Which day depends on today: the first one the home page can reach (eight weeks) that has
  // something to say, asked about together with the day before it. The dates themselves are
  // checked in tests/holidays.test.ts and the words in tests/daynotes.test.ts.
  const today = vancouverDay(Date.now());
  const reach = Array.from({ length: 53 }, (_, i) => addDays(today, i + 2));
  const noted = reach.find((day) => dayNoteText(day, [addDays(day, -1), day], "zh") !== "");
  test.skip(!noted, "no holiday, festival or long weekend in the next eight weeks (holidays.ts runs to the end of 2028)");
  const days = [addDays(noted!, -1), noted!];

  const host = await phone(browser);
  const { url } = await make(host, "过节聚一聚", days);
  await join(host, url, "Steve");
  const rows = host.locator(".grid-row:not(.grid-heads)");
  await expect(rows).toHaveCount(2);
  for (const lang of ["zh", "en"] as const) {
    for (const [i, day] of days.entries()) {
      const words = dayNoteText(day, days, lang);
      if (words) await expect(rows.nth(i).locator(".grid-note"), `${day} in ${lang}`).toHaveText(words);
      else await expect(rows.nth(i).locator(".grid-note"), `${day} in ${lang}`).toHaveCount(0);
    }
    // everyone's view is the same grid
    await host.click(".seg button:nth-child(2)");
    await expect(host.locator(".grid-note").first()).toBeVisible();
    await host.click(".seg button:nth-child(1)");
    if (lang === "zh") await host.click(".bar-lang");
  }
});

test("quick fill: weekends, evenings, a whole day, everything; one tap takes such a slot back; undo", async ({ browser }) => {
  const page = await phone(browser);
  const { url } = await make(page, "周末火锅");
  // fourteen days in a row, three slots each: two weekends among them
  const days = 14;
  const free = page.locator('.grid .cell[data-mine="yes"]');
  const chip = (name: string) => page.locator(".quick button", { hasText: name });
  const undo = page.locator(".toast .link-btn");
  const clear = page.locator(".grid-foot .link-btn");

  // before there's a name, a quick fill asks for it like a tap does
  await chip("全都行").click();
  await expect(page.locator(".name-form .problem")).toBeVisible();
  await expect(free).toHaveCount(0);
  await join(page, url, "Steve");

  // weekends, and off again
  await chip("周末都行").click();
  await expect(free).toHaveCount(4 * 3);
  await expect(chip("周末都行")).toHaveAttribute("aria-pressed", "true");
  await chip("周末都行").click();
  await expect(free).toHaveCount(0);
  await expect(clear).toHaveCount(0);

  // every evening
  await chip("晚上都行").click();
  await expect(free).toHaveCount(days);
  await expect(chip("晚上都行")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("全都行")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".toast")).toContainText("没空的点一下就去掉");
  await saved(page);
  // a slot filled that way goes with one tap (one tapped by hand would become "could move things")
  await cell(page, 2).click();
  await expect(cell(page, 2)).toHaveAttribute("data-mine", "no");
  await expect(chip("晚上都行")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".toast")).toHaveCount(0);
  // from there it's the usual round: free, could move things
  await cell(page, 2).click();
  await expect(cell(page, 2)).toHaveAttribute("data-mine", "yes");
  await cell(page, 2).click();
  await expect(cell(page, 2)).toHaveAttribute("data-mine", "maybe");

  // a whole day by its name (the second day), and back
  const day = page.locator("button.grid-date").nth(1);
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");
  for (const n of [3, 4, 5]) await expect(cell(page, n)).toHaveAttribute("data-mine", "yes");
  await day.click();
  for (const n of [3, 4, 5]) await expect(cell(page, n)).toHaveAttribute("data-mine", "no");
  // twelve evenings are left free, and the first is a maybe
  await expect(free).toHaveCount(days - 2);

  // everything; undo brings back exactly what was there
  await chip("全都行").click();
  await expect(free).toHaveCount(days * 3);
  await undo.click();
  await expect(free).toHaveCount(days - 2);
  await expect(cell(page, 2)).toHaveAttribute("data-mine", "maybe");
  await expect(page.locator(".toast")).toHaveCount(0);

  // clear all, and undo that too
  await clear.click();
  await expect(free).toHaveCount(0);
  await expect(cell(page, 2)).toHaveAttribute("data-mine", "no");
  await expect(page.locator(".toast")).toContainText("去掉了");
  await undo.click();
  await expect(free).toHaveCount(days - 2);
  await saved(page);

  // a reload shows what was saved, and no longer knows which slots were filled in one go
  await page.reload();
  // someone coming back is shown everyone first: wait for that, then go back to filling in
  await expect(page.locator(".seg button:nth-child(2)")).toHaveAttribute("aria-pressed", "true");
  await page.click(".seg button:nth-child(1)");
  await expect(free).toHaveCount(days - 2);
  await expect(cell(page, 2)).toHaveAttribute("data-mine", "maybe");
  await cell(page, 8).click();
  await expect(cell(page, 8)).toHaveAttribute("data-mine", "maybe");

  // in English; and everyone's view has no quick fill
  await page.click(".bar-lang");
  await expect(page.locator(".quick button")).toHaveText(["All free", "Weekends", "Evenings"]);
  await page.click(".seg button:nth-child(2)");
  await expect(page.locator(".quick")).toHaveCount(0);
  await expect(page.locator("button.grid-date")).toHaveCount(0);
});

test("inside WeChat the page says how to get out; an Android phone goes to Google Calendar", async ({ browser }) => {
  // the host is in WeChat's own browser, where most gatherings start
  const host = await (await browser.newContext({ userAgent: WECHAT })).newPage();
  const { url, code } = await make(host, "生日饭");
  await join(host, url, "Steve");
  await cell(host, 4).click(); // tomorrow afternoon
  await saved(host);
  await host.click(".seg button:nth-child(2)");
  await host.locator(".best li").first().locator(".btn").click();
  await expect(host.locator(".set")).toBeVisible();
  // neither a calendar file nor Google Calendar opens there: the button says where to go instead
  await expect(host.locator(".set a")).toHaveCount(0);
  await expect(host.locator(".set [role=status]")).toHaveCount(0);
  await host.locator(".set .btn").click();
  await expect(host.locator(".set [role=status]")).toContainText("在浏览器打开");
  // and 随便 can't sign anyone in there: a note, and its link to copy
  await expect(host.locator(".after .note")).toContainText("微信里不能用 Google 登录");
  await expect(host.locator(".after .copy .btn").last()).toContainText("复制随便的链接");

  // a guest on an Android phone: Google Calendar first, the file beside it
  const android = await (await browser.newContext({ userAgent: ANDROID })).newPage();
  await android.goto(url);
  const main = android.locator(".set a.btn");
  await expect(main).toHaveAttribute("target", "_blank");
  const google = new URL((await main.getAttribute("href"))!);
  expect(google.origin + google.pathname).toBe("https://calendar.google.com/calendar/render");
  expect(google.searchParams.get("text")).toBe("生日饭");
  expect(google.searchParams.get("dates")).toMatch(/^\d{8}T200000Z\/\d{8}T000000Z$/);
  await expect(android.locator(".set a.link-btn")).toHaveAttribute("href", calendarFile(code));
  await expect(android.locator(".set a.link-btn")).toHaveText("下载日历文件");
});

test("two phones tap the same slot at once: both answers stay", async ({ browser }) => {
  const host = await phone(browser);
  const { url } = await make(host, "桌游");
  const [a, b] = [await phone(browser), await phone(browser)];
  await Promise.all([join(a, url, "甲"), join(b, url, "乙")]);
  await Promise.all([cell(a, 7).click(), cell(b, 7).click()]);
  await Promise.all([saved(a), saved(b)]);
  for (const page of [a, b, host]) {
    await page.click(".seg button:nth-child(2)");
    await expect(cell(page, 7).locator("b")).toHaveText("2");
  }
  await a.reload();
  await a.click(".seg button:nth-child(2)");
  await expect(cell(a, 7).locator("b")).toHaveText("2");
});

test("nobody can write someone else's row, or set the time without being a host", async ({ browser, request }) => {
  const host = await phone(browser);
  const { url, code } = await make(host, "爬山");
  const guest = await phone(browser);
  await join(guest, url, "阿May");
  await cell(guest, 1).click();
  await saved(guest);

  const state = await (await request.get(`/when/api/e/${code}`)).json();
  const may = state.state.people[0];
  expect(may.name).toBe("阿May");
  expect(JSON.stringify(state)).not.toContain("Hash");

  // a stranger's key with May's id
  const stranger = "A".repeat(43);
  const steal = await request.post(`/when/api/e/${code}/me`, { headers: { [KEY]: stranger }, data: { id: may.id, name: "阿May", answers: {} } });
  expect(steal.status()).toBe(403);
  const settle = await request.post(`/when/api/e/${code}/host`, { headers: { [KEY]: stranger }, data: { do: "settle", slot: Object.keys(may.answers)[0] } });
  expect(settle.status()).toBe(403);
  const nokey = await request.post(`/when/api/e/${code}/me`, { data: { name: "x", answers: {} } });
  expect(nokey.status()).toBe(400);
  const after = await (await request.get(`/when/api/e/${code}`)).json();
  expect(after.state.people).toEqual(state.state.people);
  expect(after.state.settled).toBeNull();
});

test("another phone becomes the host with the admin code; a wrong code is refused", async ({ browser }) => {
  const host = await phone(browser);
  const { url, adminCode } = await make(host, "生日");
  const other = await phone(browser);
  await join(other, url, "新手机");
  await other.click(".link-btn:has-text('我是发起人')");
  // the sheet opens with the cursor in its field, ready to type
  await expect(other.locator(".code-input")).toBeFocused();
  const wrong = adminCode === "000000" ? "000001" : "000000";
  await other.fill(".code-input", wrong);
  await other.click(".claim .btn");
  await expect(other.locator(".claim .problem")).toHaveText("管理码不对");
  await other.fill(".code-input", adminCode);
  await other.click(".claim .btn");
  await expect(other.locator(".stepper")).toBeVisible();
  // and it can do a host's things: at least two people now
  await other.click(".stepper button:last-child");
  await expect(other.locator(".stepper output")).toHaveText("2");
  await expect(host.locator(".stepper output")).toHaveText("2");
});

test("a link to a gathering that isn't there says so, in English too", async ({ browser }) => {
  const page = await phone(browser);
  const res = await page.goto("/when/zzzzzzzz");
  expect(res!.status()).toBe(404);
  await expect(page.locator(".empty h1")).toHaveText("找不到这个聚会");
  await page.click(".bar-lang");
  await expect(page.locator(".empty h1")).toHaveText("Can't find this gathering");
  await page.click(".empty .btn");
  await expect(page.locator(".hero h1")).toContainText("When Works");
});

test("a page runs its own files and Cloudflare's visitor statistics, and nothing else", async ({ request }) => {
  // a page that is there and one that isn't: both are pages, with the same headers
  for (const path of ["/when/", "/when/zzzzzzzz"]) {
    const res = await request.get(path);
    const policy = Object.fromEntries(
      (res.headers()["content-security-policy"] ?? "").split("; ").map((part) => {
        const [name, ...sources] = part.split(" ");
        return [name, sources];
      }),
    );
    expect(policy["default-src"], path).toEqual(["'self'"]);
    expect(policy["script-src"], path).toEqual(["'self'", "https://static.cloudflareinsights.com"]);
    expect(policy["connect-src"], path).toEqual(["'self'", "https://cloudflareinsights.com", "wss://changle.ca", "ws://127.0.0.1:*", "ws://localhost:*"]);
    expect(policy["style-src"], path).toEqual(["'self'"]);
    expect(policy["frame-ancestors"], path).toEqual(["'none'"]);
    expect(res.headers()["cache-control"], path).toBe("no-store");
  }
});

test("nothing is wider than a small phone, and every button can be pressed", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
  const page = await context.newPage();
  const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  for (const lang of ["zh", "en"]) {
    await page.goto("/when/");
    if (lang === "en") await page.click(".bar-lang");
    await fits();
    const { url } = await make(page, lang === "zh" ? "周末火锅和桌游，顺便看个电影" : "Hot pot, board games and a late movie");
    // names are 16 characters at most: these are as long as they get
    await join(page, url, lang === "zh" ? "名字特别特别长的一位老朋友啊哈哈" : "A long-named pal");
    await cell(page, 0).click();
    await saved(page);
    await fits();
    await page.click(".seg button:nth-child(2)");
    await fits();
    // and with the time set, when the page asks what's next
    await page.locator(".best li").first().locator(".btn").click();
    await expect(page.locator(".after")).toBeVisible();
    await fits();
    const small = await page.evaluate(() => [...document.querySelectorAll("button, a.btn")].filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 43.5).map((el) => el.className + ":" + el.textContent));
    expect(small).toEqual([]);
  }
  await context.close();
});

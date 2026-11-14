// The pictures to pass around: the invitation and, once the time is set, the result. Each is
// drawn in the phone; these tests read the drawn picture back, pixel by pixel where it matters:
// the code in it has to be the code of this gathering's link.
import { expect, test, type Page } from "@playwright/test";
import qrcode from "qrcode-generator";
import { H, W, codePlace, type Picture } from "../../src/client/picture";
import { WECHAT, cell, join, make, phone, saved } from "./helpers";

/** What the picture in the open sheet is, and what a few of its places look like. */
async function read(page: Page, kind: Picture["kind"], link: string) {
  // the code a scanner should find: the same maker, the same link
  const qr = qrcode(0, "M");
  qr.addData(link);
  qr.make();
  const n = qr.getModuleCount();
  let wanted = "";
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) wanted += qr.isDark(row, col) ? "1" : "0";

  const img = page.locator("img.share-img");
  await expect(img).toBeVisible();
  const seen = await img.evaluate(
    async (el: HTMLImageElement, { n, left, top, cell }) => {
      await el.decode();
      const canvas = document.createElement("canvas");
      canvas.width = el.naturalWidth;
      canvas.height = el.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(el, 0, 0);
      const light = (x: number, y: number) => {
        const [r, g, b] = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return (r * 299 + g * 587 + b * 114) / 1000;
      };
      // the middle of every module of the code
      let code = "";
      for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) code += light(left + (col + 0.5) * cell, top + (row + 0.5) * cell) < 128 ? "1" : "0";
      // how much of a band is bright (words on the dark middle), and the brightest the lamp at the top gets
      const bright = (y0: number, y1: number) => {
        const { data } = ctx.getImageData(72, y0, canvas.width - 144, y1 - y0);
        let count = 0;
        for (let i = 0; i < data.length; i += 4) if ((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000 > 150) count++;
        return count;
      };
      let lamp = 0;
      for (let x = 430; x <= 650; x += 10) for (let y = 130; y <= 220; y += 10) lamp = Math.max(lamp, light(x, y));
      // nothing on the page cancels the menu a press and hold brings up
      const held = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      el.dispatchEvent(held);
      return {
        type: el.src.slice(0, el.src.indexOf(";")),
        width: el.naturalWidth,
        height: el.naturalHeight,
        alt: el.alt,
        code,
        words: bright(330, 700),
        lamp,
        corner: light(20, 700),
        held: !held.defaultPrevented,
      };
    },
    { n, ...codePlace(kind, n) },
  );
  return { seen, wanted };
}

test("the invitation is a picture whose code is this gathering's link", async ({ browser }) => {
  const host = await phone(browser);
  const { url, code } = await make(host, "周末火锅");
  await host.locator(".event-head button", { hasText: "邀请图" }).click();
  await expect(host.locator(".sheet h2")).toHaveText("邀请图");
  const { seen, wanted } = await read(host, "invite", url);
  expect(seen.type).toBe("data:image/jpeg");
  expect([seen.width, seen.height]).toEqual([W, H]);
  expect(seen.alt).toContain("周末火锅");
  expect(seen.code, "every module of the code, dark or light, as the link's code has it").toBe(wanted);
  expect(seen.words, "the name, the question and the days are drawn").toBeGreaterThan(8000);
  expect(seen.lamp, "the background picture is there: its lamp is lit").toBeGreaterThan(120);
  expect(seen.corner, "and the middle stays dark").toBeLessThan(40);
  // pressing and holding the picture isn't cancelled (the styles that allow it are checked in tests/design.test.ts)
  expect(seen.held).toBe(true);
  // outside WeChat it can also be saved with a button
  const save = host.locator(".share-actions a[download]");
  await expect(save).toHaveAttribute("download", `when-${code}-invite.jpg`);
  expect((await save.getAttribute("href"))!.startsWith("data:image/jpeg;base64,")).toBe(true);
  const [download] = await Promise.all([host.waitForEvent("download"), save.click()]);
  expect(download.suggestedFilename()).toBe(`when-${code}-invite.jpg`);
  await expect(host.locator(".sheet .hint")).toContainText("长按图片");

  // in English the picture is drawn again, with the same code
  await host.click(".sheet .icon-btn");
  await host.click(".bar-lang");
  await host.locator(".event-head button", { hasText: "Invitation" }).click();
  const english = await read(host, "invite", url);
  expect(english.seen.code).toBe(english.wanted);
  expect(english.seen.alt).toContain("Invitation");
});

test("once the time is set there is a result picture; in WeChat a picture is only pressed and held", async ({ browser }) => {
  const host = await phone(browser);
  const { url, code } = await make(host, "周末火锅");
  await join(host, url, "Steve");
  await cell(host, 5).click();
  await saved(host);
  // no result picture before there is a result
  await expect(host.locator("button", { hasText: "结果图" })).toHaveCount(0);
  await host.click(".seg button:nth-child(2)");
  await host.locator(".best li").first().locator(".btn").click();
  await expect(host.locator(".after")).toBeVisible();

  await host.locator(".after button", { hasText: "结果图" }).click();
  const { seen, wanted } = await read(host, "result", url);
  expect([seen.type, seen.width, seen.height]).toEqual(["data:image/jpeg", W, H]);
  expect(seen.code).toBe(wanted);
  expect(seen.alt).toContain("1 个人里 1 个有空");
  expect(seen.words).toBeGreaterThan(8000);
  await expect(host.locator(".share-actions a[download]")).toHaveAttribute("download", `when-${code}-result.jpg`);

  // a guest in WeChat: the same pictures, and no buttons that wouldn't work there
  const guest = await phone(browser, { userAgent: WECHAT });
  await guest.goto(url);
  await guest.locator(".after button", { hasText: "结果图" }).click();
  const inWeChat = await read(guest, "result", url);
  expect(inWeChat.seen.code).toBe(inWeChat.wanted);
  await expect(guest.locator(".sheet .hint")).toContainText("长按图片");
  await expect(guest.locator(".share-actions")).toHaveCount(0);
});

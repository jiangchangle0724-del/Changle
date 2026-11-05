"""
The wishlist on a phone: a wish takes a name, a description and the rules; what got made folds away.
Runs against the local site and worker (worker/.dev.vars: DEV_SHOW_CODES=1,
MASTER_EMAIL=master@example.test, ADMIN_EMAILS=master@example.test).

  - the form: the promise of the gold frame and limited outfits (signed out: sign in first), the
    button waiting until all three are filled in, the counts, both languages, game and feature
  - a wish goes in and shows its description, its rules folded away until tapped
  - a turned-down wish says which field and why, and that field gets the cursor
  - a half-written wish survives a trip to another tab
  - made wishes (the seeded games are all made) are off the list, in a folded "already made" section
  - signed in, the promise shows your own face in the gold frame
  - the owner marks a wish made: it leaves the list for that section

  python3 scripts/wish_check.py [base_url] [api_url] [out_dir]
"""
import random
import string
import sys

import admin_check as ac
from playwright.sync_api import sync_playwright

fails: list[str] = []
errors: list[str] = []


def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        fails.append(what)


def phone(browser, reduced=False):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme="dark", locale="zh-CN", reduced_motion="reduce" if reduced else "no-preference")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror {e}"))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(f"console {m.text}"))
    return ctx, page


def open_wishes(page):
    page.goto(ac.BASE + "#/wish")
    page.wait_for_selector(".wish-form")
    page.wait_for_selector(".wish > .wish-list:not([aria-busy]), .wish > .ui-empty", timeout=10000)
    page.wait_for_timeout(700)


def to_top(page, sel):
    """Scroll so `sel` starts just under the tabs (which stay stuck to the top)."""
    page.evaluate(
        """s => {
          document.querySelector(s).scrollIntoView({ block: 'start' });
          const tabs = document.querySelector('.tabs');
          if (tabs) window.scrollBy(0, -(tabs.getBoundingClientRect().bottom + 12));
        }""",
        sel,
    )
    page.wait_for_timeout(450)


def text_of(page, sel):
    return page.locator(sel).inner_text().strip()


DESC = "大家轮流说一件自己做过的事，做过同样事的人喝一口。越离谱越好。"
RULES = "3 人以上。\n轮到的人说「我做过……」。\n也做过的人都喝一口，没人做过就自己喝。"


def main():
    tag = "".join(random.choice(string.ascii_lowercase) for _ in range(5))
    name = f"测试愿望 {tag}"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        vctx, v = phone(browser)
        open_wishes(v)
        made_before = v.locator(".wish-made .wish-item").count()

        # ---- the form, signed out ----
        check(v.locator(".wish-reward").count() == 1 and "金色头像框和限量服饰" in text_of(v, ".wish-reward"), "the form promises the gold frame and the limited outfits")
        check(v.locator(".wish-reward-signin .link-btn").count() == 1, "signed out, it says to sign in first, with a way to")
        submit = v.locator(".wish-form button[type=submit]")
        check(submit.is_disabled(), "the button waits while the form is empty")
        check(text_of(v, "#wish-desc-count") == "10 到 300 字" and text_of(v, "#wish-rules-count") == "10 到 600 字", "the counts say how much to write")
        check(v.locator("label[for=wish-desc]").inner_text() == "介绍" and v.locator("label[for=wish-rules]").inner_text() == "规则", "the fields have labels")
        check(v.locator("#wish-desc-hint").inner_text() != "" and v.locator("#wish-rules-hint").inner_text() != "", "and a line of help each")
        ac.shot(v, "wish-form-zh")

        v.fill("#wish-text", name)
        v.fill("#wish-desc", "太短了")
        check(text_of(v, "#wish-desc-count") == "还差 7 字" and submit.is_disabled(), "a short description: the count says how many more, the button still waits")
        v.fill("#wish-desc", DESC)
        check(submit.is_disabled(), "no rules yet: still waiting")
        v.press("#wish-text", "Enter")
        check(v.evaluate("document.activeElement.id") == "wish-desc", "Enter in the name moves on to the description")
        v.fill("#wish-rules", RULES)
        check(not submit.is_disabled(), "all three filled in: the button is ready")
        check(text_of(v, "#wish-desc-count") == f"{len(DESC)}/300" and v.locator("#wish-desc-count.is-ok").count() == 1, "the count turns to how many of 300, with a tick")

        # a half-written wish survives a trip to another tab
        v.locator(".tab[data-tab=party]").click()
        v.wait_for_timeout(600)
        v.locator(".tab[data-tab=wish]").click()
        v.wait_for_selector("#wish-rules")
        check(v.input_value("#wish-text") == name and v.input_value("#wish-rules") == RULES, "the half-written wish is still there after another tab")
        to_top(v, ".wish-form .seg")
        ac.shot(v, "wish-form-filled-zh")

        # turned down by the server: the message says which field, and the cursor goes there
        def turn_down(route):
            if route.request.method != "POST":
                return route.continue_()
            cors = {"Access-Control-Allow-Origin": ac.ORIGIN, "Access-Control-Allow-Credentials": "true", "Vary": "Origin"}
            route.fulfill(status=400, content_type="application/json", body='{"error":"rules-long"}', headers=cors)

        v.route("**/api/wishes", turn_down)
        submit.click()
        v.wait_for_selector(".wish-form .form-error")
        check(text_of(v, ".wish-form .form-error") == "规则最多 600 个字。" and v.evaluate("document.activeElement.id") == "wish-rules", "a turned-down wish says why, and the field gets the cursor")
        v.unroute("**/api/wishes")
        v.type("#wish-rules", " ")
        check(v.locator(".wish-form .form-error").count() == 0, "typing again clears the message")

        # ---- it goes in ----
        submit.click()
        item = v.locator(f".wish > .wish-list .wish-item:has-text('{name}')")
        item.wait_for(timeout=8000)
        check(item.locator(".wish-desc").inner_text() == DESC, "the new wish shows its description")
        rules = item.locator(".wish-rules")
        check(not rules.is_visible(), "its rules are folded away")
        check(v.input_value("#wish-text") == "" and v.input_value("#wish-desc") == "" and v.input_value("#wish-rules") == "", "the form is empty again")
        check(v.locator(".wish-sort button[aria-pressed=true]").inner_text() == "最新", "the list turns to newest, the new wish on top")
        item.locator(".wish-rules-btn").click()
        v.wait_for_timeout(700)
        check(rules.is_visible() and rules.inner_text() == RULES and item.locator(".wish-rules-btn[aria-expanded=true]").count() == 1, "tapping Rules unfolds them, line breaks and all")
        v.locator(".wish-sort button").first.click()
        v.wait_for_timeout(300)
        # (the most wanted wish with rules shows them, for the picture)
        top = v.locator(".wish > .wish-list .wish-rules-btn").first
        if top.get_attribute("aria-expanded") == "false":
            top.click()
            v.wait_for_timeout(700)
        to_top(v, ".wish-sort")
        ac.shot(v, "wish-list-zh")

        # ---- made wishes are off the list ----
        check(v.locator(".wish > .wish-list .wish-item.is-made").count() == 0 and v.locator(".wish > .wish-list .wish-status.is-done").count() == 0, "nothing made is on the main list")
        for seed in ["神回复", "尤克牌", "木头人蹦迪", "林波舞", "猜歌名", "额头便利贴", "最佳称号"]:
            if v.locator(f".wish > .wish-list .wish-item:has-text('{seed}')").count():
                check(False, f"the seeded {seed} is off the list")
        head = v.locator(".wish-made-head")
        check(head.count() == 1 and head.get_attribute("aria-expanded") == "false" and not v.locator("#wish-made-list").is_visible(), "made wishes sit in a folded 'already made' section")
        check(head.locator(".wish-made-n").inner_text() == str(made_before) and made_before >= 7, f"its count is how many were made ({made_before})")
        head.click()
        v.wait_for_timeout(700)
        check(v.locator("#wish-made-list").is_visible() and v.locator(".wish-made .wish-item.is-made").count() == made_before and v.locator(".wish-made .vote").count() == 0, "tapping it unfolds the made wishes (no votes on them)")
        to_top(v, ".wish-made")
        ac.shot(v, "wish-made-zh")
        v.screenshot(path=f"{ac.OUT}/wish-page-zh-full.png", full_page=True)

        # ---- English, and a feature ----
        v.locator(".lang-tab button[lang=en]").click()
        v.wait_for_timeout(400)
        check(v.locator("label[for=wish-text]").inner_text() == "Game name" and v.locator("label[for=wish-desc]").inner_text() == "Description" and v.locator("label[for=wish-rules]").inner_text() == "Rules", "English labels")
        check(text_of(v, "#wish-desc-count") == "10 to 300 characters" and "exclusive gold avatar frame and limited outfits" in text_of(v, ".wish-reward"), "English counts and promise")
        v.evaluate("window.scrollTo(0, 0)")
        v.wait_for_timeout(300)
        ac.shot(v, "wish-form-en")
        to_top(v, ".wish-sort")
        ac.shot(v, "wish-list-en")
        v.locator(".wish-form .seg button").nth(1).click()
        check(v.locator("label[for=wish-text]").inner_text() == "Feature name" and v.locator("label[for=wish-rules]").inner_text() == "How it works" and "If this feature goes live" in text_of(v, ".wish-reward"), "a feature: its own labels and promise")
        v.locator(".wish-form .seg button").nth(0).click()

        # ---- signed in: the promise shows your own face in the gold frame ----
        uctx, u = phone(browser)
        ac.signup(u, f"wisher.{tag}@example.com", "Wen")
        open_wishes(u)
        check(u.locator(".wish-reward .avatar.avatar-gold").count() == 1 and u.locator(".wish-reward-signin").count() == 0, "signed in: your face in the gold frame, no sign-in line")
        ac.shot(u, "wish-form-signed-in")

        # ---- reduced motion: the folds still work, at once ----
        rctx, r = phone(browser, reduced=True)
        open_wishes(r)
        ritem = r.locator(f".wish > .wish-list .wish-item:has-text('{name}')")
        ritem.locator(".wish-rules-btn").click()
        check(ritem.locator(".wish-rules").is_visible(), "with reduced motion the rules unfold at once")
        ritem.locator(".wish-rules-btn").click()
        check(not ritem.locator(".wish-rules").is_visible(), "and fold again")

        # ---- the owner marks it made: off the list, into the section ----
        octx, o = phone(browser)
        try:
            ac.signup(o, ac.MASTER, "Steve")
        except Exception:
            # (the owner had an account already: the code signed them straight in)
            o.goto(ac.BASE)
            o.wait_for_selector(".acct-me", timeout=10000)
        open_wishes(o)
        oitem = o.locator(f".wish > .wish-list .wish-item:has-text('{name}')")
        oitem.locator(".wish-admin .seg button").nth(2).click()
        o.wait_for_timeout(600)
        check(o.locator(f".wish > .wish-list .wish-item:has-text('{name}')").count() == 0, "the owner marks it made: it leaves the list")
        check(o.locator(".wish-made-n").inner_text() == str(made_before + 1) and o.locator(f".wish-made .wish-item:has-text('{name}')").count() == 1, "and joins the made ones")
        o.locator(".wish-made-head").click()
        o.wait_for_timeout(700)
        check(o.locator(f".wish-made .wish-item:has-text('{name}') .wish-admin").count() == 1, "where the owner can still change it")
        browser.close()

    for e in errors:
        print("ERROR", e)
    print(f"\n{len(fails)} failure(s), {len(errors)} page error(s)" if fails or errors else "\nall passed")
    sys.exit(1 if fails or errors else 0)


if __name__ == "__main__":
    main()

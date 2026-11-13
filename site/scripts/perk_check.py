"""
The wishlist's reward: a player wishes for a game; the owner marks it live; the player's phone
shows the news, their face gets the gold frame (header, table seat), and the limited outfits
unlock for them (and stay locked for others).

  python3 scripts/perk_check.py
"""
import random
import string
import sys

import admin_check as ac
from playwright.sync_api import sync_playwright

fails: list[str] = []


def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        fails.append(what)


def main():
    tag = "".join(random.choice(string.ascii_lowercase) for _ in range(5))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        octx, owner = ac.phone(browser)
        wctx, wisher = ac.phone(browser)
        try:
            ac.signup(owner, ac.MASTER, "Steve")
        except Exception:
            owner.goto(ac.BASE)
            owner.wait_for_selector(".acct-me", timeout=10000)
        ac.signup(wisher, f"wish.{tag}@example.com", "Wen")
        otok, wtok = ac.token_of(owner), ac.token_of(wisher)
        wish = {
            "text": f"真心话升级版 {tag}",
            "desc": "真心话大冒险，题目按大家的尺度一轮比一轮大胆。",
            "rules": "转瓶子选人，选真心话或大冒险。\n不答不做就喝一杯。",
            "kind": "game",
            "name": "Wen",
        }
        st, r = ac.call("POST", "/wishes", wtok, wish)
        wid = r.get("wish", {}).get("id")
        check(st == 200 and wid, f"the player makes a wish ({st})")
        pic = ac.jpeg()
        st, r = ac.call("POST", "/avatar/draw", wtok, {"image": pic, "mime": "image/jpeg", "from": "photo", "choices": {"outfit": "gala"}})
        check(st == 403 and r.get("error") == "locked", f"before: the limited outfits are locked ({st} {r.get('error')})")
        wisher.goto(ac.BASE)
        wisher.wait_for_selector(".acct-me", timeout=10000)
        wisher.wait_for_timeout(1500)

        st, _ = ac.call("PUT", f"/wishes/{wid}", otok, {"status": "done"})
        check(st == 200, "the owner marks the wish as made")
        try:
            wisher.wait_for_selector(".perk-news", timeout=8000)
            check(True, "the player's phone shows the news")
        except Exception:
            check(False, "the player's phone shows the news")
        wisher.wait_for_timeout(1200)
        wisher.screenshot(path=f"{ac.OUT}/perk-news.png")
        st, me = ac.call("GET", "/me", wtok)
        check(me["user"].get("frame") == "gold" and "wish" in me["user"].get("perks", []), "their account has the gold frame and the reward")
        wisher.keyboard.press("Escape")
        wisher.wait_for_timeout(600)
        check(wisher.locator(".acct-me .avatar.avatar-gold").count() == 1, "the header shows their face in the gold frame")
        st, r = ac.call("POST", "/avatar/draw", wtok, {"image": pic, "mime": "image/jpeg", "from": "photo", "choices": {"outfit": "gala"}})
        check(st == 200, f"now they can draw in a limited outfit ({st} {r.get('error')})")
        # someone else still can't
        xctx, other = ac.phone(browser)
        ac.signup(other, f"other.{tag}@example.com", "Oz")
        st, r = ac.call("POST", "/avatar/draw", ac.token_of(other), {"image": pic, "mime": "image/jpeg", "from": "photo", "choices": {"outfit": "royal"}})
        check(st == 403 and r.get("error") == "locked", "for everyone else they stay locked")
        # at a table, the frame shows on their seat
        wisher.goto(ac.BASE)
        wisher.wait_for_selector(".online-btn")
        wisher.click(".online-btn")
        wisher.wait_for_selector("#online-name")
        wisher.get_by_role("button", name="开一桌", exact=True).click()
        wisher.wait_for_selector(".lobby .faces", timeout=10000)
        check(wisher.locator(".lobby .face .avatar.avatar-gold").count() == 1, "at a table their face wears the gold frame too")
        wisher.screenshot(path=f"{ac.OUT}/perk-lobby.png")
        browser.close()
    # an error thrown in a page is a failure, not a footnote (the phones are admin_check's, so are their errors)
    real = [e for e in ac.errors if "favicon" not in e]
    if real:
        print("\npage errors:\n  " + "\n  ".join(real[:10]))
    check(not real, f"no error was thrown in any page ({len(real)})")
    print(f"\n{len(fails)} failure(s)" if fails else "\nall passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

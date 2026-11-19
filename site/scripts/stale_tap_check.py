"""A phone that wakes from its lock screen with the old screen still up: a tap on it must not land in
the next round. Four phones at a table, 我从来没有, on the local servers.

Cat's phone is "locked": its network goes off and its page is hidden. Meanwhile the others answer the
card, the host reveals without her, moves on, and the next card is drawn. Cat's phone wakes (page
visible, network back) with the old card still on it and taps 我做过 at once: that tap is dropped (the
card has changed under it), and once the new card is on her screen her answer counts.

Then the other way round: Cat's phone is away but nothing happens at the table; a tap right after it
wakes still goes through.

usage: python3 scripts/stale_tap_check.py [base_url]
Needs the rooms server and the site running (HANDOFF.md, "Run the site locally"). Screenshots go to
$SHOTS (default: stale-tap in the system's temp folder).
"""
import os, sys, tempfile, time
from playwright.sync_api import sync_playwright
import party_test as T

OUT = os.environ.get("SHOTS", os.path.join(tempfile.gettempdir(), "stale-tap"))
os.makedirs(OUT, exist_ok=True)
ok, until, view, room, me, by_pid = T.ok, T.until, T.view, T.room, T.me, T.by_pid

HIDE = "() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }"
SHOW = "() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }"


def shot(pg, tag):
    pg.screenshot(path=os.path.join(OUT, f"{tag}-{pg._name}.png"))


def lock(pg):
    """The phone goes into a pocket: no network, page hidden (its socket dies without a word)."""
    pg.context.set_offline(True)
    pg.evaluate(HIDE)


def wake(pg):
    """The screen comes on first; the radio takes a moment longer (a tap can land in between)."""
    pg.evaluate(SHOW)


def radio_on(pg):
    pg.context.set_offline(False)


def draw(everyone):
    """The reader draws the next card; back with its number."""
    host = everyone[0]
    reader = by_pid(everyone, view(host)["reader"])
    reader.get_by_role("button", name="抽一张").click()
    ok(until(lambda: view(host)["phase"] == "answer"), f"card drawn by {reader._name}")
    time.sleep(0.4)
    return view(host)["card"]


def answer(phones, yes):
    for g in phones:
        g.get_by_role("button", name="我做过" if g in yes else "没做过").click()
        time.sleep(0.2)


def stamps_away(phones, stamped):
    """The stamps land a moment after the reveal: wait for them on the phones that get one, then put them all away."""
    ok(until(lambda: all(g.locator(".stamp-layer").count() for g in stamped), 6000), "the ones who have get the stamp")
    T.clear_stamps(phones)


def errors(phones):
    """Page errors, except what going offline itself logs."""
    errs = [(g._name, e) for g in phones for e in g._errs if not any(k in e for k in ("favicon", "WebSocket", "ERR_INTERNET_DISCONNECTED"))]
    ok(not errs, f"no page errors {errs[:3]}")


with sync_playwright() as p:
    browser = p.chromium.launch()
    host, guests, code = T.seat_table(browser, ["Amy", "Ben", "Cat", "Dan"])
    everyone = [host] + guests
    cat = guests[1]
    others = [g for g in everyone if g is not cat]
    T.start_game(host, everyone, "prompts")
    card0 = draw(everyone)
    ok(until(lambda: view(cat)["card"] == card0), "Cat sees the card")
    shot(cat, "card-before")

    # ---- the table moves on while Cat's phone is locked
    lock(cat)
    time.sleep(0.8)
    answer(others, yes=others[:2])
    host.get_by_role("button", name="不等了，直接开").click()
    ok(until(lambda: view(host)["phase"] == "reveal"), "revealed without Cat")
    stamps_away(others, others[:2])
    host.get_by_role("button", name="下一个").click()
    ok(until(lambda: view(host)["phase"] == "draw"), "the host moved on")
    ok(view(host)["reader"] != me(cat), "the next reader is not Cat")
    card1 = draw(everyone)
    ok(card1 != card0, f"a new card ({card0} -> {card1})")
    v = view(cat)
    ok(v["card"] == card0 and v["phase"] == "answer", "Cat's phone still shows the old card")

    # ---- Cat wakes and taps straight away, on the old screen
    wake(cat)
    cat.get_by_role("button", name="我做过").click()
    shot(cat, "tapped-on-wake")
    radio_on(cat)
    ok(until(lambda: view(cat)["card"] == card1, 10000), "Cat's phone catches up to the new card")
    time.sleep(1.0)
    v = view(host)
    ok(me(cat) not in v["answered"], f"the tap on the old screen did not become an answer to the new card (answered: {v['answered']})")
    ok(view(cat)["mine"] is None, "Cat's own phone shows no answer either")
    shot(cat, "caught-up")
    # now a tap on the current screen counts
    cat.get_by_role("button", name="没做过").click()
    ok(until(lambda: me(cat) in view(host)["answered"], 4000), "an answer to the current card counts")
    ok(until(lambda: view(cat)["mine"] is False, 4000), "...and shows on her phone")
    errors(everyone)

    # ---- nothing happens while the phone is away: a tap right after it wakes still goes through
    answer(others, yes=others[:1])
    ok(until(lambda: view(host)["phase"] == "reveal"), "second card revealed")
    stamps_away(everyone, others[:1])
    host.get_by_role("button", name="下一个").click()
    ok(until(lambda: view(host)["phase"] == "draw"), "on to the third card")
    card2 = draw(everyone)
    ok(until(lambda: view(cat)["card"] == card2), "Cat sees the third card")
    lock(cat)
    time.sleep(1.5)
    wake(cat)
    cat.get_by_role("button", name="我做过").click()
    radio_on(cat)
    ok(until(lambda: me(cat) in view(host)["answered"], 10000), "nothing moved on while the phone was away: the tap after waking counts")
    ok(until(lambda: view(cat)["mine"] is True, 4000), "...and shows on her phone")
    shot(cat, "answered-after-wake")
    errors(everyone)
    browser.close()

print(f"screenshots: {OUT}")
print("FAILED:\n  " + "\n  ".join(T.fails) if T.fails else "stale tap check passed")
sys.exit(1 if T.fails else 0)

"""
The Mail door (worker/mail.ts), end to end on this machine: a notice from another Worker goes in
through a service binding, is checked, counted against the day's allowance, and reaches the
stand-in Resend as a mail; nothing on the public address leads to it.

Needs three things running, all from the site folder, and worker/.dev.vars with DEV_SHOW_CODES=1,
MASTER_EMAIL=master@example.test and DEV_MAIL_URL=http://127.0.0.1:8791/emails:

  node scripts/fake_mail.mjs                                                 # the stand-in Resend, 8791
  npx wrangler dev -c worker/wrangler.jsonc --port 8787 --ip 127.0.0.1       # the rooms server
  npx wrangler dev -c scripts/mail_door/wrangler.jsonc --port 8788 --ip 127.0.0.1   # a Worker that binds the door

The day's count lives in the hub's storage, so a second run the same day starts where the first
left off: to count from zero again, stop the rooms server and delete worker/.wrangler/state first.

  python3 scripts/mail_door_check.py
"""
import json
import random
import string
import sys
import urllib.error
import urllib.request

# (everything here is on this machine: no proxy)
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))

API = "http://127.0.0.1:8787/api"
DOOR = "http://127.0.0.1:8788/"
FAKE = "http://127.0.0.1:8791"
MASTER = "master@example.test"
A_DAY = 60  # 跟一单's allowance (worker/notice.ts, NOTICES_A_DAY)
fails: list[str] = []


def check(ok: bool, what: str):
    print(("PASS " if ok else "FAIL ") + what)
    if not ok:
        fails.append(what)


def http(url: str, body=None, token: str | None = None, method: str | None = None):
    method = method or ("POST" if body is not None else "GET")
    data = json.dumps(body).encode() if (body is not None or method == "POST") else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Origin", "http://127.0.0.1:5173")
    req.add_header("X-Device", "door-" + "".join(random.choice(string.ascii_lowercase) for _ in range(8)))
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except ValueError:
            return e.code, {"raw": raw.decode(errors="replace")[:200]}


def signup(name: str, email: str | None = None):
    """An account (dev mode shows the code); one from an earlier run signs in instead."""
    email = email or f"{name.lower()}.{''.join(random.choice(string.ascii_lowercase) for _ in range(6))}@example.com"
    st, d = http(API + "/auth/code", {"email": email, "lang": "zh"})
    if "dev" not in d:
        sys.exit(f"no code shown for {email} ({st} {d}): is DEV_SHOW_CODES=1 in worker/.dev.vars?")
    v = http(API + "/auth/verify", {"email": email, "code": d["dev"]})[1]
    d = v if "token" in v else http(API + "/auth/signup", {"ticket": v["ticket"], "name": name, "phone": "+1 604 555 0133", "city": "Vancouver", "gender": "private", "bio": "", "ac": 3, "adult": True})[1]
    return d["token"], d["user"], email


def door(notice):
    st, d = http(DOOR, notice, method="POST")
    if "reply" not in d:
        sys.exit(f"the door's Worker didn't answer ({st} {d}): is scripts/mail_door running on 8788?")
    return d["reply"]


def mails():
    return http(FAKE + "/mails")[1]["mails"]


def main():
    for url in (API.replace("/api", "/health"), FAKE + "/mails"):
        try:
            urllib.request.urlopen(url, timeout=5)
        except Exception as e:  # noqa: BLE001
            sys.exit(f"{url} isn't answering ({e}): start it first (see the top of this file)")
    http(FAKE + "/reset")
    http(FAKE + "/fail/0")
    token, user, email = signup("Leader")
    base = {"app": "tuan", "to": email, "subject": "新订单 · 大米团", "text": "小明下了一单：\n牛腩 2 磅\n\n合计约 $36。", "link": "https://changle.ca/tuan/o/ABCDEF", "lang": "zh"}

    # ---- turned away before anything is sent ----
    check(door(None) == {"status": "failed", "why": "app"}, "nothing at all: failed, app")
    check(door({**base, "app": "split"}) == {"status": "failed", "why": "app"}, "an app not on the list: failed, app")
    check(door({**base, "to": "nobody.here@example.com"}) == {"status": "failed", "why": "to"}, "an address with no account: failed, to")
    check(door({**base, "link": "https://example.com/x"}) == {"status": "failed", "why": "link"}, "a link elsewhere: failed, link")
    check(door({**base, "subject": "x" * 121}) == {"status": "failed", "why": "subject"}, "a subject too long: failed, subject")
    check(door({**base, "lang": "fr"}) == {"status": "failed", "why": "lang"}, "a language we don't have: failed, lang")
    check(len(mails()) == 0, "none of those reached the stand-in Resend")

    # ---- sent, and the mail as the stand-in Resend received it ----
    r = door({**base, "to": email.upper()})
    check(r == {"status": "sent"}, f"to the merchant, address in capitals: sent ({r})")
    r = door({**base, "link": "http://127.0.0.1:5173/tuan/o/ABCDEF"})
    check(r == {"status": "sent"}, f"a local link is let through in a local run: sent ({r})")
    got = mails()
    check(len(got) == 2, f"two mails reached the stand-in Resend ({len(got)})")
    m = got[0] if got else {}
    check(m.get("to") == [email], "to: the merchant's address only, lower case")
    check(m.get("from") == "changle <hello@changle.ca>", "from: MAIL_FROM")
    check(m.get("subject") == "新订单 · 大米团", "the subject")
    check("小明下了一单：<br>牛腩 2 磅" in m.get("html", "") and 'href="https://changle.ca/tuan/o/ABCDEF"' in m.get("html", "") and ">打开</a>" in m.get("html", ""), "the HTML has the text, the button and the link")
    check("代「跟一单」发出" in m.get("html", "") and m.get("text", "").endswith("代「跟一单」发出。"), "the footer names 跟一单, in HTML and in plain text")
    check(m.get("ua", "").startswith("changle/"), "the User-Agent Resend insists on is there")

    # ---- a banned account gets nothing ----
    mtoken, muser, _ = signup("Steve", MASTER)
    btoken, buser, bemail = signup("Banned")
    st, _ = http(API + "/admin/ban", {"uid": buser["id"], "on": True}, token=mtoken)
    check(st == 200, f"the owner bans an account ({st}; MASTER_EMAIL={MASTER} in .dev.vars?)")
    check(door({**base, "to": bemail}) == {"status": "failed", "why": "to"}, "a banned account: failed, to")

    # ---- Resend saying no: failed, and the day's count given back ----
    http(FAKE + "/fail/500")
    check(door(base) == {"status": "failed", "why": "mail"}, "Resend says no: failed, mail")
    http(FAKE + "/fail/0")

    # ---- the day's allowance, then full ----
    sent = 2
    while sent < A_DAY:
        r = door({**base, "subject": f"第 {sent + 1} 封"})
        if r.get("status") != "sent":
            break
        sent += 1
    check(sent == A_DAY, f"{A_DAY} notices went out today ({sent}; fewer means an earlier run today used some: see the top of this file)")
    r = door(base)
    check(r == {"status": "full"}, f"one more: full ({r})")
    check(door(base) == {"status": "full"}, "and it stays full")
    check(len(mails()) == sent, f"the stand-in Resend holds exactly the ones that went out ({len(mails())}): the failed one wasn't counted")

    # ---- no public way in ----
    for path in ("/notice", "/mail"):
        st, body = http(API + path, base)
        check(st in (401, 404) and body.get("status") != "sent", f"POST rooms /api{path} is nothing ({st})")

    http(API + "/me", token=token, method="DELETE")
    print("\n" + ("ALL PASSED" if not fails else f"{len(fails)} FAILS: " + "; ".join(fails)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()

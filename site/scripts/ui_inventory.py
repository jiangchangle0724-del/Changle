#!/usr/bin/env python3
"""
Counts what docs/ui-inventory.md is about, straight from site/src: components, buttons and cards that
carry their own look, raw colors, px font sizes (and where each maps on the new scale), shadows,
motion, spacing and tap targets under 44px. Run it again after a clean-up to see the numbers fall.

  python3 scripts/ui_inventory.py            # the report, as Markdown
  python3 scripts/ui_inventory.py --json     # everything it found, one item per line of code

Reads only; needs nothing beyond Python 3.
"""
import json, os, re, sys
from collections import Counter, defaultdict

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(SITE, "src")

STEPS = [12, 14, 16, 18, 22, 28, 40, 64]
TOKEN_OF = {12: "--text-xs", 14: "--text-sm", 16: "--text-md", 18: "--text-lg", 22: "--text-xl", 28: "--text-2xl", 40: "--text-3xl", 64: "--text-4xl"}
RADII = [10, 14, 20, 24, 28]
RADIUS_TOKEN = {10: "--r-small", 14: "--r-field", 20: "--r-panel", 24: "--r-tile", 28: "--r-sheet"}
# files that are mostly a game's own art (paper, blood, gold, card stock) rather than the app's frame
GAME_ART = {"party.css", "drama.css", "show.css", "figures.css", "trip.css", "tv.css"}


def rel(p):
    return os.path.relpath(p, SITE).replace(os.sep, "/")


def walk(exts):
    for root, dirs, names in os.walk(SRC):
        dirs.sort()
        for n in sorted(names):
            if n.endswith(exts) and not n.endswith(".d.ts"):
                yield os.path.join(root, n)


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def step_for(px):
    """Where an old font size lands: nearest step; a tie goes up below 18 (reading) and down from 18 (layout)."""
    if px > 70:
        return "poster"
    if px <= 12:
        return 12
    best = min(STEPS, key=lambda s: (abs(s - px), 0))
    ties = [s for s in STEPS if abs(s - px) == abs(best - px)]
    if len(ties) == 2:
        return max(ties) if px < 18 else min(ties)
    return best


def radius_for(v):
    v = v.strip()
    if v in ("50%",) or re.fullmatch(r"(99|999|9999)px", v):
        return "--r-pill / circle"
    m = re.fullmatch(r"([0-9.]+)px", v)
    if not m:
        return "token or several corners"
    px = float(m.group(1))
    if px < 8:
        return "tight (card fans, small marks): stays local"
    best = min(RADII, key=lambda r: abs(r - px))
    return RADIUS_TOKEN[best]


def duration_for(ms):
    if ms <= 175:
        return "--dur-exit (150)"
    if ms <= 300:
        return "--dur-enter (200)"
    if ms <= 600:
        return "--dur-emphasis (400)"
    return "game choreography: stays in the game"


# ---------- CSS ----------
def css_decls(path):
    """(selector, at-rules, property, value, line) for every declaration in a stylesheet."""
    text = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), read(path), flags=re.S)
    stack, buf, line, start, out = [], "", 1, 1, []

    def flush(b, ln):
        b = b.strip()
        if not b or ":" not in b or not stack:
            return
        prop, _, val = b.partition(":")
        sels = [s for s in stack if not s.startswith("@")]
        ats = [s for s in stack if s.startswith("@")]
        out.append((sels[-1] if sels else "", ats, prop.strip().lower(), " ".join(val.split()), ln))

    for c in text:
        if c == "{":
            stack.append(" ".join(buf.split()))
            buf = ""
        elif c == "}":
            flush(buf, start)
            buf = ""
            if stack:
                stack.pop()
        elif c == ";":
            flush(buf, start)
            buf = ""
        else:
            if not buf.strip() and not c.isspace():
                start = line
            buf += c
        if c == "\n":
            line += 1
    return out


HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
COLOR_FN = re.compile(r"\b(?:rgba?|hsla?)\(")


def norm_hex(h):
    h = h.lower()
    return "#" + "".join(ch * 2 for ch in h[1:]) if len(h) == 4 else h


def collect():
    css = {p: css_decls(p) for p in walk((".css",)) if not p.endswith("tokens.css")}
    tsx = list(walk((".tsx",)))
    ts = list(walk((".ts",)))
    # every class that sits on a <button> somewhere
    button_classes = set()
    for p in tsx:
        for m in re.finditer(r"<button\b([^>]*?)>", read(p), re.S):
            c = re.search(r"className=(?:\"([^\"]*)\"|\{`([^`]*)`\}|\{([^}]*)\})", m.group(1), re.S)
            if c:
                raw = re.sub(r"\$\{[^}]*\}", " ", c.group(1) or c.group(2) or c.group(3) or "")
                button_classes.update(re.findall(r"[a-z][a-z0-9-]*", raw))
    r = {"css_bytes": {rel(p): os.path.getsize(p) for p in css}}

    r["root_tokens"] = sorted({prop for p, ds in css.items() for sel, ats, prop, val, ln in ds if sel == ":root" and not ats and prop.startswith("--") and p.endswith("global.css")})
    r["font_px"], r["font_other"], r["hex_css"], r["color_fn_css"] = [], [], [], []
    r["shadows"], r["blur"], r["durations"], r["radius"], r["spacing"], r["small_targets"] = [], [], [], [], [], []
    r["keyframes"] = {rel(p): len(re.findall(r"@keyframes\s", read(p))) for p in css}
    looks = defaultdict(lambda: {"props": {}, "files": set()})
    for p, ds in css.items():
        f = rel(p)
        tokens_block = f.endswith("global.css") or f.endswith("tokens.css")
        by_rule = defaultdict(dict)
        for sel, ats, prop, val, ln in ds:
            where = {"file": f, "line": ln, "selector": sel}
            if prop == "font-size":
                m = re.fullmatch(r"(-?[0-9.]+)px( !important)?", val)
                if m:
                    r["font_px"].append({**where, "px": float(m.group(1))})
                elif val != "inherit":
                    r["font_other"].append({**where, "value": val})
            if prop == "font":
                m = re.search(r"(?:^|\s)([0-9.]+)px(?:/|\s)", val)
                if m:
                    r["font_px"].append({**where, "px": float(m.group(1))})
            if not (tokens_block and sel == ":root" and prop.startswith("--")):
                for h in HEX.findall(val):
                    r["hex_css"].append({**where, "hex": norm_hex(h)})
                if COLOR_FN.search(val):
                    r["color_fn_css"].append({**where, "value": val})
            if prop == "box-shadow" and not val.startswith("none"):
                r["shadows"].append({**where, "value": val})
            if prop in ("backdrop-filter",):
                r["blur"].append({**where, "value": val})
            if prop in ("transition", "animation", "transition-duration", "animation-duration"):
                for n, u in re.findall(r"(?<![\w.-])([0-9]*\.?[0-9]+)(ms|s)\b", val):
                    r["durations"].append({**where, "ms": round(float(n) * (1000 if u == "s" else 1))})
            if prop == "border-radius":
                r["radius"].append({**where, "value": val})
            if re.fullmatch(r"(padding|margin)(-(top|bottom|left|right|inline|block))?|(row-|column-)?gap", prop):
                for n in re.findall(r"(?<![\w.-])(-?[0-9]*\.?[0-9]+)px", val):
                    r["spacing"].append({**where, "px": abs(float(n))})
            by_rule[(sel, tuple(ats))][prop] = (val, ln)
            for part in sel.split(","):
                part = part.strip()
                names = re.findall(r"\.([a-zA-Z][\w-]*)", part)
                if names and "::" not in part and not re.search(r":(hover|active|focus|disabled)", part):
                    looks[names[-1]]["props"][prop] = val
                    looks[names[-1]]["files"].add(f)
        for (sel, ats), props in by_rule.items():
            # the element the size applies to: the last compound selector, not a child of a button
            last = re.split(r"[\s>+~]+", sel.strip())[-1]
            last_is_button = last.endswith("button") or any(c in button_classes for c in re.findall(r"\.([a-zA-Z][\w-]*)", last))
            if "::" in sel or not last_is_button:
                continue
            for prop in ("height", "min-height", "width", "min-width"):
                if prop in props:
                    m = re.match(r"([0-9.]+)px", props[prop][0])
                    if m and 16 <= float(m.group(1)) < 44:
                        r["small_targets"].append({"file": f, "line": props[prop][1], "selector": sel, "prop": prop, "px": float(m.group(1))})

    # components
    r["components"] = []
    for p in tsx:
        text = read(p)
        exported = re.findall(r"export\s+(?:default\s+)?function\s+([A-Z]\w*)", text) + re.findall(r"export\s+const\s+([A-Z][a-z0-9]\w*)\s*=", text)
        local = [n for n in re.findall(r"(?<!export )function\s+([A-Z]\w*)\s*\(", text) if n not in exported]
        r["components"].append({"file": rel(p), "lines": text.count("\n") + 1, "exported": exported, "local": local})

    # buttons: the class on each <button>
    r["buttons"] = []
    for p in tsx:
        for m in re.finditer(r"<button\b([^>]*?)>", read(p), re.S):
            c = re.search(r"className=(?:\"([^\"]*)\"|\{`([^`]*)`\}|\{([^}]*)\})", m.group(1), re.S)
            raw = re.sub(r"\$\{[^}]*\}", " ", (c.group(1) or c.group(2) or c.group(3) or "") if c else "")
            names = re.findall(r"[a-z][a-z0-9-]*", raw) if c else []
            r["buttons"].append({"file": rel(p), "class": names[0] if names else ("(dynamic)" if c else "(none)")})
    shared = {"btn", "icon-btn", "link-btn", "chip", "tile", "tab", "seg"}
    own = Counter(b["class"] for b in r["buttons"] if b["class"] not in shared and not b["class"].startswith("("))
    r["own_buttons"] = []
    for cls, n in own.most_common():
        lk = looks.get(cls)
        if lk and "border-radius" in lk["props"] and ({"background", "background-color", "box-shadow", "border"} & set(lk["props"])):
            r["own_buttons"].append({"class": cls, "uses": n, "files": sorted(lk["files"])})

    # cards: a class with its own background, a corner of 12px or more, and padding (pills excluded)
    def big_corner(v):
        if not v:
            return False
        if "var(--r-" in v:
            return True
        m = re.match(r"([0-9.]+)px", v)
        return bool(m) and 12 <= float(m.group(1)) < 99

    r["cards"] = []
    for cls, lk in sorted(looks.items()):
        if cls in ("panel", "porcelain", "sheet", "field", "field-ink", "tile", "tabs"):
            continue
        bg = lk["props"].get("background") or lk["props"].get("background-color")
        if bg and not re.match(r"(none|transparent|inherit)", bg) and big_corner(lk["props"].get("border-radius")) and any(k.startswith("padding") for k in lk["props"]):
            r["cards"].append({"class": cls, "radius": lk["props"]["border-radius"], "background": bg, "files": sorted(lk["files"])})

    # raw colors and font sizes in code
    r["hex_code"] = []
    for p in tsx + ts:
        for i, line in enumerate(read(p).splitlines(), 1):
            for m in re.finditer(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?=[\"'`\s,;)])", line):
                kind = "svg" if re.search(r"\b(fill|stroke|stopColor|floodColor)\b", line) else ("style" if re.search(r"style=|\b(color|background)\s*:", line) else "data")
                r["hex_code"].append({"file": rel(p), "line": i, "hex": norm_hex(m.group(0)), "kind": kind})
    r["font_code"] = []
    for p in tsx:
        for i, line in enumerate(read(p).splitlines(), 1):
            for m in re.finditer(r"fontSize(=\"|=\{|:\s*)([0-9.]+)", line):
                # fontSize="30" on an SVG <text> is in drawing units, not a UI size
                r["font_code"].append({"file": rel(p), "line": i, "px": float(m.group(2)), "svg": m.group(1) == '="'})
    r["inline_styles"] = sum(read(p).count("style={{") for p in tsx)
    r["gsap_files"] = sorted(rel(p) for p in tsx + ts if re.search(r"from \"(gsap|(\.\./)+lib/anim|\./lib/anim)\"", read(p)))
    return r


def table(head, rows):
    out = ["| " + " | ".join(head) + " |", "|" + " --- |" * len(head)]
    out += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(out)


def fmt(px):
    return f"{px:g}"


def report(r):
    md = []
    comps = r["components"]
    font_ui = [x for x in r["font_code"] if not x["svg"]]
    md.append("## 总数\n")
    md.append(table(["项目", "数量"], [
        ["TSX 文件", len(comps)],
        ["组件（导出 / 文件内）", f'{sum(len(c["exported"]) for c in comps)} / {sum(len(c["local"]) for c in comps)}'],
        ["CSS 文件，源码大小", f'{len(r["css_bytes"])} 个，{sum(r["css_bytes"].values()) // 1024} KB'],
        ["global.css 里的 :root 变量", len(r["root_tokens"])],
        ["px 字号：种类 / 出现次数", f'{len({x["px"] for x in r["font_px"]})} / {len(r["font_px"])}'],
        ["其他写法的字号（clamp、em、calc）", len(r["font_other"])],
        ["TSX 内联字号（不含 SVG 画布单位）", len(font_ui)],
        ["CSS 里裸写的 hex：种类 / 次数", f'{len({x["hex"] for x in r["hex_css"]})} / {len(r["hex_css"])}'],
        ["CSS 里的 rgba() / hsl()", len(r["color_fn_css"])],
        ["TS / TSX 里的 hex：种类 / 次数", f'{len({x["hex"] for x in r["hex_code"]})} / {len(r["hex_code"])}'],
        ["box-shadow：种类 / 次数", f'{len({x["value"] for x in r["shadows"]})} / {len(r["shadows"])}'],
        ["@keyframes", sum(r["keyframes"].values())],
        ["用到 GSAP 的文件", len(r["gsap_files"])],
        ["内联 style={{...}}", r["inline_styles"]],
        ["<button>：用公共样式 / 全部", f'{sum(1 for b in r["buttons"] if b["class"] in ("btn", "icon-btn", "link-btn", "chip"))} / {len(r["buttons"])}'],
        ["自带外观的按钮样式", len(r["own_buttons"])],
        ["自带外观的卡片样式", len(r["cards"])],
        ["小于 44 的点击目标（CSS 里能看出来的）", len(r["small_targets"])],
    ]))

    md.append("\n## 组件清单（按目录）\n")
    by_dir = defaultdict(list)
    for c in comps:
        by_dir[os.path.dirname(c["file"])].append(c)
    rows = []
    for d, cs in sorted(by_dir.items()):
        names = []
        for c in cs:
            names += c["exported"]
        local = sum(len(c["local"]) for c in cs)
        rows.append([d.replace("src/", "") or "src", len(cs), sum(c["lines"] for c in cs), "，".join(names) + (f"（另有 {local} 个文件内组件）" if local else "")])
    md.append(table(["目录", "文件", "行数", "导出的组件"], rows))
    md.append("\n## 字号映射\n")
    groups = defaultdict(Counter)
    for x in r["font_px"]:
        groups[step_for(x["px"])][x["px"]] += 1
    for x in font_ui:
        groups[step_for(x["px"])][x["px"]] += 1
    rows = []
    for step in STEPS + ["poster"]:
        if step not in groups:
            continue
        olds = "，".join(f"{fmt(v)}（{n}）" for v, n in sorted(groups[step].items()))
        rows.append([f"{step}" if step != "poster" else "海报", TOKEN_OF.get(step, "--text-poster"), olds, sum(groups[step].values())])
    md.append(table(["新档 px", "token", "旧值（处数，含 TSX 内联）", "合计"], rows))
    md.append("\n其他写法：\n")
    md.append(table(["写法", "位置", "去哪一档"], [[x["value"], f'{x["file"]}:{x["line"]} `{x["selector"]}`', fluid_for(x["value"])] for x in r["font_other"]]))

    md.append("\n## 裸写的颜色（CSS，按文件）\n")
    by_file = Counter(x["file"] for x in r["hex_css"])
    fn_file = Counter(x["file"] for x in r["color_fn_css"])
    rows = []
    for f in sorted(set(by_file) | set(fn_file), key=lambda f: -(by_file[f] + fn_file[f])):
        rows.append([f, by_file[f], fn_file[f], "游戏画面" if os.path.basename(f) in GAME_ART else "界面"])
    md.append(table(["文件", "hex", "rgba / hsl", "主要是"], rows))
    md.append("\n出现最多的 hex：\n")
    md.append(table(["hex", "次数", "文件"], [[h, n, "，".join(sorted({x["file"].split("/")[-1] for x in r["hex_css"] if x["hex"] == h}))] for h, n in Counter(x["hex"] for x in r["hex_css"]).most_common(12)]))
    md.append("\n## 裸写的颜色（TS / TSX，按文件）\n")
    c = defaultdict(Counter)
    for x in r["hex_code"]:
        c[x["file"]][x["kind"]] += 1
    md.append(table(["文件", "数据（色板、配置）", "SVG 填色", "内联样式"], [[f, k["data"], k["svg"], k["style"]] for f, k in sorted(c.items(), key=lambda kv: -sum(kv[1].values()))]))

    md.append("\n## 自带外观的按钮\n")
    md.append(table(["class", "<button> 处数", "样式在"], [[f'`.{b["class"]}`', b["uses"], "，".join(x.split("/")[-1] for x in b["files"])] for b in r["own_buttons"]]))
    none = Counter(b["file"] for b in r["buttons"] if b["class"] == "(none)")
    md.append(f'\n没写 class 的 <button>：{sum(none.values())} 个，最多的文件：' + "，".join(f"{f.split('/')[-1]}（{n}）" for f, n in none.most_common(6)))

    md.append("\n## 自带外观的卡片\n")
    md.append(table(["class", "圆角", "底色", "样式在"], [[f'`.{x["class"]}`', x["radius"], f'`{x["background"][:48]}`', "，".join(f.split("/")[-1] for f in x["files"])] for x in r["cards"]]))

    md.append("\n## 阴影\n")
    kinds = Counter(shadow_kind(x["value"]) for x in r["shadows"])
    md.append(table(["类型", "次数"], [[k, n] for k, n in kinds.most_common()]))
    md.append("\n## 动效时长\n")
    d = defaultdict(Counter)
    for x in r["durations"]:
        d[duration_for(x["ms"])][x["ms"]] += 1
    order = ["--dur-exit (150)", "--dur-enter (200)", "--dur-emphasis (400)", "game choreography: stays in the game"]
    md.append(table(["去哪", "旧值 ms（次数）"], [[k, "，".join(f"{ms}（{n}）" for ms, n in sorted(d[k].items()))] for k in order if k in d]))
    md.append("\n## 圆角\n")
    rr = defaultdict(Counter)
    for x in r["radius"]:
        rr[radius_for(x["value"])][x["value"]] += 1
    md.append(table(["去哪", "旧值（次数）"], [[k, "，".join(f"{v}（{n}）" for v, n in sorted(c.items(), key=lambda kv: -kv[1]))] for k, c in sorted(rr.items())]))
    md.append("\n## 间距\n")
    sp = Counter(x["px"] for x in r["spacing"])
    on = sum(n for v, n in sp.items() if v % 4 == 0)
    md.append(f'padding、margin、gap 里的 px 值共 {sum(sp.values())} 个，{on} 个是 4 的倍数（{round(100 * on / max(1, sum(sp.values())))}%）。不是 4 的倍数的：' + "，".join(f"{fmt(v)}（{n}）" for v, n in sorted(sp.items()) if v % 4))
    md.append("\n## 小于 44 的点击目标\n")
    md.append(table(["位置", "选择器", "尺寸"], [[f'{x["file"]}:{x["line"]}', f'`{x["selector"]}`', f'{x["prop"]} {fmt(x["px"])}'] for x in r["small_targets"]]))
    return "\n".join(md) + "\n"


def fluid_for(v):
    """A clamp() lands where its size on a 390px-wide phone lands."""
    m = re.match(r"clamp\(([0-9.]+)px,\s*([0-9.]+)vw,\s*([0-9.]+)px\)", v)
    if m:
        lo, vw, hi = (float(g) for g in m.groups())
        at390 = min(hi, max(lo, vw * 3.9))
        step = step_for(at390)
        return f"{at390:.0f}px 时 → " + ("--text-poster" if step == "poster" else TOKEN_OF[step])
    if v.endswith("em"):
        return "相对字号（双语副标）：保留，或改成下一档"
    return "组件内部计算：保留"


def shadow_kind(v):
    kinds = set()
    for part in re.split(r",(?![^()]*\))", v):
        part = part.strip()
        if part.startswith("inset"):
            kinds.add("描边（inset）")
        elif re.match(r"0 0 0 [0-9.]+px", part):
            kinds.add("圈（0 0 0 Npx）")
        elif re.search(r"var\(--(gel|light|go|stop|av|mine|club)", part) or "color-mix" in part:
            kinds.add("光晕（带颜色）")
        else:
            kinds.add("投影（黑色）")
    return " + ".join(sorted(kinds))


if __name__ == "__main__":
    data = collect()
    if "--json" in sys.argv:
        json.dump(data, sys.stdout, ensure_ascii=False, indent=1)
    else:
        sys.stdout.write(report(data))

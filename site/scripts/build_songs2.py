"""The song list grows: languages and categories for Name That Tune.

Keeps every song already in src/data/songs.ts, then adds songs for the artists in
scripts/song_seeds.json (Chinese, Cantonese, English, Korean, Japanese, Vietnamese, each with
oldies / pop / rock / folk / hip-hop / dance / R&B / film & TV), the world classics, and today's
most-played charts in fourteen countries. Who sings each song comes from scripts/singers.json
(MusicBrainz). Writes src/data/songs.ts in the twelve-field row format (see src/shared/songs.ts).

Apple's search API allows about twenty calls a minute, so a full run takes a couple of hours.
It is safe to stop and start again: every call is cached (SONG_CACHE, default ./songcache).

    python3 scripts/build_songs2.py            # everything
    python3 scripts/build_songs2.py ko ja      # only some languages (or: world, charts)
"""
import json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("SONG_CACHE", os.path.join(HERE, "..", "songcache"))
import build_songs as B  # noqa: E402  (the helpers: get, search, lookup, chart, ok_track, clean_title, pack, t2s)

OUT = B.OUT
SEEDS = json.load(open(os.path.join(HERE, "song_seeds.json"), encoding="utf-8"))
SINGERS = json.load(open(os.path.join(HERE, "singers.json"), encoding="utf-8"))
ONLY = set(sys.argv[1:])
want = lambda k: not ONLY or k in ONLY

LANG_INDEX = {"zh": 0, "en": 1, "yue": 2, "ko": 3, "ja": 4, "vi": 5, "world": 6, "other": 7}
CAT_BIT = {"oldies": 1, "pop": 2, "rock": 4, "folk": 8, "rap": 16, "dance": 32, "rnb": 64, "ost": 128}
CLASSIC_BIT = 256
PER = {"pop": 10, "oldies": 10, "rock": 8, "folk": 8, "rap": 8, "dance": 6, "rnb": 8, "ost": 6}
CHART_COUNTRIES = ["us", "gb", "ca", "au", "tw", "hk", "cn", "jp", "kr", "vn", "br", "mx", "de", "fr", "in"]
STORES = {"zh": ["tw", "cn"], "yue": ["hk"], "en": ["us", "gb"], "ko": ["kr"], "ja": ["jp"], "vi": ["vn"]}
GENDER = {"m": 1, "f": 2, "mixed": 3}

try:
    from opencc import OpenCC
    s2t = OpenCC("s2twp").convert
    s2hk = OpenCC("s2hk").convert
except Exception:  # pragma: no cover
    s2t = s2hk = lambda s: s

HANGUL = re.compile(r"[가-힯]")
KANA = re.compile(r"[぀-ヿ]")
VIET = re.compile(r"[ăâđêôơưĂÂĐÊÔƠƯạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]")
CJK = B.CJK
SPLIT = re.compile(r"\s*(?:&|,|/|\bfeat\.?\b|\bfeaturing\b|\bft\.?\b|\bx\b|\bX\b|\bvs\.?\b|＆|、|和)\s*", re.I)


def singer_of(artist):
    first = SPLIT.split(artist)[0].strip()
    for key in (first, B.t2s(first), artist, B.t2s(artist)):
        g = SINGERS.get(key)
        if g:
            return GENDER.get(g, 0)
    return 0


def ok_for(x, lang):
    """build_songs.ok_track knows Chinese and English; the other languages need their own script test."""
    if lang in ("zh", "en"):
        return B.ok_track(x, lang)
    if x.get("kind") != "song" or not x.get("previewUrl") or (x.get("trackTimeMillis") or 0) < 100_000:
        return False
    name, album = x.get("trackName", ""), x.get("collectionName", "")
    if B.SKIP.search(name) or re.search(r"(?<![a-z])live(?![a-z])|演唱會|演唱会|ライブ|라이브", album, re.I):
        return False
    if lang == "yue":
        return bool(CJK.search(name)) and not B.OTHER_SCRIPTS.search(name) and not re.search(r"國語|国语|Mandarin", album + " " + name, re.I)
    if lang == "ko":
        return bool(HANGUL.search(name + " " + x.get("artistName", ""))) or not CJK.search(name)
    if lang == "ja":
        return not HANGUL.search(name)
    if lang == "vi":
        return not CJK.search(name) and not HANGUL.search(name) and not KANA.search(name)
    return True


def guess_lang(title, artist, store):
    s = title + " " + artist
    if KANA.search(s):
        return 4
    if HANGUL.search(s):
        return 3
    if VIET.search(s):
        return 5
    if CJK.search(title):
        return 2 if store == "hk" else 0
    if store in ("us", "gb", "ca", "au", "nz", "ie"):
        return 1
    return 1 if re.fullmatch(r"[\x20-\x7e’“”…]+", s) else 7


def norm_artist(s):
    return re.sub(r"[^\w㐀-鿿]+", "", B.t2s(s).lower().replace("é", "e"))


def artist_matches(seed, name):
    a, b = norm_artist(seed), norm_artist(name)
    if not a or not b:
        return False
    if a == b or (len(a) >= 2 and a in b) or (len(b) >= 3 and b in a):
        return True
    for chunk in re.split(r"\s+|&|,", seed):
        c = norm_artist(chunk)
        if len(c) >= 3 and c in b:
            return True
    return False


def load_existing():
    rows = []
    with open(OUT, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("[") and line.endswith("],"):
                rows.append(json.loads(line[:-1]))
    return rows


def main():
    existing = load_existing()
    songs = {}  # id -> row dict
    titles = set()
    for r in existing:
        k = r[10] if len(r) > 10 else 0
        g = r[11] if len(r) > 11 else 0
        songs[r[0]] = {"id": r[0], "t": r[1], "a": r[2], "ae": r[3], "l": r[4], "y": r[5], "p": r[6], "art": r[7], "s": r[8], "c": r[9], "k": k, "g": g or singer_of(r[2])}
        titles.add((B.norm_title(r[1]), B.t2s(r[2]).lower()))
    print("kept", len(songs), "songs from the current list", flush=True)

    def add(x, lang, store, cats, chart_hit=False, shown=None):
        tid = x["trackId"]
        li = LANG_INDEX[lang]
        if tid in songs:
            s = songs[tid]
            s["k"] |= cats
            if chart_hit:
                s["c"] = 1
            return False
        is_cn = lang in ("zh", "yue")
        a_raw = x.get("artistName", "")
        artist = B.t2s(a_raw) if is_cn else a_raw
        title = shown or B.clean_title(x["trackName"], "zh" if is_cn else "en")
        key = (B.norm_title(title), B.t2s(artist).lower())
        if key in titles:
            return False
        titles.add(key)
        p = B.pack(x, "zh" if is_cn else "en", artist, a_raw if is_cn else artist, store, chart_hit)
        p["t"] = title
        p["l"] = li
        p["k"] = cats
        p["g"] = singer_of(a_raw)
        songs[tid] = p
        return True

    missing = []
    for lang, cats in SEEDS["SEEDS"].items():
        if not want(lang):
            continue
        maxy = (SEEDS["CATEGORIES"]["oldies"].get("maxYear") or {}).get(lang)
        for cat, names in cats.items():
            for seed in names:
                got, seen = 0, 0
                for store in STORES[lang]:
                    term = s2t(seed) if store == "tw" else s2hk(seed) if store == "hk" else seed
                    for x in B.search(term, store):
                        if not artist_matches(seed, x.get("artistName", "")) or not ok_for(x, lang):
                            continue
                        seen += 1
                        bits = CAT_BIT[cat]
                        y = int((x.get("releaseDate") or "0000")[:4] or 0)
                        if cat != "oldies" and maxy and y and y <= maxy:
                            bits |= CAT_BIT["oldies"]
                        if add(x, lang, store, bits):
                            got += 1
                        if got >= PER[cat]:
                            break
                    if got >= min(5, PER[cat]) or seen >= PER[cat]:
                        break
                if seen == 0:
                    missing.append(f"{lang}/{cat}/{seed}")
                print(f"{lang}/{cat} {seed}: +{got} ({seen} usable)", flush=True)

    if want("world"):
        for title, by, zh in SEEDS["WORLD_CLASSICS"]:
            q = {"term": f"{title} {by}", "entity": "song", "limit": 12, "country": "us"}
            import urllib.parse
            d = B.get("https://itunes.apple.com/search?" + urllib.parse.urlencode(q))
            items = [x for x in (d or {}).get("results", []) if x.get("previewUrl") and (x.get("trackTimeMillis") or 0) >= 45_000 and not re.search(r"karaoke|ringtone|tutorial|8-bit|lullab|music box|tribute", x.get("trackName", "") + " " + x.get("collectionName", ""), re.I)]
            head = B.norm_title(title)[:6]
            pick = next((x for x in items if head and head in B.norm_title(x.get("trackName", ""))), items[0] if items else None)
            if pick:
                # the title players see: the Chinese name, then the original; the performer stays the artist
                add(pick, "world", "us", CLASSIC_BIT, shown=f"{zh} · {B.clean_title(pick['trackName'], 'en')}" if zh != B.clean_title(pick["trackName"], "en") else zh)
            print(f"world {title}: {pick['trackName'] + ' — ' + pick['artistName'] if pick else 'not found'}", flush=True)

    if want("charts"):
        for cc in CHART_COUNTRIES:
            ids = B.chart(cc)
            n = 0
            for x in B.lookup(ids, cc):
                li = guess_lang(x.get("trackName", ""), x.get("artistName", ""), cc)
                lang = next(k for k, v in LANG_INDEX.items() if v == li)
                if not ok_for(x, lang if lang in STORES else "en" if lang == "other" else lang):
                    continue
                if add(x, lang, cc, 0, chart_hit=True):
                    n += 1
            print("chart", cc, len(ids), "added", n, flush=True)

    rows = sorted(songs.values(), key=lambda s: (s["l"], s["a"], s["y"]))
    by_lang = {}
    for s in rows:
        by_lang[s["l"]] = by_lang.get(s["l"], 0) + 1
    print("total", len(rows), by_lang, flush=True)
    lines = []
    for s in rows:
        lines.append(json.dumps([s["id"], s["t"], s["a"], "" if s["ae"] == s["a"] else s["ae"], s["l"], s["y"], s["p"], s["art"], s["s"], s["c"], s["k"], s["g"]], ensure_ascii=False))
    stamp = time.strftime("%Y-%m-%d")
    names = {0: "Chinese", 1: "English", 2: "Cantonese", 3: "Korean", 4: "Japanese", 5: "Vietnamese", 6: "world classics", 7: "other"}
    counts = ", ".join(f"{by_lang[l]} {names[l]}" for l in sorted(by_lang))
    ts = f"""/**
 * Name That Tune: real songs. Built from Apple's public iTunes Search API on {stamp}
 * ({counts}), each with Apple's 30-second preview; singers looked up on MusicBrainz.
 * The previews stream from Apple and every reveal links to the song on Apple Music.
 * scripts/build_songs2.py rebuilds this file (scripts/song_seeds.json has the artists).
 *
 * Row: [Apple track id, title, artist, artist in English ("" = same), language (see LANGS in
 *       src/shared/songs.ts), year, preview (path inside Apple's preview server, or a full URL),
 *       artwork ("n|path"), storefront, 1 if it was on a most-played chart when the list was built,
 *       categories (a bit set, see CATS), who sings it (0 unknown, 1 a man, 2 a woman, 3 mixed)]
 */
import type {{ SongRow }} from "../shared/songs";

export const SONGS_BUILT = "{stamp}";

export const SONG_ROWS: SongRow[] = [
{chr(10).join("  " + r + "," for r in lines)}
];
"""
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(ts)
    print("wrote", OUT, os.path.getsize(OUT), "bytes", flush=True)
    with open(os.path.join(os.environ["SONG_CACHE"], "missing.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(missing))
    print("artists with nothing usable:", len(missing), flush=True)


if __name__ == "__main__":
    main()

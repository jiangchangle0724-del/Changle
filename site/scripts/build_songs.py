"""Build the Name That Tune song list from Apple's public iTunes Search API.

For each artist below it takes their best-known songs that have a 30-second preview, adds
whatever is on Apple Music's most-played charts today (Taiwan and Hong Kong for Chinese,
the US and Canada for English), drops live, remix, instrumental and karaoke takes, turns
Chinese into Simplified, and writes src/data/songs.ts.

The previews stay on Apple's servers: the game streams them from there and links each song
to Apple Music at the reveal. Run it again now and then to pick up new hits:

    python3 scripts/build_songs.py
"""
import json, os, re, sys, time, urllib.parse, urllib.request

from opencc import OpenCC

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "songs.ts")
CACHE = os.environ.get("SONG_CACHE", "/tmp/claude-0/songcache")
os.makedirs(CACHE, exist_ok=True)
t2s = OpenCC("t2s").convert

# (name to search, English name for the English screens)
ZH_ARTISTS = [
    ("周杰倫", "Jay Chou"), ("林俊傑", "JJ Lin"), ("陳奕迅", "Eason Chan"), ("五月天", "Mayday"),
    ("蔡依林", "Jolin Tsai"), ("孫燕姿", "Stefanie Sun"), ("王力宏", "Leehom Wang"), ("鄧紫棋", "G.E.M."),
    ("張惠妹", "A-Mei"), ("梁靜茹", "Fish Leong"), ("薛之謙", "Joker Xue"), ("毛不易", "Mao Buyi"),
    ("李榮浩", "Li Ronghao"), ("田馥甄", "Hebe Tien"), ("楊丞琳", "Rainie Yang"), ("蕭敬騰", "Jam Hsiao"),
    ("張學友", "Jacky Cheung"), ("王菲", "Faye Wong"), ("周深", "Zhou Shen"), ("華晨宇", "Hua Chenyu"),
    ("告五人", "Accusefive"), ("盧廣仲", "Crowd Lu"), ("陶喆", "David Tao"), ("方大同", "Khalil Fong"),
    ("林宥嘉", "Yoga Lin"), ("徐佳瑩", "LaLa Hsu"), ("韋禮安", "WeiBird"), ("蘇打綠", "Sodagreen"),
    ("張韶涵", "Angela Chang"), ("光良", "Michael Wong"), ("莫文蔚", "Karen Mok"), ("張敬軒", "Hins Cheung"),
    ("容祖兒", "Joey Yung"), ("許嵩", "Vae Xu"), ("汪蘇瀧", "Silence Wang"), ("周興哲", "Eric Chou"),
    ("艾怡良", "Eve Ai"), ("吳青峰", "Wu Qing-feng"), ("范瑋琪", "Christine Fan"), ("動力火車", "Power Station"),
    ("S.H.E", "S.H.E"), ("飛兒樂團", "F.I.R."), ("潘瑋柏", "Will Pan"), ("羅志祥", "Show Lo"),
    ("張震嶽", "A-Yue"), ("伍佰", "Wu Bai"), ("劉若英", "René Liu"), ("王心凌", "Cyndi Wang"),
    ("郭靜", "Claire Kuo"), ("戴佩妮", "Penny Tai"), ("任賢齊", "Richie Jen"), ("張信哲", "Jeff Chang"),
    ("張杰", "Jason Zhang"), ("李宇春", "Chris Lee"), ("謝霆鋒", "Nicholas Tse"), ("古巨基", "Leo Ku"),
    ("楊千嬅", "Miriam Yeung"), ("林家謙", "Terence Lam"), ("胡夏", "Hu Xia"), ("魏如萱", "Waa Wei"),
    ("茄子蛋", "EggPlantEgg"), ("八三夭", "831"), ("蔡健雅", "Tanya Chua"), ("曹格", "Gary Chaw"),
    ("品冠", "Victor Wong"), ("梁詠琪", "Gigi Leung"), ("黃小琥", "Tiger Huang"), ("那英", "Na Ying"),
    ("朴樹", "Pu Shu"), ("李健", "Li Jian"), ("汪峰", "Wang Feng"), ("趙雷", "Zhao Lei"),
    ("陳粒", "Chen Li"), ("鄭中基", "Ronald Cheng"), ("李聖傑", "Sam Lee"), ("郁可唯", "Yisa Yu"),
]

EN_ARTISTS = [
    "Taylor Swift", "Ed Sheeran", "Bruno Mars", "Adele", "The Weeknd", "Billie Eilish", "Dua Lipa",
    "Ariana Grande", "Justin Bieber", "Coldplay", "Imagine Dragons", "Maroon 5", "Rihanna", "Katy Perry",
    "Lady Gaga", "Post Malone", "Olivia Rodrigo", "Harry Styles", "Sabrina Carpenter", "Shawn Mendes",
    "Beyoncé", "Drake", "Sia", "OneRepublic", "Charlie Puth", "Miley Cyrus", "Doja Cat", "SZA",
    "Lizzo", "Lewis Capaldi", "Sam Smith", "Selena Gomez", "Camila Cabello", "Pharrell Williams",
    "Mark Ronson", "Avicii", "Calvin Harris", "The Chainsmokers", "David Guetta", "Linkin Park",
    "Green Day", "Black Eyed Peas", "Eminem", "Kendrick Lamar", "Lil Nas X", "Jason Mraz", "John Legend",
    "Alicia Keys", "Usher", "Justin Timberlake", "Britney Spears", "Kelly Clarkson", "P!nk", "Avril Lavigne",
    "Owl City", "Carly Rae Jepsen", "Daft Punk", "Vance Joy", "Passenger", "James Arthur", "Hozier",
    "Lorde", "Benson Boone", "Teddy Swims", "Chappell Roan", "Gracie Abrams", "Zara Larsson",
    "Tones And I", "Glass Animals", "Westlife", "Backstreet Boys", "Jessie J", "Ellie Goulding",
    "Meghan Trainor", "Pitbull", "LMFAO", "Gotye", "Fun.", "Florence + The Machine", "Lana Del Rey",
    "Halsey", "Khalid", "Rosé", "Tate McRae", "Noah Kahan", "Hailee Steinfeld",
]
ZH_PER = 10
EN_PER = 9

SKIP = re.compile(
    r"(?<![a-z])live(?![a-z])|現場|现场|演唱會|演唱会|remix|\bmix\)|instrumental|伴奏|伴唱|純音樂|纯音乐|演奏|karaoke|\bdemo\b|acoustic|"
    r"金曲|\bin [a-g][b#]? (major|minor)\b|"
    r"\bversion\)|\bver\.|medley|reprise|\bintro\b|\boutro\b|interlude|commentary|鋼琴版|钢琴版|\bedit\)|sped up|slowed|"
    r"orchestral|unplugged|a cappella|cover\)",
    re.I,
)
CJK = re.compile(r"[㐀-鿿]")
OTHER_SCRIPTS = re.compile(r"[가-힯぀-ヿ]")  # Hangul, kana

last_call = 0.0


def get(url, tries=4):
    """GET JSON with a polite pace (Apple allows about 20 calls a minute) and a file cache."""
    global last_call
    key = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9]+", "_", url)[-180:] + ".json")
    if os.path.exists(key):
        with open(key) as f:
            return json.load(f)
    if os.environ.get("SONG_OFFLINE"):  # only what's cached already (a quick test build)
        return None
    for i in range(tries):
        wait = 3.3 - (time.time() - last_call)
        if wait > 0:
            time.sleep(wait)
        last_call = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "changle.ca song list builder"})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = json.loads(r.read().decode("utf-8"))
            with open(key, "w") as f:
                json.dump(data, f)
            return data
        except Exception as e:  # rate limited (403) or flaky: back off, a lot longer when it's the limit
            print("  retry", i + 1, url[:90], e, file=sys.stderr, flush=True)
            time.sleep((150 if "403" in str(e) else 20) * (i + 1))
    return None


def search(term, country, limit=60):
    q = urllib.parse.urlencode({"term": term, "entity": "song", "attribute": "artistTerm", "limit": limit, "country": country})
    d = get("https://itunes.apple.com/search?" + q)
    return (d or {}).get("results", [])


def lookup(ids, country):
    out = []
    for k in range(0, len(ids), 150):
        q = urllib.parse.urlencode({"id": ",".join(str(i) for i in ids[k : k + 150]), "country": country, "entity": "song"})
        d = get("https://itunes.apple.com/lookup?" + q)
        out += [x for x in (d or {}).get("results", []) if x.get("kind") == "song"]
    return out


def chart(country):
    d = get(f"https://rss.marketingtools.apple.com/api/v2/{country}/music/most-played/100/songs.json")
    return [int(x["id"]) for x in ((d or {}).get("feed") or {}).get("results", [])]


def norm_title(s):
    s = t2s(s).lower()
    s = re.sub(r"[\(\[（【].*?[\)\]）】]", "", s)
    s = re.sub(r"\s+-\s+.*$", "", s)
    return re.sub(r"[^\w㐀-鿿]+", "", s)


def clean_title(name, lang):
    """The title as players know it: no "(theme song of ...)", "(feat. ...)", "(Remastered)" or " - subtitle" tails."""
    title = t2s(name) if lang == "zh" else name
    if lang == "zh":
        shown, prev = title, None
        # "歌名 《某剧》主题曲" and friends: everything from the first bracket on is the annotation
        if re.search(r"主题曲|片尾曲|片头曲|插曲|推广曲|宣传曲|心动曲|陪伴曲|主题歌|原声", shown):
            shown = re.split(r"\s*[\(（《\[【]", shown, maxsplit=1)[0] or shown
        while shown != prev:  # innermost first: "(剧集《逐玉》主题曲)"
            prev = shown
            shown = re.sub(r"\s*[\(（\[【《][^\(（\[【《\)）\]】》]*[\)）\]】》]", "", shown)
    else:
        shown = re.sub(r"(?<=\S)\s*[\(\[][^\)\]]*[\)\]]", "", title)
    shown = re.sub(r"\s+-\s+.*$", "", shown).strip()
    return shown or title.strip()


def ok_track(x, lang):
    if x.get("kind") != "song" or not x.get("previewUrl"):
        return False
    if (x.get("trackTimeMillis") or 0) < 100_000:
        return False
    name = x.get("trackName", "")
    if SKIP.search(name) or re.search(r"(?<![a-z])live(?![a-z])|演唱會|演唱会", x.get("collectionName", ""), re.I):
        return False
    if t2s(clean_title(name, lang)).lower() == t2s(x.get("artistName", "")).lower():
        return False
    if lang == "zh":
        return bool(CJK.search(name)) and not OTHER_SCRIPTS.search(name)
    return not CJK.search(name) and not OTHER_SCRIPTS.search(name) and not CJK.search(x.get("artistName", ""))


PRE = "https://audio-ssl.itunes.apple.com/itunes-assets/"
SUF = ".plus.aac.p.m4a"
ART = re.compile(r"^https://is(\d)-ssl\.mzstatic\.com/image/thumb/(.+)/\d+x\d+bb\.(jpg|png)$")


def pack(x, lang, artist_zh, artist_en, store, chart_hit):
    p = x["previewUrl"]
    p = p[len(PRE) : -len(SUF)] if p.startswith(PRE) and p.endswith(SUF) else p
    m = ART.match(x.get("artworkUrl100", ""))
    art = f"{m.group(1)}|{m.group(2)}" if m else ""
    shown = clean_title(x["trackName"], lang)
    year = int((x.get("releaseDate") or "0000")[:4] or 0)
    return {
        "id": x["trackId"],
        "t": shown,
        "a": artist_zh,
        "ae": artist_en,
        "l": lang,
        "y": year,
        "p": p,
        "art": art,
        "s": store,
        "c": 1 if chart_hit else 0,
    }


def main():
    songs, seen_ids, seen_titles = [], set(), set()

    def add(x, lang, artist_zh, artist_en, store, chart_hit=False):
        if x["trackId"] in seen_ids:
            return False
        key = (norm_title(clean_title(x["trackName"], lang)), t2s(artist_zh).lower())
        if key in seen_titles:
            return False
        seen_ids.add(x["trackId"])
        seen_titles.add(key)
        songs.append(pack(x, lang, artist_zh, artist_en, store, chart_hit))
        return True

    report = []
    for term, en in ZH_ARTISTS:
        want = t2s(term).lower()
        got = 0
        for x in search(term, "tw"):
            if got >= ZH_PER:
                break
            if want not in t2s(x.get("artistName", "")).lower() and en.lower() not in x.get("artistName", "").lower():
                continue
            if ok_track(x, "zh") and add(x, "zh", t2s(term), en, "tw"):
                got += 1
        report.append(f"{term} {got}")
        print("zh", term, got, flush=True)

    for name in EN_ARTISTS:
        got = 0
        for x in search(name, "us"):
            if got >= EN_PER:
                break
            if name.lower().replace("é", "e") not in x.get("artistName", "").lower().replace("é", "e"):
                continue
            if ok_track(x, "en") and add(x, "en", x["artistName"], x["artistName"], "us"):
                got += 1
        report.append(f"{name} {got}")
        print("en", name, got, flush=True)

    # today's charts, for what everyone is playing right now
    for country, lang in [("tw", "zh"), ("hk", "zh"), ("us", "en"), ("ca", "en"), ("gb", "en"), ("au", "en")]:
        ids = chart(country)
        n = 0
        for x in lookup(ids, country):
            if not ok_track(x, lang):
                continue
            a = x.get("artistName", "")
            if add(x, lang, t2s(a) if lang == "zh" else a, a, country, True):
                n += 1
        print("chart", country, len(ids), "added", n, flush=True)

    zh = [s for s in songs if s["l"] == "zh"]
    en = [s for s in songs if s["l"] == "en"]
    print("total", len(songs), "zh", len(zh), "en", len(en))

    rows = []
    for s in songs:
        rows.append(json.dumps([s["id"], s["t"], s["a"], s["ae"] if s["ae"] != s["a"] else "", 0 if s["l"] == "zh" else 1, s["y"], s["p"], s["art"], s["s"], s["c"]], ensure_ascii=False))
    stamp = time.strftime("%Y-%m-%d")
    ts = f"""/**
 * Name That Tune: real songs. Generated by scripts/build_songs.py on {stamp} from Apple's public
 * iTunes Search API: {len(zh)} Chinese and {len(en)} English songs, each with Apple's 30-second
 * preview. The previews stream from Apple and every reveal links to the song on Apple Music.
 *
 * Row: [Apple track id, title, artist, artist in English ("" = same), 0 Chinese / 1 English,
 *       year, preview (path inside Apple's preview server, or a full URL), artwork ("n|path"),
 *       storefront, 1 if it was on a most-played chart when the list was built]
 */
import type {{ SongRow }} from "../shared/songs";

export const SONGS_BUILT = "{stamp}";

export const SONG_ROWS: SongRow[] = [
{chr(10).join("  " + r + "," for r in rows)}
];
"""
    with open(OUT, "w") as f:
        f.write(ts)
    print("wrote", OUT, os.path.getsize(OUT), "bytes")
    with open(os.path.join(CACHE, "report.txt"), "w") as f:
        f.write("\n".join(report))


if __name__ == "__main__":
    main()

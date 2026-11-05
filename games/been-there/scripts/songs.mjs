// The local hits: finds and checks the songs a second visit to a city plays (src/client/music.ts,
// src/client/ui/localSong.ts), and writes them into src/client/songs.json.
//   npm run songs          (needs the internet; a few minutes: Apple answers about 20 requests a minute)
//
// PICKS below names 3 to 5 songs for each city: ones a party would know, that clearly belong to the
// place (its country at least), each the original recording by its original artist. For each one the
// script asks Apple's iTunes Lookup API about its track id (the call a phone makes at play time) and
// keeps it only if it is that song by that artist, not explicit, not live, a remix, karaoke, an
// instrumental, a re-recording or a cover, and has a 30-second preview. If the id no longer answers, it
// searches the city's storefront (the iTunes Search API) for the song again, by the same rules, and
// says what it found instead. Nothing is downloaded: phones stream the previews from Apple at play time
// and keep the preview URL found here as the fallback.
//
// `show` and `by` are what a player reads instead of Apple's title and artist, in Chinese (zh) or English
// (en), where Apple's isn't readable for them (another script, Traditional Chinese for Beijing...).
import { writeFile } from "node:fs/promises";

const OUT = "src/client/songs.json";

/** [city, storefront, songs]. A song: artist and title as Apple writes them, its track id, and what players read. */
const PICKS = [
  ["cairo", "eg", [
    { artist: "Amr Diab", title: "Noor Al Ain", id: 878251626, show: { zh: "Nour El Ain（你是我眼中的光）", en: "Nour El Ain" } },
    { artist: "Amr Diab", title: "Tamly Maak", id: 880940097, show: { zh: "Tamally Maak（永远和你在一起）", en: "Tamally Maak (Always With You)" } },
    { artist: "Amr Diab", title: "Wala Ala Baloh", id: 1775884497 },
    { artist: "Amr Diab", title: "Al Qahira", id: 1775897050, show: { zh: "Al Qahira（开罗）", en: "Al Qahira (Cairo)" }, by: { zh: "Amr Diab、Mohamed Mounir", en: "Amr Diab & Mohamed Mounir" } },
  ]],
  ["capetown", "za", [
    { artist: "Master KG", title: "Jerusalema", id: 1522899953, show: { zh: "Jerusalema", en: "Jerusalema" }, by: { zh: "Master KG、Nomcebo Zikode", en: "Master KG & Nomcebo Zikode" } },
    { artist: "Miriam Makeba", title: "Pata Pata", id: 1472550501 },
    { artist: "Shakira", title: "Waka Waka (This Time for Africa)", id: 371784883, show: { zh: "Waka Waka（2010 南非世界杯主题曲）", en: "Waka Waka (This Time for Africa)" }, by: { zh: "夏奇拉、Freshlyground", en: "Shakira & Freshlyground" } },
    { artist: "Johnny Clegg & Juluka", title: "Scatterlings of Africa", id: 1616151714 },
    { artist: "Freshlyground", title: "Doo Be Doo", id: 401533640 },
  ]],
  ["buenosaires", "ar", [
    { artist: "Carlos Gardel", title: "Por una Cabeza", id: 1041957220, show: { zh: "Por una Cabeza（一步之遥）" }, by: { zh: "卡洛斯·加德尔" } },
    { artist: "Carlos Gardel", title: "Mi Buenos Aires Querido", id: 435222105, show: { zh: "Mi Buenos Aires Querido（我亲爱的布宜诺斯艾利斯）" }, by: { zh: "卡洛斯·加德尔" } },
    { artist: "Carlos Gardel", title: "Volver", id: 689435154, show: { zh: "Volver（归来）" }, by: { zh: "卡洛斯·加德尔" } },
    { artist: "Astor Piazzolla", title: "Libertango", id: 376141820, show: { zh: "Libertango（自由探戈）" }, by: { zh: "阿斯托尔·皮亚佐拉" } },
    { artist: "Gotan Project", title: "Santa María (Del Buen Ayre)", id: 278035379 },
  ]],
  ["mexicocity", "mx", [
    { artist: "Vicente Fernández", title: "Volver Volver", id: 322077972 },
    { artist: "José Alfredo Jiménez", title: "El Rey", id: 201871230, show: { zh: "El Rey（国王）" } },
    { artist: "Juan Gabriel", title: "Querida", id: 404411106, by: { zh: "胡安·加布里埃尔" } },
    { artist: "Juan Gabriel", title: "El Noa Noa", id: 469437607, by: { zh: "胡安·加布里埃尔" } },
    { artist: "Café Tacvba", title: "Eres", id: 1444184596 },
  ]],
  ["rio", "br", [
    { artist: "Stan Getz & João Gilberto", title: "The Girl from Ipanema", id: 1422656474, show: { zh: "The Girl from Ipanema（伊帕内玛的女孩）" } },
    { artist: "Jorge Ben Jor", title: "Mas, Que Nada!", id: 1443845526 },
    { artist: "Jorge Ben Jor", title: "País Tropical", id: 1413446558 },
    { artist: "Elis Regina & Antônio Carlos Jobim", title: "Águas de Março", id: 1438430509, show: { zh: "Águas de Março（三月的雨）" } },
    { artist: "João Gilberto", title: "Chega de Saudade", id: 1003389383, by: { zh: "若昂·吉尔贝托" } },
  ]],
  ["istanbul", "tr", [
    { artist: "Tarkan", title: "Şımarık", id: 499332705, show: { zh: "Şımarık（Kiss Kiss）", en: "Şımarık (Kiss Kiss)" }, by: { zh: "塔肯" } },
    { artist: "Tarkan", title: "Kuzu Kuzu", id: 499334149, by: { zh: "塔肯" } },
    { artist: "Tarkan", title: "Dudu", id: 696699513, by: { zh: "塔肯" } },
    { artist: "Sertab Erener", title: "Every Way That I Can", id: 400705407 },
  ]],
  ["mumbai", "in", [
    { artist: "A.R. Rahman", title: "Jai Ho", id: 1443885535, cc: "us", show: { zh: "Jai Ho（《贫民窟的百万富翁》）", en: "Jai Ho" }, by: { zh: "A·R·拉赫曼", en: "A.R. Rahman" } },
    { artist: "Sukhwinder Singh & Sapna Awasthi", title: "Chaiyya Chaiyya", id: 1130322151 },
    { artist: "Mohd. Rafi & Geeta Dutt", title: "Yeh Hai Bombay Meri Jaan", id: 1346985097, show: { zh: "Yeh Hai Bombay Meri Jaan（孟买，我亲爱的）", en: "Yeh Hai Bombay Meri Jaan (This Is Bombay, My Love)" } },
    { artist: "Alisha Chinai", title: "Kajra Re", id: 673539855 },
    { artist: "Ranveer Singh, Dub Sharma & DIVINE", title: "Apna Time Aayega", id: 1529556364, show: { zh: "Apna Time Aayega（《街头之王》）" } },
  ]],
  ["dubai", "ae", [
    { artist: "Hussain Al Jassmi", title: "Boshret Kheir", id: 878649215 },
    { artist: "Hussain Al Jassmi", title: "Ahebak", id: 1330913310, show: { zh: "Ahebak（我爱你）", en: "Ahebak (I Love You)" } },
    { artist: "Hussain Al Jassmi", title: "Bel Bont El3areedh", id: 1527873677, show: { zh: "Bel Bont El Areedh", en: "Bel Bont El Areedh" } },
    { artist: "Ahlam", title: "Hala Ya Marhaban Wa Ahla", id: 1200413484, show: { zh: "Hala Ya Marhaban Wa Ahla（欢迎，欢迎）", en: "Hala Ya Marhaban Wa Ahla (Welcome, Welcome)" } },
  ]],
  ["lasvegas", "us", [
    { artist: "Elvis Presley", title: "Viva Las Vegas", id: 217635876, by: { zh: "猫王" } },
    { artist: "The Killers", title: "Mr. Brightside", id: 1526194192 },
    { artist: "Imagine Dragons", title: "Believer", id: 1411628233, by: { zh: "梦龙乐队" } },
    { artist: "Imagine Dragons", title: "Radioactive", id: 1440873126, by: { zh: "梦龙乐队" } },
    { artist: "Panic! At the Disco", title: "High Hopes", id: 1361152303 },
  ]],
  ["vancouver", "ca", [
    { artist: "Carly Rae Jepsen", title: "Call Me Maybe", id: 465744628, by: { zh: "卡莉·蕾·吉普森" } },
    { artist: "Bryan Adams", title: "Summer of '69", id: 1440823965, by: { zh: "布莱恩·亚当斯" } },
    { artist: "Michael Bublé", title: "Haven't Met You Yet", id: 668403662, by: { zh: "迈克尔·布雷" } },
    { artist: "Spirit of the West", title: "Home For A Rest", id: 1799167787 },
    { artist: "Nelly Furtado", title: "I'm Like a Bird", id: 1440781293, by: { zh: "妮莉·费塔多" } },
  ]],
  ["newyork", "us", [
    { artist: "Liza Minnelli", title: "Theme from New York, New York", id: 715515542, by: { zh: "丽莎·明尼利" } },
    { artist: "Billy Joel", title: "New York State of Mind", id: 259213690, by: { zh: "比利·乔尔" } },
    { artist: "Taylor Swift", title: "Welcome To New York", id: 1440935802, by: { zh: "泰勒·斯威夫特" } },
    { artist: "Sting", title: "Englishman In New York", id: 1650882898 },
    { artist: "Alicia Keys", title: "Empire State of Mind", id: 341321703, by: { zh: "艾丽西亚·凯斯" } },
  ]],
  ["tokyo", "jp", [
    { artist: "坂本九", title: "上を向いて歩こう", id: 1465042214, show: { zh: "上を向いて歩こう（昂首向前走）", en: "Ue o Muite Arukō (Sukiyaki)" }, by: { en: "Kyu Sakamoto" } },
    { artist: "松原みき", title: "真夜中のドア", id: 1858846510, show: { zh: "真夜中のドア（午夜之门）", en: "Mayonaka no Door (Stay With Me)" }, by: { zh: "松原美纪", en: "Miki Matsubara" } },
    { artist: "米津玄師", title: "Lemon", id: 1537460612, by: { zh: "米津玄师", en: "Kenshi Yonezu" } },
    { artist: "YOASOBI", title: "アイドル", id: 1679278167, show: { zh: "アイドル（偶像）", en: "Idol" } },
    { artist: "きゃりーぱみゅぱみゅ", title: "PONPONPON", id: 448331172, by: { zh: "卡莉怪妞", en: "Kyary Pamyu Pamyu" } },
  ]],
  ["beijing", "tw", [
    { artist: "劉佳慧 & 陳昇", title: "One Night in Beijing", id: 158254912, show: { zh: "北京一夜", en: "One Night in Beijing" }, by: { zh: "陈升、刘佳慧", en: "Bobby Chen & Liu Chia-hui" } },
    { artist: "崔健", title: "一無所有", id: 1585626292, show: { zh: "一无所有", en: "Nothing to My Name" }, by: { en: "Cui Jian" } },
    { artist: "王菲", title: "紅豆", id: 965771855, show: { zh: "红豆", en: "Red Beans" }, by: { en: "Faye Wong" } },
    { artist: "朴樹", title: "平凡之路", id: 1438422297, show: { zh: "平凡之路", en: "The Ordinary Road" }, by: { zh: "朴树", en: "Pu Shu" } },
  ]],
  ["shanghai", "tw", [
    { artist: "周璇", title: "夜上海", id: 724614995, show: { en: "Shanghai Nights" }, by: { en: "Zhou Xuan" } },
    { artist: "姚莉", title: "玫瑰玫瑰我愛你", id: 821631826, show: { zh: "玫瑰玫瑰我爱你", en: "Rose, Rose, I Love You" }, by: { en: "Yao Lee" } },
    { artist: "李香蘭", title: "夜來香", id: 720224462, show: { zh: "夜来香", en: "Ye Lai Xiang (Tuberose)" }, by: { zh: "李香兰", en: "Li Xianglan" } },
    { artist: "葉麗儀", title: "上海灘", id: 1442451443, cc: "hk", show: { zh: "上海滩", en: "The Bund" }, by: { zh: "叶丽仪", en: "Frances Yip" } },
    { artist: "周杰倫", title: "上海一九四三", id: 535739354, show: { en: "Shanghai 1943" }, by: { zh: "周杰伦", en: "Jay Chou" } },
  ]],
  ["bangkok", "th", [
    { artist: "Murray Head", title: "One Night In Bangkok", id: 1654688410 },
    { artist: "LISA", title: "LALISA", id: 1584313399 },
    { artist: "LISA", title: "MONEY", id: 1584313400 },
    { artist: "Yinglee Srijumpol", title: "ขอใจเธอแลกเบอร์โทร", id: 1793330679, show: { zh: "用我的号码换你的心", en: "Your Heart for My Number" }, by: { zh: "Yinglee Srijumpol" } },
  ]],
  ["sydney", "au", [
    { artist: "Men At Work", title: "Down Under", id: 282960968 },
    { artist: "AC/DC", title: "Thunderstruck", id: 574051407 },
    { artist: "INXS", title: "Need You Tonight", id: 1442612831 },
    { artist: "Midnight Oil", title: "Beds Are Burning", id: 533503025 },
  ]],
  ["singapore", "sg", [
    { artist: "Kit Chan", title: "Home", id: 1136286496, by: { zh: "陈洁仪" } },
    { artist: "JJ Lin", title: "江南", id: 1071753628, show: { en: "Jiang Nan" }, by: { zh: "林俊杰" } },
    { artist: "JJ Lin", title: "她說", id: 1071506929, show: { zh: "她说", en: "She Says" }, by: { zh: "林俊杰" } },
    { artist: "Yanzi Sun", title: "Encounter", id: 541857030, show: { zh: "遇见" }, by: { zh: "孙燕姿", en: "Stefanie Sun" } },
    { artist: "Yanzi Sun", title: "The Dark Day", id: 990152981, show: { zh: "天黑黑" }, by: { zh: "孙燕姿", en: "Stefanie Sun" } },
  ]],
  ["venice", "it", [
    { artist: "Domenico Modugno", title: "Nel Blu Dipinto Di Blu", id: 278646936, show: { zh: "Volare（飞翔）", en: "Nel blu dipinto di blu (Volare)" }, by: { zh: "多梅尼科·莫杜尼奥" } },
    { artist: "Adriano Celentano", title: "Azzurro", id: 1775198614 },
    { artist: "Toto Cutugno", title: "L'italiano", id: 1329256166, show: { zh: "L'italiano（意大利人）" } },
    { artist: "Al Bano Carrisi & Romina Power", title: "Felicità", id: 298583321, show: { zh: "Felicità（幸福）" } },
    { artist: "Rondò Veneziano", title: "La Serenissima", id: 450128130, show: { zh: "La Serenissima（威尼斯）" } },
  ]],
  ["paris", "fr", [
    { artist: "Édith Piaf", title: "La vie en rose", id: 591787216, show: { zh: "La vie en rose（玫瑰人生）" }, by: { zh: "伊迪丝·琵雅芙" } },
    { artist: "Joe Dassin", title: "Les Champs-Élysées", id: 311331447, show: { zh: "Les Champs-Élysées（香榭丽舍）" }, by: { zh: "乔·达桑" } },
    { artist: "Charles Aznavour", title: "La bohème", id: 1743413442, by: { zh: "夏尔·阿兹纳弗" } },
    { artist: "Édith Piaf", title: "Non, je ne regrette rien", id: 591787437, show: { zh: "Non, je ne regrette rien（我无怨无悔）" }, by: { zh: "伊迪丝·琵雅芙" } },
    { artist: "ZAZ", title: "Je veux", id: 693461512 },
  ]],
  ["london", "gb", [
    { artist: "The Kinks", title: "Waterloo Sunset", id: 1642495077 },
    { artist: "The Clash", title: "London Calling", id: 684811768 },
    { artist: "Pet Shop Boys", title: "West End Girls", id: 1645128751 },
    { artist: "Gerry Rafferty", title: "Baker Street", id: 693696670 },
    { artist: "Adele", title: "Rolling In the Deep", id: 403037877, by: { zh: "阿黛尔" } },
  ]],
  ["seoul", "us", [
    { artist: "PSY", title: "Gangnam Style", id: 1445144527, show: { zh: "江南 Style" } },
    { artist: "BTS", title: "Dynamite", id: 1627575419, by: { zh: "防弹少年团" } },
    { artist: "BLACKPINK", title: "DDU-DU DDU-DU", id: 1551479993 },
    { artist: "BIGBANG", title: "Fantastic Baby", id: 1337452979 },
    { artist: "NewJeans", title: "Hype Boy", id: 1635469851 },
  ]],
  ["hongkong", "hk", [
    { artist: "Beyond", title: "海闊天空", id: 201575679, show: { zh: "海阔天空", en: "Boundless Oceans, Vast Skies" } },
    { artist: "張國榮", title: "當年情", id: 892456173, show: { zh: "当年情", en: "Dong Nin Ching, from A Better Tomorrow" }, by: { zh: "张国荣", en: "Leslie Cheung" } },
    { artist: "許冠傑", title: "半斤八兩", id: 1443345874, show: { zh: "半斤八两", en: "The Private Eyes" }, by: { zh: "许冠杰", en: "Sam Hui" } },
    { artist: "梅豔芳", title: "夕陽之歌", id: 892490676, show: { zh: "夕阳之歌", en: "Song of the Sunset" }, by: { zh: "梅艳芳", en: "Anita Mui" } },
    { artist: "陳百強", title: "偏偏喜歡你", id: 726243548, show: { zh: "偏偏喜欢你", en: "Pin Pin Hei Fun Nei" }, by: { zh: "陈百强", en: "Danny Chan" } },
  ]],
];

/** Not the original recording: live, remixed, re-recorded, karaoke, instrumental, sped up, a cover, a demo. */
const NOT_ORIGINAL =
  /(?<![a-z])live(?![a-z])|ao vivo|en vivo|en directo|現場|演唱會|remix|\bmix\)|re-?record|taylor's version|karaoke|instrumental|伴奏|acoustic|unplugged|\bdemo\b|\bcover\b|originally performed|in the style of|made famous|tribute|sped up|slowed|lofi|lo-fi|\bedit\b|a cappella|acapella|orchestral|symphoni/i;
const LIVE_ALBUM = /(?<![a-z])live(?![a-z])|ao vivo|en vivo|演唱會|concert|unplugged|karaoke/i;
/** Apple's notes on a title that a player needn't read: remasters, mono or stereo, where it's from. */
const NOTE = /\s*[([](?:[^()[\]]*?(?:remaster|version|mono|stereo|single|from |soundtrack|official|world cup|motion picture)[^()[\]]*)[)\]]\s*$/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
/** Apple's APIs, at a pace they accept (about 20 a minute), trying again when they ask us to wait. */
async function apple(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = last + 3200 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const r = await fetch(url).catch(() => null);
    if (r?.ok) return r.json();
    await sleep(10_000 * (attempt + 1));
  }
  throw new Error(`no answer from ${url}`);
}

const norm = (s) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`.,!?()[\]&、·\-\s]/g, "");

function clean(title) {
  let t = title.trim();
  while (NOTE.test(t)) t = t.replace(NOTE, "");
  return t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+[—–]\s+/g, " - ").trim();
}

/** Why this track won't do for this pick, or null if it will. */
function wrong(x, pick) {
  if (!x || x.kind !== "song") return "not a song";
  if (x.trackExplicitness === "explicit" || x.trackExplicitness === "cleaned") return `explicit (${x.trackExplicitness})`;
  if (!/^https:\/\/audio-ssl\.itunes\.apple\.com\//.test(x.previewUrl ?? "")) return "no preview";
  if (!norm(x.artistName ?? "").includes(norm(pick.artist)) && !norm(pick.artist).includes(norm(x.artistName ?? ""))) return `by ${x.artistName}`;
  if (!norm(x.trackName ?? "").startsWith(norm(pick.title))) return `called ${x.trackName}`;
  if (NOT_ORIGINAL.test(x.trackName) || LIVE_ALBUM.test(x.collectionName ?? "")) return `not the original: ${x.trackName} (${x.collectionName})`;
  return null;
}

async function lookup(id, cc) {
  const d = await apple(`https://itunes.apple.com/lookup?id=${id}&country=${cc}&entity=song`);
  return d.results?.find((x) => x.trackId === id) ?? null;
}

/** Search the storefront again: the matching tracks, exact title first, then the earliest. */
async function search(pick, cc) {
  const d = await apple(`https://itunes.apple.com/search?term=${encodeURIComponent(`${pick.artist} ${pick.title}`)}&entity=song&country=${cc}&limit=25`);
  const ok = (d.results ?? []).filter((x) => !wrong(x, pick));
  const exact = (x) => (norm(clean(x.trackName)) === norm(pick.title) ? 0 : 1);
  return ok.sort((a, b) => exact(a) - exact(b) || String(a.releaseDate).localeCompare(String(b.releaseDate)));
}

const out = {};
const problems = [];
for (const [city, store, songs] of PICKS) {
  out[city] = [];
  for (const pick of songs) {
    const cc = pick.cc ?? store;
    let x = await lookup(pick.id, cc);
    let why = wrong(x, pick);
    if (why) {
      const found = (await search(pick, cc))[0];
      if (!found) {
        problems.push(`${city}: ${pick.artist} - ${pick.title} (${pick.id}): ${why}, and nothing else found`);
        continue;
      }
      console.log(`${city}: ${pick.title}: ${pick.id} ${why}; using ${found.trackId} (${found.collectionName}) instead`);
      x = await lookup(found.trackId, cc);
      why = wrong(x, pick);
      if (why) {
        problems.push(`${city}: ${pick.title}: ${found.trackId} ${why}`);
        continue;
      }
    }
    const url = new URL(x.trackViewUrl);
    url.searchParams.delete("uo");
    out[city].push({
      id: x.trackId,
      cc,
      title: clean(x.trackName),
      artist: x.artistName.trim(),
      year: Number(String(x.releaseDate).slice(0, 4)) || 0,
      explicitness: x.trackExplicitness,
      preview: x.previewUrl,
      url: url.toString(),
      ...(pick.show ? { show: pick.show } : {}),
      ...(pick.by ? { by: pick.by } : {}),
    });
    console.log(`${city}: ${clean(x.trackName)} · ${x.artistName} (${x.trackId}, ${cc})`);
  }
  if (out[city].length < 3) problems.push(`${city}: only ${out[city].length} songs`);
}

if (problems.length) {
  console.error(`\nNot written, fix these first:\n${problems.join("\n")}`);
  process.exit(1);
}
const made = new Date().toISOString().slice(0, 10);
await writeFile(OUT, `${JSON.stringify({ made, source: "Apple iTunes Search and Lookup APIs (scripts/songs.mjs)", cities: out }, null, 1)}\n`);
console.log(`\n${OUT}: ${Object.values(out).flat().length} songs for ${Object.keys(out).length} cities`);

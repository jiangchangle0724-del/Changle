// The real photos and recordings of the 22 cities, and where each came from. The files are in
// src/client/media (photos/<id>.webp at 1280×720 and <id>-s.webp at 640×360, sounds/<id>.mp3) and
// ship beside the game at /trip/photos and /trip/sounds; the credits page lists every one.
// All are free to use: public domain or CC0, CC BY, or CC BY-SA (no NC, no ND).
import { BASE } from "./base";

type Text = { zh: string; en: string };

export interface Credit {
  /** The work's own title, as its page gives it. */
  title: string;
  author: string;
  /** "CC0", "CC BY 4.0", "CC BY-SA 3.0"… */
  license: string;
  licenseUrl: string;
  /** The file's own page (Wikimedia Commons, Freesound). */
  page: string;
}

export interface Photo extends Credit {
  /** What's in it, for the alt text and the caption. */
  alt: Text;
}

export interface Recording extends Credit {
  /** What you hear. */
  what: Text;
}

const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const BY3 = "https://creativecommons.org/licenses/by/3.0/";
const BY4 = "https://creativecommons.org/licenses/by/4.0/";
const fs = (user: string, id: number) => `https://freesound.org/people/${user}/sounds/${id}/`;

/** Five seconds of each recording (cut, faded, mixed to mono and levelled), on Freesound. */
export const RECORDINGS: Record<string, Recording> = {
  cairo: { title: "Khan El Khalili bazaar", author: "3bagbrew", license: "CC0", licenseUrl: CC0, page: fs("3bagbrew", 511005), what: { zh: "汗·哈利利集市", en: "Khan el-Khalili bazaar" } },
  capetown: { title: "African penguins at Boulders Beach", author: "Vortichez", license: "CC BY 4.0", licenseUrl: BY4, page: fs("Vortichez", 545415), what: { zh: "博尔德斯海滩的企鹅", en: "Penguins at Boulders Beach" } },
  buenosaires: { title: "Buenos Aires - Medium size street - Sunny Day - Diaz Velez Ave. and Yatay St.", author: "khenshom", license: "CC0", licenseUrl: CC0, page: fs("khenshom", 479356), what: { zh: "晴天的街口", en: "A street corner on a sunny day" } },
  mexicocity: { title: "Bell of a garbage truck in Mexico City", author: "felix.blume", license: "CC0", licenseUrl: CC0, page: fs("felix.blume", 501690), what: { zh: "垃圾车来了的铃声", en: "The bell that says the garbage truck is here" } },
  rio: { title: "CopacabanaBeach_Sunrise_Sea", author: "MariaARomeroF-Acusmática", license: "CC BY 4.0", licenseUrl: BY4, page: "https://freesound.org/s/735532/", what: { zh: "科帕卡巴纳海滩的日出", en: "Sunrise at Copacabana beach" } },
  istanbul: { title: "Kadiköy ferry. Back of boat", author: "fielastro", license: "CC0", licenseUrl: CC0, page: fs("fielastro", 250508), what: { zh: "卡德柯伊的渡轮", en: "On the ferry from Kadıköy" } },
  mumbai: { title: "Ext Mumbai City Traffic Ambience", author: "seventhsamurai", license: "CC0", licenseUrl: CC0, page: fs("seventhsamurai", 585731), what: { zh: "午后的车流", en: "Afternoon traffic" } },
  dubai: { title: "Dubai Metro", author: "3bagbrew", license: "CC0", licenseUrl: CC0, page: fs("3bagbrew", 144429), what: { zh: "迪拜地铁", en: "The Dubai Metro" } },
  lasvegas: { title: "Casino - Las Vegas Slot Machines", author: "martialway47", license: "CC0", licenseUrl: CC0, page: fs("martialway47", 259719), what: { zh: "赌场的老虎机", en: "Slot machines in a casino" } },
  vancouver: { title: "vancouver steam clock 12pm people city", author: "jerry.berumen", license: "CC BY 4.0", licenseUrl: BY4, page: fs("jerry.berumen", 768919), what: { zh: "煤气镇的蒸汽钟", en: "The Gastown steam clock" } },
  newyork: { title: "New York Street Ambience", author: "lazymonk", license: "CC0", licenseUrl: CC0, page: fs("lazymonk", 214319), what: { zh: "纽约街头", en: "A New York street" } },
  tokyo: { title: "cross_road_shibuya", author: "Heigh-hoo", license: "CC0", licenseUrl: CC0, page: fs("Heigh-hoo", 31791), what: { zh: "涩谷十字路口", en: "The Shibuya crossing" } },
  beijing: { title: "Beijing Opera - percussion pattern", author: "ajaysm", license: "CC BY 4.0", licenseUrl: BY4, page: fs("ajaysm", 205971), what: { zh: "京剧锣鼓", en: "Beijing opera percussion" } },
  shanghai: { title: "Shanghai Traffic Near Peoples Square", author: "timsc", license: "CC0", licenseUrl: CC0, page: fs("timsc", 242922), what: { zh: "人民广场附近的车流", en: "Traffic near People's Square" } },
  bangkok: { title: "Thailand-Bangkok_Streetwalk", author: "onkelhoste", license: "CC0", licenseUrl: CC0, page: fs("onkelhoste", 457365), what: { zh: "曼谷街头", en: "A busy Bangkok street" } },
  sydney: { title: "Underneath Sydney harbour bridge (boat horn, train overhead, industrial, light breeze)", author: "snapant", license: "CC0", licenseUrl: CC0, page: fs("snapant", 266339), what: { zh: "海港大桥下", en: "Under the Harbour Bridge" } },
  singapore: { title: "Singapore_MRT_Station", author: "abrmy", license: "CC0", licenseUrl: CC0, page: fs("abrmy", 429672), what: { zh: "地铁站", en: "An MRT station" } },
  venice: { title: "Venezia Canal Grande early morning", author: "emanuele.caro", license: "CC0", licenseUrl: CC0, page: fs("emanuele.caro", 449721), what: { zh: "清晨的大运河", en: "The Grand Canal early in the morning" } },
  paris: { title: "Café parisien ambiance Paris", author: "beman87", license: "CC BY 3.0", licenseUrl: BY3, page: fs("beman87", 162853), what: { zh: "巴黎的咖啡馆", en: "Inside a Paris café" } },
  london: { title: "BigBenAtMidnight", author: "SometimesJasmine", license: "CC0", licenseUrl: CC0, page: fs("SometimesJasmine", 403131), what: { zh: "大本钟敲响午夜", en: "Big Ben striking midnight" } },
  seoul: { title: "Namdaemun street market, Seoul, Korea", author: "dikolson", license: "CC0", licenseUrl: CC0, page: fs("dikolson", 405399), what: { zh: "南大门市场", en: "Namdaemun market" } },
  hongkong: { title: "HongKong Stop-Lights", author: "al.barbosa", license: "CC0", licenseUrl: CC0, page: fs("al.barbosa", 150856), what: { zh: "过马路的提示音", en: "The pedestrian crossing signal" } },
};

/** A photo of each city from Wikimedia Commons, cropped to 16:9 and made smaller. */
export const PHOTOS: Record<string, Photo> = {
  cairo: { title: "Kairo Ibn Tulun Moschee BW 5", author: "Berthold Werner", license: "CC BY 3.0", licenseUrl: "https://creativecommons.org/licenses/by/3.0/", page: "https://commons.wikimedia.org/wiki/File:Kairo_Ibn_Tulun_Moschee_BW_5.jpg", alt: { zh: "伊本·图伦清真寺", en: "The Mosque of Ibn Tulun" } },
  capetown: { title: "73, Chiappini Street, Bo-Kaap (01)", author: "Moheen Reeyad", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:73,_Chiappini_Street,_Bo-Kaap_(01).jpg", alt: { zh: "波卡普区的一栋黄房子", en: "A yellow house in Bo-Kaap" } },
  buenosaires: { title: "El caminito7 - Buenos Aires - Argentina", author: "Diego Delso", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", page: "https://commons.wikimedia.org/wiki/File:El_caminito7_-_Buenos_Aires_-_Argentina.jpg", alt: { zh: "博卡区卡米尼托的彩色房子", en: "The painted houses of Caminito, in La Boca" } },
  mexicocity: { title: "Mexico City Palacio de bellas artes", author: "Jeses", license: "CC BY-SA 2.5", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.5/", page: "https://commons.wikimedia.org/wiki/File:Mexico_City_Palacio_de_bellas_artes.jpg", alt: { zh: "从拉丁美洲塔上看美术宫", en: "The Palacio de Bellas Artes, from the Torre Latinoamericana" } },
  rio: { title: "Rio de Janeiro skyline and Sugarloaf Mountain at sunset, Brazil 3", author: "Wilfredor", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", page: "https://commons.wikimedia.org/wiki/File:Rio_de_Janeiro_skyline_and_Sugarloaf_Mountain_at_sunset,_Brazil_3.jpg", alt: { zh: "日落时的里约热内卢和海湾", en: "Rio de Janeiro and its bay at sunset" } },
  istanbul: { title: "Hagia Sophia Mars 2013", author: "Arild Vågen", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", page: "https://commons.wikimedia.org/wiki/File:Hagia_Sophia_Mars_2013.jpg", alt: { zh: "圣索菲亚大教堂", en: "Hagia Sophia" } },
  mumbai: { title: "Panoramic view of Taj Palace Hotel and Taj Tower with the iconic Gateway of India in the background", author: "iMahesh", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Panoramic_view_of_Taj_Palace_Hotel_and_Taj_Tower_with_the_iconic_Gateway_of_India_in_the_background.jpg", alt: { zh: "泰姬玛哈酒店和印度门", en: "The Taj Mahal Palace hotel and the Gateway of India" } },
  dubai: { title: "Saeed Al Maktoum House-Dubai2841", author: "Diego Delso", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Saeed_Al_Maktoum_House-Dubai2841.JPG", alt: { zh: "谢赫·赛义德·阿勒马克图姆故居", en: "The house of Sheikh Saeed Al Maktoum" } },
  lasvegas: { title: "Bellagio Las Vegas December 2013 panorama", author: "King of Hearts", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", page: "https://commons.wikimedia.org/wiki/File:Bellagio_Las_Vegas_December_2013_panorama.jpg", alt: { zh: "夜里的百乐宫酒店", en: "The Bellagio at night" } },
  vancouver: { title: "Burrard Bridge 04", author: "Xicotencatl", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Burrard_Bridge_04.JPG", alt: { zh: "布勒桥", en: "The Burrard Bridge" } },
  newyork: { title: "2024-11-17-Lower Manhattan-0593", author: "Superbass", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:2024-11-17-Lower_Manhattan-0593.jpg", alt: { zh: "从布鲁克林看曼哈顿下城", en: "Lower Manhattan from Brooklyn" } },
  tokyo: { title: "Tokyo Metro and JR East at Ochanomizu, Tokyo", author: "Kabelleger / David Gubler", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Tokyo_Metro_and_JR_East_at_Ochanomizu,_Tokyo.jpg", alt: { zh: "御茶之水的地铁和 JR 电车", en: "Tokyo Metro and JR trains at Ochanomizu" } },
  beijing: { title: "Beijing forbidden city Belvedere of Embodying Benevolence-20071018-RM-142403", author: "Reinhold Möller", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Beijing_forbidden_city_Belvedere_of_Embodying_Benevolence-20071018-RM-142403.jpg", alt: { zh: "故宫的体仁阁", en: "The Belvedere of Embodying Benevolence, in the Forbidden City" } },
  shanghai: { title: "Pudong Shanghai November 2017 panorama", author: "King of Hearts", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Pudong_Shanghai_November_2017_panorama.jpg", alt: { zh: "浦东的天际线", en: "The Pudong skyline" } },
  bangkok: { title: "Bangkok skytrain sunset", author: "David Iliff", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", page: "https://commons.wikimedia.org/wiki/File:Bangkok_skytrain_sunset.jpg", alt: { zh: "日落时的轻轨和高楼", en: "The Skytrain and the skyline at sunset" } },
  sydney: { title: "Sydney Opera House and Harbour Bridge Dusk (3) 2019-06-21", author: "Benh Lieu Song", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Sydney_Opera_House_and_Harbour_Bridge_Dusk_(3)_2019-06-21.jpg", alt: { zh: "黄昏的歌剧院和海港大桥", en: "The Opera House and the Harbour Bridge at dusk" } },
  singapore: { title: "Colorful shophouses in Koon Seng Road, Singapore", author: "Basile Morin", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Colorful_shophouses_in_Koon_Seng_Road,_Singapore.jpg", alt: { zh: "如切区的彩色店屋", en: "The painted shophouses of Joo Chiat" } },
  venice: { title: "Canal Grande Chiesa della Salute e Dogana dal ponte dell Accademia", author: "Wolfgang Moroder", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/", page: "https://commons.wikimedia.org/wiki/File:Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg", alt: { zh: "大运河和安康圣母教堂", en: "The Grand Canal and Santa Maria della Salute" } },
  paris: { title: "Bir-Hakeim bridge, Paris 24 June 2021", author: "Pierre Blaché", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", page: "https://commons.wikimedia.org/wiki/File:Bir-Hakeim_bridge,_Paris_24_June_2021.jpg", alt: { zh: "黄昏的比尔哈基姆桥", en: "The Pont de Bir-Hakeim at dusk" } },
  london: { title: "City of London skyline from London City Hall - Oct 2008 - Aligned", author: "David Iliff, Colin, Kim Hansen", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:City_of_London_skyline_from_London_City_Hall_-_Oct_2008_-_Aligned.jpg", alt: { zh: "从市政厅看伦敦金融城", en: "The City of London, from City Hall" } },
  seoul: { title: "Gyeonghoeru (Royal Banquet Hall) at Gyeongbokgung Palace, Seoul", author: "Frank Schulenburg", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", page: "https://commons.wikimedia.org/wiki/File:Gyeonghoeru_(Royal_Banquet_Hall)_at_Gyeongbokgung_Palace,_Seoul.jpg", alt: { zh: "景福宫的庆会楼", en: "Gyeonghoeru, at Gyeongbokgung Palace" } },
  hongkong: { title: "Duck ling ship hong kong", author: "Arne Müseler / www.arne-mueseler.com", license: "CC BY-SA 3.0 de", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/", page: "https://commons.wikimedia.org/wiki/File:Duck_ling_ship_hong_kong.jpg", alt: { zh: "维多利亚港的鸭灵号帆船", en: "The junk Duk Ling in Victoria Harbour" } },
};

/** A city's photo, at phone size or big-screen size (null if the city has none). */
export function photoSrc(id: string, big?: boolean): string | null {
  return PHOTOS[id] ? `${BASE}/photos/${id}${big ? "" : "-s"}.webp` : null;
}

/** "Wolfgang Moroder · CC BY-SA 3.0": the short credit that goes with a photo (its licence kept on one line). */
export const creditLine = (c: Credit) => `${c.author} · ${c.license.replace(/ /g, "\u00a0")}`;

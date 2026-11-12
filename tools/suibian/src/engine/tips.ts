// What someone can still order at a place that moved down the list for them. Google has no menus,
// so these are about the kind of food, not the restaurant ("这类店一般…"), and always say to ask.
// A place moves down only when its cuisine is in COMMON_IN for the allergen (limits.ts), so each
// allergen has a line for those cuisines and a plain one for anything else.
import type { AllergenId, CuisineId, Text } from "./types";

/** For someone who doesn't eat it: what this kind of place usually has without it. */
export const AVOID_TIPS: { [A in AllergenId]?: Partial<Record<CuisineId, Text>> } = {
  chili: {
    sichuan: {
      zh: "川湘菜也有不辣的，比如番茄炒蛋、清炒时蔬、蒸菜和汤，点的时候说不要辣。",
      en: "Sichuan and Hunan places have mild dishes too, like tomato and egg, stir-fried greens, steamed dishes and soups. Ask for no chili.",
    },
    hotpot: {
      zh: "火锅可以点清汤、番茄或菌汤锅底，或者鸳鸯锅一边不辣。",
      en: "Hot pot comes with clear, tomato or mushroom broths, or a split pot with one mild side.",
    },
    thai: {
      zh: "泰国菜可以点菠萝炒饭、泰式炒河粉（pad see ew）、沙爹串，说不要辣。",
      en: "Thai places have pineapple fried rice, pad see ew and satay. Ask for no chili.",
    },
    korean: {
      zh: "韩国菜有不辣的，比如烤肉（不蘸辣酱）、原味炸鸡、杂菜、排骨汤、蒸蛋。",
      en: "Korean places have mild dishes too: barbecue without the chili paste, plain fried chicken, japchae, galbitang, steamed egg.",
    },
    indian: {
      zh: "印度菜可以点黄油鸡、korma、烤饼，说要 mild。",
      en: "Indian places have butter chicken, korma and naan. Ask for mild.",
    },
    mexican: {
      zh: "墨西哥菜的辣多在辣酱里，tacos、burrito、quesadilla 可以不加辣酱。",
      en: "Mexican heat is mostly in the salsas: tacos, burritos and quesadillas can come without hot sauce.",
    },
    sea: {
      zh: "东南亚菜可以点海南鸡饭、沙爹串，炒粿条说不要辣，椰浆饭的辣酱可以分开放。",
      en: "Southeast Asian places have Hainanese chicken rice and satay. Ask for char kway teow without chili and the sambal on the side.",
    },
  },
  shellfish: {
    seafood: { zh: "海鲜店一般也有鱼、牛排或者鸡。", en: "Seafood places usually have fish, steak or chicken too." },
    cantonese: {
      zh: "粤菜虾蟹和蚝油用得多，可以点叉烧、烧鹅、白切鸡、蒸排骨，青菜说不要蚝油。",
      en: "Cantonese food uses a lot of shrimp, crab and oyster sauce. Try BBQ pork, roast goose, white-cut chicken or steamed spare ribs, and greens without oyster sauce.",
    },
    japanese: {
      zh: "日料可以点三文鱼、金枪鱼、照烧鸡、炸猪排，乌冬问一下汤底。",
      en: "Japanese places have salmon, tuna, teriyaki chicken and tonkatsu. For udon, ask about the broth.",
    },
    thai: {
      zh: "泰国菜常用虾酱，可以点鸡肉、牛肉的菜，说不要虾酱。",
      en: "Thai cooking often uses shrimp paste. Go for chicken or beef dishes and ask for no shrimp paste.",
    },
    vietnamese: {
      zh: "越南菜可以点牛肉河粉、烤猪肉米粉、鸡肉法包，春卷问一下有没有虾。",
      en: "Vietnamese places have beef pho, grilled pork vermicelli and chicken banh mi. Ask whether the rolls have shrimp.",
    },
    sea: {
      zh: "东南亚菜虾酱（belacan）很常见，可以点海南鸡饭、沙爹串，问一下酱里有没有虾。",
      en: "Southeast Asian sauces often use shrimp paste (belacan). Try chicken rice or satay and ask about the sauce.",
    },
    korean: {
      zh: "韩国泡菜一般用虾酱腌，可以点烤肉、排骨汤，拌饭说不要泡菜。",
      en: "Korean kimchi is usually made with salted shrimp. Try barbecue or galbitang, and bibimbap without kimchi.",
    },
    hotpot: {
      zh: "火锅可以点清汤或番茄锅底，涮肉和蔬菜，海鲜别下同一锅。",
      en: "At hot pot, have a clear or tomato broth with meat and vegetables, and keep seafood out of your pot.",
    },
  },
  fish: {
    seafood: { zh: "海鲜店一般也有鸡肉、牛排、沙拉。", en: "Seafood places usually have chicken, steak or salads too." },
    japanese: {
      zh: "日料可以点照烧鸡、炸猪排、牛肉饭、蔬菜天妇罗，汤和酱常用鲣鱼，问一下。",
      en: "Japanese places have teriyaki chicken, tonkatsu, beef bowls and vegetable tempura. Broths and sauces often use bonito, so ask.",
    },
    thai: { zh: "泰国菜鱼露用得多，点的时候说不要鱼露。", en: "Thai cooking uses a lot of fish sauce. Ask for dishes without it." },
    vietnamese: {
      zh: "越南菜的蘸汁多是鱼露，可以换酱油。牛肉河粉、烤肉米粉都有，问一下汤里有没有鱼露。",
      en: "Vietnamese dipping sauce is fish sauce; ask for soy instead. Beef pho and grilled pork vermicelli are on most menus; ask whether the broth has fish sauce.",
    },
    sea: {
      zh: "东南亚菜常用鱼露和虾酱，可以点海南鸡饭、沙爹串。",
      en: "Southeast Asian food often uses fish sauce and shrimp paste. Try chicken rice or satay.",
    },
    korean: {
      zh: "韩国菜可以点烤肉、炸鸡、拌饭，泡菜和汤底可能有鱼露。",
      en: "Korean places have barbecue, fried chicken and bibimbap. Kimchi and broths may contain fish sauce.",
    },
    ramen: {
      zh: "拉面汤底常用鲣鱼和小鱼干，可以问有没有只用猪骨或鸡的汤。",
      en: "Ramen broths often use bonito or dried sardines. Ask for a pork-bone or chicken-only broth.",
    },
    hotpot: { zh: "火锅选清汤、番茄或菌汤锅底，不点鱼丸鱼片。", en: "At hot pot, pick a clear, tomato or mushroom broth and skip the fish balls." },
  },
  peanut: {
    thai: {
      zh: "泰国菜常放花生（炒河粉、沙爹酱、沙拉），可以点红咖喱、绿咖喱、炒饭，说不要花生。",
      en: "Thai food often has peanuts (pad thai, satay sauce, salads). Try red or green curry or fried rice, and ask for no peanuts.",
    },
    sea: {
      zh: "东南亚菜花生多（沙爹酱、椰浆饭），可以点海南鸡饭、炒粿条，说不要花生。",
      en: "Southeast Asian food uses peanuts a lot (satay sauce, nasi lemak). Try chicken rice or char kway teow, without peanuts.",
    },
    vietnamese: { zh: "越南菜常撒花生碎，点米粉、沙拉时说不要花生。", en: "Vietnamese dishes are often topped with crushed peanuts. Ask for none on vermicelli or salads." },
    sichuan: {
      zh: "宫保鸡丁、担担面和凉菜常有花生，麻婆豆腐、回锅肉、鱼香肉丝一般没有，点之前问一下。",
      en: "Kung pao chicken, dan dan noodles and cold dishes often have peanuts; mapo tofu, twice-cooked pork and fish-fragrant pork usually don't. Check when ordering.",
    },
    hotpot: { zh: "火锅的花生多在蘸料台（花生酱、花生碎），自己调蘸料就好。", en: "At hot pot the peanuts are mostly at the sauce bar (peanut sauce, crushed peanuts): mix your own dip." },
    hk_cafe: {
      zh: "茶餐厅的花生酱多士、沙爹牛肉面有花生，可以点叉烧饭、焗饭、奶茶。",
      en: "At HK cafés the peanut-butter toast and satay noodles have peanuts. Try BBQ pork rice, baked rice or milk tea.",
    },
    taiwanese: {
      zh: "台湾菜的刈包和甜品常撒花生粉，可以点卤肉饭、牛肉面、盐酥鸡。",
      en: "Taiwanese gua bao and desserts often have peanut powder. Try braised pork rice, beef noodle soup or popcorn chicken.",
    },
  },
  treenut: {
    indian: {
      zh: "印度菜的 korma、部分咖喱和甜品用腰果、杏仁，可以点 tandoori 烤肉、dal、烤饼，问一下酱汁。",
      en: "Indian korma, some curries and sweets use cashews or almonds. Try tandoori, dal or naan, and ask about the sauce.",
    },
    middle_eastern: {
      zh: "中东菜的甜品和部分米饭有开心果、松子，可以点烤肉串、鹰嘴豆泥、沙拉。",
      en: "Middle Eastern sweets and some rice dishes have pistachios or pine nuts. Try kebabs, hummus or salads.",
    },
    vegetarian: { zh: "素食店的素奶酪和奶油常用腰果做，问一下哪些菜不放坚果。", en: "Vegan cheese and cream are often made from cashews. Ask which dishes are nut-free." },
    brunch: {
      zh: "早午餐的烘焙常用杏仁粉，格兰诺拉有坚果，可以点蛋类、班尼迪克蛋、三明治。",
      en: "Brunch baking often uses almond flour and granola has nuts. Try eggs, eggs Benedict or a sandwich.",
    },
  },
  sesame: {
    korean: { zh: "韩国菜芝麻和芝麻油用得多（拌饭、小菜），可以点烤肉、汤，说不要芝麻。", en: "Korean food uses lots of sesame seeds and oil (bibimbap, side dishes). Try barbecue or soups and ask for no sesame." },
    middle_eastern: { zh: "鹰嘴豆泥和 tahini 酱是芝麻做的，可以点烤肉串、沙拉，不要 tahini。", en: "Hummus and tahini sauce are made from sesame. Have kebabs or salads without tahini." },
    western: { zh: "汉堡面包上常有芝麻，可以换不带芝麻的面包，或者不要面包。", en: "Burger buns often have sesame seeds. Ask for a plain bun, or no bun." },
    ramen: { zh: "拉面常放芝麻和芝麻油（担担面更多），点的时候说不要。", en: "Ramen often comes with sesame seeds or oil (tantanmen especially). Ask for none." },
  },
  soy: {
    vegetarian: { zh: "素食店的豆腐和素肉多是大豆做的，问一下有没有别的。", en: "Vegetarian places make tofu and mock meat from soy. Ask what else there is." },
  },
  egg: {
    brunch: { zh: "早午餐蛋多，可以点燕麦、沙拉，三明治说不要蛋。", en: "Brunch is mostly eggs. Try oatmeal or a salad, or a sandwich without egg." },
  },
  dairy: {
    brunch: { zh: "早午餐黄油和奶酪多，可以点沙拉、黑咖啡，煎蛋问一下用不用黄油。", en: "Brunch uses lots of butter and cheese. Try a salad or black coffee, and ask whether the eggs are cooked in butter." },
    italian: {
      zh: "意大利菜奶酪奶油多，可以点番茄酱意面（不加芝士）、蒜香橄榄油意面、沙拉。",
      en: "Italian food has lots of cheese and cream. Try tomato-sauce pasta without parmesan, aglio e olio, or a salad.",
    },
    indian: {
      zh: "印度菜常用酥油（ghee）、奶油和 paneer，可以点 tandoori 烤肉、米饭，dal 问一下用不用酥油。",
      en: "Indian cooking uses ghee, cream and paneer. Try tandoori and rice, and ask whether the dal has ghee.",
    },
  },
  gluten: {
    ramen: { zh: "拉面的面是小麦做的，酱油也含小麦，可以问有没有米饭类或者无麸质的面。", en: "Ramen noodles are wheat, and so is most soy sauce. Ask for a rice bowl or gluten-free noodles." },
    italian: {
      zh: "意面和披萨都是小麦做的，可以问有没有无麸质意面或饼底，或者点烤肉、沙拉、意式烩饭。",
      en: "Pasta and pizza are wheat. Ask for gluten-free pasta or crust, or have grilled meat, salad or risotto.",
    },
  },
};

/** When there's nothing for the cuisine in particular. */
export const AVOID_GENERIC: Record<AllergenId, Text> = {
  chili: { zh: "点的时候说不要辣。", en: "Ask for no chili." },
  shellfish: { zh: "点的时候问一下有没有虾、蟹、贝。", en: "Ask about shrimp, crab and shellfish when ordering." },
  fish: { zh: "问一下汤和酱里有没有鱼。", en: "Ask whether the broths and sauces have fish in them." },
  peanut: { zh: "问一下有没有花生或花生油。", en: "Ask about peanuts and peanut oil." },
  treenut: { zh: "问一下有没有坚果。", en: "Ask about nuts." },
  sesame: { zh: "很多菜放芝麻或芝麻油，点的时候说一声。", en: "Many dishes use sesame seeds or oil: mention it when ordering." },
  soy: {
    zh: "酱油、豆腐、豆浆都是大豆做的，这类菜用得多，点的时候说一声，或者点烤的、蒸的。",
    en: "Soy sauce, tofu and soy milk are all soy, and this kind of food uses them a lot: mention it, or go for grilled or steamed dishes.",
  },
  egg: { zh: "问一下有没有放鸡蛋（面糊、炒饭、甜品里常有）。", en: "Ask about egg (it's common in batters, fried rice and desserts)." },
  dairy: { zh: "问一下有没有黄油、奶油、芝士。", en: "Ask about butter, cream and cheese." },
  gluten: { zh: "面、饺子、面包、炸物的外皮和酱油里都有小麦，点的时候说一声。", en: "Noodles, dumplings, bread, batter and soy sauce all have wheat: mention it when ordering." },
};

export const avoidTip = (a: AllergenId, c: CuisineId): Text => AVOID_TIPS[a]?.[c] ?? AVOID_GENERIC[a];

r"""The sound board's list (打碟 · DJ Booth, Steve on Nov 13): which of Steve's sound files is which sound.

Each row: the sound's id (its file's name on the site, public/media/sfx/<id>.mp3), its kind (SfxCat in
src/shared/dj/sfx.ts), its name in Chinese and English, and its file in Steve's folder
(C:\Claude Playground\OUTPUTS\音效: the files at the top, meme/ under it; extra/ holds the three he
sent in the chat on Nov 13, gay.mp3, rizz-sound-effect.mp3 and very-loud-fahhh.mp3).

Order matters: the room knows a sound by its place in this list, so new ones go at the end and none
is taken out of the middle (a phone and a big screen a deploy apart would name each other's sounds
wrong). Names marked (guessed) in the brief were heard, not given: Steve can rename them here.

Made into the site's files by sfx_make.py.
"""
U = ""
M = "meme/"
X = "extra/"
CATALOG = [
    # DJ 音效
    ("dj-airhorn", "dj", "气笛", "Air horn", U + "u_mxm4k9znz5-djdrops247_airhorn_reverb-478951.mp3"),
    ("dj-scratch", "dj", "搓碟", "Scratch", U + "vjgalaxy-dj-scratch-02-564813.mp3"),
    ("dj-boom", "dj", "重低音 咚", "Boom", U + "0a819d0cf7663f01acf45f58e6e59bbb.mp3"),
    ("dj-riser", "dj", "往上冲", "Riser", U + "DJ SFX 04.mp3"),
    ("dj-sweep", "dj", "扫频", "Sweep", U + "DJ SFX 05.mp3"),
    ("dj-roll", "dj", "鼓点加速", "Drum roll", U + "DJ SFX 03.mp3"),
    ("dj-stutter", "dj", "卡顿", "Stutter", U + "DJ SFX 08.mp3"),
    ("dj-hits", "dj", "节奏连击", "Hits", U + "DJ SFX 11.mp3"),
    ("dj-chop", "dj", "人声切片", "Vocal chop", U + "DJ SFX 13.mp3"),
    ("dj-laser", "dj", "激光", "Lasers", U + "DJ SFX 18.mp3"),
    ("dj-down", "dj", "掉下去", "Power down", U + "DJ SFX 21.mp3"),
    ("dj-fill", "dj", "过门鼓", "Drum fill", U + "DJ SFX 26.mp3"),
    # DJ 喊麦
    ("mc-letsgo", "mc", "Let's go", "Let's go", U + "DJ SFX 19 - voice - lets go.mp3"),
    ("mc-fire", "mc", "Give them that fire", "Give them that fire", U + "DJ SFX 09 - voice - give them that fire.mp3"),
    ("mc-dj", "mc", "It's good to be a DJ", "It's good to be a DJ", U + "DJ SFX 14 - voice - internationally connected.mp3"),
    ("mc-feel", "mc", "Listen, feel, meditate", "Listen, feel, meditate", U + "DJ SFX 16 - voice - listen feel meditate.mp3"),
    ("mc-hey", "mc", "Hey hey hey", "Hey hey hey", U + "DJ SFX 10.mp3"),
    # 高潮
    ("hype-countdown", "hype", "The Final Countdown", "The Final Countdown", M + "9e6a649d724f1222cf8bf1801851e2f1.mp3"),
    ("hype-legends", "hype", "Legends Never Die", "Legends Never Die", M + "f33869102ca38fac2a8107f3b4087b9e.mp3"),
    ("hype-firstblood", "hype", "First Blood", "First Blood", M + "006676360ed03e4cf543544c753303cb.mp3"),
    ("hype-bomb", "hype", "炸弹已安放", "Bomb has been planted", M + "9d5e5a58818f3db071a8a2c9dd435c06.mp3"),
    ("hype-explosion", "hype", "爆炸", "Explosion", M + "capcut-explosion-sound.mp3"),
    ("hype-bell", "hype", "出场钟声", "Entrance bell", U + "undertakers-bell_2UwFCIe.mp3"),
    ("hype-king", "hype", "关中王来了", "Here comes the king", M + "4d21a6817d75d0e3573416b152c1aca1.mp3"),
    ("hype-edit", "hype", "燃曲", "Hype edit", M + "verity-edit.mp3"),
    ("hype-gong", "hype", "敲锣", "Gong", M + "shinese-gong.mp3"),
    # 搞笑
    ("fun-carhorn", "funny", "傻喇叭", "Goofy horn", U + "ennismore0-goofy-ahh-car-horn-200870.mp3"),
    ("fun-fart", "funny", "放屁", "Fart", M + "dry-fart.mp3"),
    ("fun-chicken", "funny", "尖叫鸡", "Screaming chicken", M + "chicken-on-tree-screaming.mp3"),
    ("fun-slap", "funny", "一巴掌", "Slap", M + "slap-soundmaster13-49669815_4L20wGP.mp3"),
    ("fun-later", "funny", "片刻之后", "A few moments later", M + "a-few-moments-later-sponge-bob-sfx-fun.mp3"),
    ("fun-rizz", "funny", "Rizz", "Rizz", X + "rizz-sound-effect.mp3"),
    ("fun-makka", "funny", "晚安玛卡巴卡", "Makka Pakka, good night", M + "51c3dd5a3c3f2bd06ccb2fe426d8d3a3.mp3"),
    ("fun-bluetooth", "funny", "蓝牙已连接", "Bluetooth connected", M + "the-bluetooth-device-its-connected-succesfull.mp3"),
    ("fun-ringtone", "funny", "魔性铃声", "Chinese ringtone", M + "chinese-ringtone_ekpdPc7.mp3"),
    ("fun-indian", "funny", "印度神曲", "Indian song", M + "indian-song.mp3"),
    ("fun-spiderman", "funny", "蜘蛛侠之歌", "Spider-Man song", M + "spiderman-meme-song.mp3"),
    ("fun-laugh", "funny", "笑", "Laugh", M + "0612d8cd665c58b3175c39d3c8f1d045.mp3"),
    ("fun-giggle", "funny", "憋不住笑", "Can't stop laughing", M + "ny-video-online-audio-converter.mp3"),
    ("fun-roar", "funny", "哄堂大笑", "Everyone laughs", M + "5b18558d1ae555ec903dc09d107c3096.mp3"),
    ("fun-pop", "funny", "啵", "Pop", M + "a921dc65ef664c57bb75efd6f71f6765.mp3"),
    ("fun-go", "funny", "快走", "Go!", M + "b3b173ae77dc440b08ec347cd5e30662.mp3"),
    # 震惊
    ("shock-gasp", "shock", "震惊", "Shocked", M + "shocked-sound-effect.mp3"),
    ("shock-amongus", "shock", "Among Us 揭晓", "Among Us reveal", M + "among-us-role-reveal-sound.mp3"),
    ("shock-alert", "shock", "被发现了！", "Alert!", M + "metal-gear-alert-sound-effect_XKoHReZ.mp3"),
    ("shock-huh", "shock", "疑惑猫", "Huh cat", M + "huh-cat-meme.mp3"),
    ("shock-wow", "shock", "动漫 哇哦", "Anime wow", M + "anime-wow-sound-effect.mp3"),
    ("shock-ahh", "shock", "动漫 啊", "Anime ahh", M + "anime-ahh.mp3"),
    ("shock-fahhh", "shock", "FAHHH", "FAHHH", X + "very-loud-fahhh.mp3"),
    ("shock-steps", "shock", "有脚步声！", "Footsteps here!", M + "有人有jio步声我这里.mp3"),
    ("shock-yell", "shock", "大喊", "Yell", M + "07317b6b33ea6b821f8a1a38ec63e82c.mp3"),
    # 失败
    ("fail-spongebob", "fail", "海绵宝宝失败", "SpongeBob fail", M + "spongebob-fail.mp3"),
    ("fail-hard", "fail", "我太难了", "Life is hard", M + "m_fixed_Odh9niM.mp3"),
    ("fail-help", "fail", "救我救我救我", "Help me!", M + "救我救我救我.mp3"),
    ("fail-medkit", "fail", "有没有急救包", "Anyone got a medkit?", M + "有没有急救包给我一个兄弟.mp3"),
    ("fail-damage", "fail", "Emotional damage", "Emotional damage", M + "ef1ee76049adde87260ef8d59b52acc1.mp3"),
    ("fail-mistake", "fail", "That was a mistake", "That was a mistake", M + "a0cce9bbc29f19d10f6fa902595b07ad.mp3"),
    ("fail-cricket", "fail", "冷场（蟋蟀）", "Crickets", M + "awkward-cricket-sound-effect.mp3"),
    # 嘲讽
    ("taunt-thatsit", "taunt", "就这点本事？", "That's all you've got?", M + "3这点本事？.mp3"),
    ("taunt-likeme", "taunt", "你肯定很喜欢我", "You must like me", M + "1你肯定喜欢我.mp3"),
    ("taunt-crazy", "taunt", "Are you out of your mind?", "Are you out of your mind?", M + "are-you-out-of-your-mind-greenscreen-change-quality-and-end-wont-cut-off_2.mp3"),
    ("taunt-gay", "taunt", "Gay", "Gay", X + "gay.mp3"),
    ("taunt-bruh", "taunt", "Bruh", "Bruh", M + "movie_1.mp3"),
    ("taunt-huh", "taunt", "Huh?", "Huh?", M + "02fec283668e3e2d4d72da3aa3869ddd.mp3"),
    ("taunt-nice", "taunt", "Nice", "Nice", M + "c623843d6b5146b79699dbd0ddf5d911.mp3"),
    ("taunt-sick", "taunt", "你有病", "You're sick", M + "72aed74d0b6f9d78df539470159628ed.mp3"),
    ("taunt-fisherman", "taunt", "这个人特别渔夫", "So fisherman", M + "感觉这个人特别渔夫.mp3"),
    ("taunt-longge", "taunt", "叫我龙哥就行了", "Just call me Brother Long", M + "你就不要叫我老师叫我龙哥就行了.mp3"),
    ("taunt-cards", "taunt", "我要验牌", "Let me check the cards", M + "c8a897ea134ef5a0ad3667b31b9833ae.mp3"),
    ("taunt-english", "taunt", "一句英文梗", "An English line", M + "52679918d0336a2b90c7dc0eedfe9074.mp3"),
    ("taunt-cantonese", "taunt", "一句粤语梗", "A Cantonese line", M + "827483f24c7e93780250a5b95be783d3.mp3"),
    # 神曲
    ("song-tebie", "songs", "特别的爱给特别的你", "Special love for special you", M + "33ba1d4551b916ae1d236a693a0585fc.mp3"),
    ("song-gongxi", "songs", "恭喜发财", "Gong xi fa cai", M + "6f2ece1ee82e47ac8ed55e72f9a059cd.mp3"),
    ("song-xuehua", "songs", "雪花飘飘", "Snowflakes drifting", M + "xue-hua-piao-piao_FOynuVG.mp3"),
    ("song-nanwu", "songs", "南无观世音菩萨", "Namo Guanyin", M + "b19e66863ae37ecc8868745a2e692b78.mp3"),
    ("song-shesobad", "songs", "抖音神曲", "TikTok song", U + "44887c018cb71aaca38ce7baf0c4324f.mp3"),
    ("song-earworm", "songs", "魔性 BGM", "Earworm", M + "7d5bc9a59928805ce0d7e15b4a231be3.mp3"),
    ("song-foreign", "songs", "外语神曲", "Foreign earworm", M + "3e1d6beaa969ebcb365471dd99688d94.mp3"),
    ("song-tune", "songs", "魔性小调", "Silly tune", M + "25a9bd7ffd4c205e5e916787d72dad11.mp3"),
    ("song-didi", "songs", "滴滴滴", "Di di di", M + "0e8ef2e69a3d18c96a8518555be5026a.mp3"),
    # 粗口 · 慎点
    ("rude-bbq", "rude", "芭比Q了", "It's barbecued", M + "8b19e9db36a61af9fea8b46e3777a892.mp3"),
    ("rude-brother", "rude", "我日你的妈呀，兄弟", "Holy hell, brother", M + "我日你的妈呀，兄弟.mp3"),
    ("rude-maihua", "rude", "我打你妈卖花儿", "Cantonese curse", M + "我打你妈卖花儿.mp3"),
    ("rude-likeme", "rude", "Can't be like me", "Can't be like me", U + "DJ SFX 30 - voice - cant be like me (explicit).mp3"),
    ("rude-wtf", "rude", "What the f***", "What the f***", M + "d1a6a7e3df1f04cdccb99281dc3e7f61.mp3"),
    ("rude-omg", "rude", "Oh my god bro", "Oh my god bro", M + "oh-my-god-bro-oh-hell-nah-man.mp3"),
    ("rude-hub", "rude", "那个片头", "That intro", M + "hub-intro-sound.mp3"),
]

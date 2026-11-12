# 跨區整理檢查（T13，scripts/cross-area-check.mjs）

產生：2026-11-12。資料點：景點 134、住宿 190、餐廳 398。

## 1. 重複候選（1）

住宿和它的 `-dining` 不算。

| A | B | 依據 | 跨區 |
|---|---|---|---|
| ise-akafuku-honten | ise-akafuku-bettenpo | 近 24 m |  |

## 2. ID（2）

| ID | 問題 |
|---|---|
| shima-hanaya-dining | -dining 但沒有 extra.lodgingId，也對不到住宿（住宿沒收錄的館內餐廳） |
| shima-amanemu-dining | -dining 但沒有 extra.lodgingId，也對不到住宿（住宿沒收錄的館內餐廳） |

## 3. 標籤

不在固定清單：沒有。

可以從結構化欄位補、還沒補（判斷細則「tags 從結構化欄位補」）：沒有。

## 4. 分級分布

A 以上的比例超過約 25% 要看門檻（§5.1「數字門檻依區調整」；10 筆以下只當參考）。

| 區域 | 類型 | 筆數 | S | A | B | 沒評分 | A 以上 |
|---|---|---|---|---|---|---|---|
| shima | spot | 24 | 1 | 4 | 19 | 0 | 21% |
| shima | lodging | 56 | 6 | 4 | 46 | 0 | 18% |
| shima | restaurant | 78 | 0 | 11 | 67 | 0 | 14% |
| toba | spot | 33 | 3 | 6 | 19 | 5 | 32% ⚠️ |
| toba | lodging | 38 | 5 | 4 | 29 | 0 | 24% |
| toba | restaurant | 83 | 2 | 15 | 66 | 0 | 20% |
| futami | spot | 5 | 1 | 1 | 3 | 0 | 40% |
| futami | lodging | 17 | 2 | 1 | 14 | 0 | 18% |
| futami | restaurant | 18 | 0 | 3 | 15 | 0 | 17% |
| ise | spot | 20 | 2 | 2 | 16 | 0 | 20% |
| ise | lodging | 24 | 3 | 1 | 20 | 0 | 17% |
| ise | restaurant | 108 | 2 | 19 | 87 | 0 | 19% |
| kix | lodging | 10 | 0 | 3 | 7 | 0 | 30% |
| kix | restaurant | 5 | 0 | 0 | 5 | 0 | 0% |
| osaka | spot | 14 | 2 | 2 | 10 | 0 | 29% ⚠️ |
| osaka | lodging | 23 | 1 | 6 | 16 | 0 | 30% ⚠️ |
| osaka | restaurant | 41 | 3 | 7 | 31 | 0 | 24% |
| kyoto | spot | 24 | 3 | 3 | 18 | 0 | 25% |
| kyoto | lodging | 17 | 1 | 3 | 13 | 0 | 24% |
| kyoto | restaurant | 49 | 2 | 9 | 38 | 0 | 22% |
| biwako | spot | 14 | 0 | 4 | 10 | 0 | 29% ⚠️ |
| biwako | lodging | 5 | 2 | 1 | 2 | 0 | 60% |
| biwako | restaurant | 16 | 0 | 3 | 13 | 0 | 19% |

## 5. 車站

餐廳是 anchors 有這個車站的（步行圈內）；午餐、晚餐是旅程中有一天在 11:30～13:30、18:00～19:00 營業。0 家的用粗體。

| 車站 | 區域 | 餐廳 | 午餐 | 晚餐 | fit15 yes | 景點 | 住宿 |
|---|---|---|---|---|---|---|---|
| iseshi 伊勢市 | ise | 13 | 6 | 10 | 5 | 6 | 15 |
| ujiyamada 宇治山田 | ise | 6 | 6 | 3 | 2 | 1 | 2 |
| isuzugawa 五十鈴川 | ise | 47 | 31 | 6 | 14 | 10 | 4 |
| asama 朝熊 | ise | **0** | **0** | **0** | 0 | 0 | 0 |
| ikenoura 池の浦 | toba | **0** | **0** | **0** | 0 | 0 | 1 |
| toba 鳥羽 | toba | 11 | 8 | 5 | 4 | 32 | 37 |
| nakanogo 中之郷 | toba | 2 | 2 | 2 | 1 | 1 | 1 |
| shima-akasaki 志摩赤崎 | toba | 6 | 6 | 5 | 3 | 0 | 0 |
| funatsu 船津 | toba | **0** | **0** | **0** | 0 | 0 | 0 |
| kamo 加茂 | toba | 1 | 1 | **0** | 1 | 0 | 0 |
| matsuo 松尾 | toba | **0** | **0** | **0** | 0 | 0 | 1 |
| shiraki 白木 | toba | **0** | **0** | **0** | 0 | 0 | 0 |
| gochi 五知 | shima | **0** | **0** | **0** | 0 | 0 | 0 |
| kutsukake 沓掛 | shima | **0** | **0** | **0** | 0 | 0 | 0 |
| kaminogo 上之郷 | shima | 1 | 1 | **0** | 0 | 1 | 0 |
| shima-isobe 志摩磯部 | shima | 1 | 1 | 1 | 1 | 1 | 2 |
| anagawa 穴川 | shima | **0** | **0** | **0** | 0 | 0 | 0 |
| shima-yokoyama 志摩横山 | shima | 4 | 4 | 3 | 3 | 0 | 1 |
| ugata 鵜方 | shima | 18 | 16 | 16 | 9 | 16 | 31 |
| shima-shimmei 志摩神明 | shima | 3 | 2 | 2 | 1 | 1 | 2 |
| kashikojima 賢島 | shima | 12 | 9 | 6 | 6 | 5 | 20 |
| jr-iseshi 伊勢市 | ise | 20 | 10 | 12 | 6 | 0 | 0 |
| jr-isuzugaoka 五十鈴ケ丘 | ise | 5 | 4 | 4 | 2 | 2 | 1 |
| jr-futaminoura 二見浦 | futami | 14 | 8 | 6 | 3 | 4 | 15 |
| jr-matsushita 松下 | futami | 3 | 2 | **0** | 0 | 1 | 0 |
| jr-toba 鳥羽 | toba | 21 | 17 | 13 | 5 | 0 | 0 |
| obata 小俣 | ise | 1 | 1 | 1 | 1 | 1 | 0 |
| miyamachi 宮町 | ise | 10 | 7 | 10 | 6 | 0 | 2 |
| kansai-airport 関西空港 | kix | 1 | 1 | 1 | 1 | 0 | 1 |
| rinku-town りんくうタウン | kix | 1 | 1 | 1 | 0 | 0 | 5 |
| izumisano 泉佐野 | kix | 3 | 2 | 3 | 2 | 0 | 3 |
| hagurazaki 羽倉崎 | kix | **0** | **0** | **0** | 0 | 0 | 1 |
| osaka-namba 大阪難波 | osaka | 2 | 2 | 2 | 2 | 0 | 2 |
| osaka-uehommachi 大阪上本町 | osaka | **0** | **0** | **0** | 0 | 0 | 2 |
| tsuruhashi 鶴橋 | osaka | **0** | **0** | **0** | 0 | 0 | 0 |
| nankai-namba なんば | osaka | 1 | 1 | **0** | 0 | 0 | 2 |
| nankai-shin-imamiya 新今宮 | osaka | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-osaka 大阪 | osaka | 3 | 2 | 2 | 2 | 0 | 2 |
| jr-nishikujo 西九条 | osaka | **0** | **0** | **0** | 0 | 0 | 1 |
| jr-universal-city ユニバーサルシティ | osaka | 1 | 1 | 1 | 1 | 1 | 5 |
| jr-shin-imamiya 新今宮 | osaka | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-tennoji 天王寺 | osaka | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-tsuruhashi 鶴橋 | osaka | 2 | 2 | 2 | 2 | 0 | 0 |
| jr-morinomiya 森ノ宮 | osaka | 1 | 1 | 1 | 1 | 0 | 0 |
| jr-osakajokoen 大阪城公園 | osaka | **0** | **0** | **0** | 0 | 1 | 0 |
| metro-umeda 梅田 | osaka | 2 | 2 | 2 | 0 | 1 | 1 |
| metro-higashi-umeda 東梅田 | osaka | 2 | 1 | 2 | 0 | 0 | 1 |
| metro-hommachi 本町 | osaka | **0** | **0** | **0** | 0 | 0 | 0 |
| metro-shinsaibashi 心斎橋 | osaka | 2 | 1 | 2 | 2 | 0 | 1 |
| metro-namba なんば | osaka | 6 | 4 | 4 | 4 | 1 | 2 |
| metro-dobutsuen-mae 動物園前 | osaka | 3 | 3 | 3 | 0 | 1 | 0 |
| metro-tennoji 天王寺 | osaka | 4 | 3 | 3 | 2 | 1 | 0 |
| metro-sakaisuji-hommachi 堺筋本町 | osaka | **0** | **0** | **0** | 0 | 0 | 0 |
| metro-tanimachi-4chome 谷町四丁目 | osaka | 2 | 1 | 1 | 0 | 1 | 0 |
| metro-morinomiya 森ノ宮 | osaka | **0** | **0** | **0** | 0 | 0 | 0 |
| metro-osakako 大阪港 | osaka | 4 | 4 | 2 | 2 | 3 | 0 |
| metro-nagahoribashi 長堀橋 | osaka | **0** | **0** | **0** | 0 | 0 | 1 |
| metro-osaka-business-park 大阪ビジネスパーク | osaka | 4 | 4 | 4 | 2 | 0 | 0 |
| metro-tenjimbashisuji-6chome 天神橋筋六丁目 | osaka | **0** | **0** | **0** | 0 | 1 | 0 |
| metro-nippombashi 日本橋 | osaka | 2 | 2 | 2 | 1 | 1 | 3 |
| metro-ebisucho 恵美須町 | osaka | **0** | **0** | **0** | 0 | 1 | 0 |
| metro-tanimachi-9chome 谷町九丁目 | osaka | **0** | **0** | **0** | 0 | 0 | 0 |
| metro-shitennojimae-yuhigaoka 四天王寺前夕陽ヶ丘 | osaka | **0** | **0** | **0** | 0 | 1 | 0 |
| kyoto 京都 | kyoto | 2 | 2 | 1 | 0 | 0 | 2 |
| toji 東寺 | kyoto | **0** | **0** | **0** | 0 | 1 | 0 |
| takeda 竹田 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| kintetsu-tambabashi 近鉄丹波橋 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| momoyamagoryo-mae 桃山御陵前 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| ogura 小倉 | kyoto | **0** | **0** | **0** | 0 | 1 | 0 |
| yamato-saidaiji 大和西大寺 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| yamato-yagi 大和八木 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-kyoto 京都 | kyoto | 2 | 1 | 2 | 2 | 1 | 3 |
| jr-umekoji-kyotonishi 梅小路京都西 | kyoto | **0** | **0** | **0** | 0 | 2 | 0 |
| jr-nijo 二条 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-saga-arashiyama 嵯峨嵐山 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-tofukuji 東福寺 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-inari 稲荷 | kyoto | 1 | 1 | **0** | 0 | 1 | 0 |
| jr-uji 宇治 | kyoto | 2 | 2 | **0** | 0 | 0 | 0 |
| jr-yamashina 山科 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| hankyu-osaka-umeda 大阪梅田 | osaka | **0** | **0** | **0** | 0 | 0 | 0 |
| hankyu-katsura 桂 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| hankyu-karasuma 烏丸 | kyoto | 3 | 3 | 3 | 1 | 0 | 2 |
| hankyu-kyoto-kawaramachi 京都河原町 | kyoto | **0** | **0** | **0** | 0 | 1 | 3 |
| hankyu-arashiyama 嵐山 | kyoto | **0** | **0** | **0** | 0 | 0 | 1 |
| keihan-yodoyabashi 淀屋橋 | osaka | **0** | **0** | **0** | 0 | 0 | 0 |
| keihan-chushojima 中書島 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| keihan-tambabashi 丹波橋 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| keihan-fushimi-inari 伏見稲荷 | kyoto | 2 | 2 | 1 | 0 | 0 | 0 |
| keihan-tofukuji 東福寺 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| keihan-shichijo 七条 | kyoto | **0** | **0** | **0** | 0 | 1 | 1 |
| keihan-kiyomizu-gojo 清水五条 | kyoto | **0** | **0** | **0** | 0 | 2 | 0 |
| keihan-gion-shijo 祇園四条 | kyoto | 6 | 5 | 5 | 1 | 1 | 0 |
| keihan-sanjo 三条 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| keihan-uji 宇治 | kyoto | 4 | 4 | 1 | 1 | 1 | 0 |
| randen-shijo-omiya 四条大宮 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| randen-tenjingawa 嵐電天神川 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| randen-uzumasa-koryuji 太秦広隆寺 | kyoto | **0** | **0** | **0** | 0 | 1 | 0 |
| randen-katabiranotsuji 帷子ノ辻 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| randen-arashiyama 嵐山 | kyoto | 6 | 5 | 3 | 2 | 3 | 1 |
| randen-kitano-hakubaicho 北野白梅町 | kyoto | 4 | 4 | 2 | 2 | 2 | 0 |
| subway-kyoto 京都 | kyoto | 4 | 4 | 4 | 1 | 0 | 1 |
| subway-shijo 四条 | kyoto | 2 | 2 | 2 | 1 | 0 | 2 |
| subway-karasuma-oike 烏丸御池 | kyoto | 2 | 1 | 1 | 0 | 0 | 1 |
| subway-imadegawa 今出川 | kyoto | 1 | 1 | **0** | 0 | 1 | 0 |
| subway-uzumasa-tenjingawa 太秦天神川 | kyoto | 1 | 1 | 1 | 0 | 0 | 0 |
| subway-nijo 二条 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| subway-nijojo-mae 二条城前 | kyoto | **0** | **0** | **0** | 0 | 1 | 0 |
| subway-kyoto-shiyakusho-mae 京都市役所前 | kyoto | 1 | 1 | 1 | 0 | 0 | 0 |
| subway-sanjo-keihan 三条京阪 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| subway-higashiyama 東山 | kyoto | 3 | 3 | 2 | 1 | 1 | 0 |
| subway-keage 蹴上 | kyoto | 1 | 1 | 1 | 1 | 3 | 0 |
| subway-misasagi 御陵 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| subway-yamashina 山科 | kyoto | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-otsu 大津 | biwako | 1 | 1 | 1 | 1 | 0 | 0 |
| jr-ishiyama 石山 | biwako | 1 | 1 | 1 | 0 | 0 | 0 |
| jr-kusatsu 草津 | biwako | **0** | **0** | **0** | 0 | 1 | 0 |
| jr-moriyama 守山 | biwako | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-omi-hachiman 近江八幡 | biwako | 2 | 2 | 2 | 1 | 2 | 0 |
| jr-hikone 彦根 | biwako | 3 | 3 | 3 | 2 | 1 | 0 |
| jr-otsukyo 大津京 | biwako | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-hieizan-sakamoto 比叡山坂本 | biwako | **0** | **0** | **0** | 0 | 0 | 0 |
| jr-ogotoonsen おごと温泉 | biwako | **0** | **0** | **0** | 0 | 0 | 5 |
| jr-katata 堅田 | biwako | 3 | 3 | 3 | 1 | 2 | 0 |
| jr-shiga 志賀 | biwako | **0** | **0** | **0** | 0 | 1 | 0 |
| jr-omi-takashima 近江高島 | biwako | **0** | **0** | **0** | 0 | 1 | 0 |
| keihan-biwako-hamaotsu びわ湖浜大津 | biwako | **0** | **0** | **0** | 0 | 1 | 0 |
| keihan-miidera 三井寺 | biwako | **0** | **0** | **0** | 0 | 1 | 0 |
| keihan-omi-jingu-mae 近江神宮前 | biwako | **0** | **0** | **0** | 0 | 1 | 0 |
| keihan-sakamoto-hieizanguchi 坂本比叡山口 | biwako | 1 | 1 | **0** | 1 | 1 | 0 |
| keihan-ishiyamadera 石山寺 | biwako | **0** | **0** | **0** | 0 | 1 | 0 |
| keihan-ishiyama 京阪石山 | biwako | 1 | 1 | 1 | 1 | 0 | 0 |
| sakamoto-cable-sakamoto ケーブル坂本 | biwako | **0** | **0** | **0** | 0 | 0 | 0 |
| sakamoto-cable-enryakuji ケーブル延暦寺 | biwako | **0** | **0** | **0** | 0 | 1 | 0 |

## 6. 子地區

| 區域 | 子地區 | needsCar | 景點 | 住宿 | 餐廳 |
|---|---|---|---|---|---|
| shima | shima-kashikojima 賢島 |  | 5 | 12 | 12 |
| shima | mazakijima 間崎島 |  | 1 | 0 | 1 |
| shima | shima-ugata 鵜方・志摩神明 |  | 1 | 9 | 24 |
| shima | shima-yokoyama 横山 | ✓ | 1 | 0 | 1 |
| shima | shima-isobe 志摩磯部・上之郷・穴川 |  | 1 | 0 | 4 |
| shima | shima-spain 志摩スペイン村（坂崎） |  | 0 | 0 | **0** |
| shima | shima-amanoiwato 天の岩戸・恵利原 | ✓ | 1 | 0 | **0** |
| shima | shima-matoya 的矢湾・渡鹿野島 | ✓ | 1 | 8 | 7 |
| shima | shima-anori 安乗 | ✓ | 1 | 3 | 4 |
| shima | shima-kokufu 国府・甲賀・志島 | ✓ | 0 | 6 | 4 |
| shima | shima-daio 大王・波切 | ✓ | 3 | 0 | 4 |
| shima | shima-tomoyama 登茂山（ともやま公園） | ✓ | 2 | 5 | 3 |
| shima | shima-goza 御座・越賀 | ✓ | 3 | 4 | 1 |
| shima | shima-wagu 和具・布施田・片田 | ✓ | 0 | 1 | 2 |
| shima | shima-hamajima 浜島 | ✓ | 2 | 5 | 6 |
| shima | shima-sakko 迫子（志摩地中海村・NEMU） | ✓ | 2 | 2 | 3 |
| shima | shima-other 志摩市その他（散在） | ✓ | 0 | 1 | 2 |
| toba | toba-station 鳥羽駅周辺 |  | 9 | 8 | 32 |
| toba | toba-outskirts 鳥羽市街外縁 | ✓ | 1 | 6 | 6 |
| toba | nakanogo 中之郷 |  | 1 | 1 | 4 |
| toba | uramura 浦村 | ✓ | 1 | 6 | 18 |
| toba | osatsu 相差 | ✓ | 4 | 7 | 10 |
| toba | kuzaki 国崎・パールロード | ✓ | 4 | 2 | 6 |
| toba | toshijima 答志島 |  | 5 | 6 | 3 |
| toba | sakatejima 坂手島 |  | 0 | 0 | **0** |
| toba | sugashima 菅島 |  | 3 | 1 | 2 |
| toba | kamishima 神島 |  | 5 | 1 | 2 |
| futami | futami-okitama 二見浦・夫婦岩 |  | 4 | 12 | 13 |
| futami | futami-outskirts 二見町外縁 | ✓ | 1 | 5 | 5 |
| ise | ise-geku 外宮・伊勢市駅周辺 |  | 6 | 17 | 45 |
| ise | ise-kurata 倉田山・五十鈴川駅周辺 |  | 5 | 1 | 7 |
| ise | ise-isuzugaoka 五十鈴ケ丘・伊勢IC周辺 | ✓ | 1 | 1 | 4 |
| ise | ise-obata 小俣・御薗 |  | 1 | 0 | 4 |
| ise | ise-naiku 内宮・おはらい町 |  | 4 | 4 | 43 |
| ise | ise-asama 朝熊山 | ✓ | 2 | 0 | 1 |
| ise | ise-outskirts 伊勢市街外縁（その他） | ✓ | 1 | 1 | 4 |
| kix | kix-island 関西空港（空港島） |  | 0 | 1 | 1 |
| kix | rinku りんくうタウン |  | 0 | 6 | 1 |
| kix | izumisano 泉佐野 |  | 0 | 3 | 3 |
| kyoto | kyoto-station 京都駅周辺 |  | 5 | 7 | 8 |
| kyoto | higashiyama 東山・清水寺・祇園 |  | 3 | 0 | 6 |
| kyoto | fushimi 伏見稲荷 |  | 1 | 0 | 3 |
| kyoto | arashiyama 嵐山・嵯峨野 |  | 3 | 2 | 6 |
| kyoto | shijo-nijo 四条河原町・二条城 |  | 3 | 8 | 8 |
| kyoto | kinkaku-kitano 金閣寺・北野 |  | 2 | 0 | 4 |
| kyoto | okazaki 銀閣寺・南禅寺・平安神宮 |  | 4 | 0 | 4 |
| kyoto | uji 宇治 |  | 2 | 0 | 6 |
| kyoto | uzumasa 太秦 |  | 1 | 0 | 4 |
| biwako | otsu 大津・坂本 |  | 6 | 0 | 4 |
| biwako | ogoto-katata 雄琴・堅田・志賀 |  | 2 | 5 | 3 |
| biwako | takashima 高島 | ✓ | 1 | 0 | 3 |
| biwako | kusatsu-omihachiman 草津・近江八幡 |  | 4 | 0 | 3 |
| biwako | hikone 彦根 |  | 1 | 0 | 3 |
| osaka | namba 難波・道頓堀 |  | 2 | 13 | 15 |
| osaka | osaka-castle 大阪城 |  | 2 | 0 | 7 |
| osaka | tennoji 天王寺・新世界 |  | 4 | 0 | 7 |
| osaka | osaka-bay 海遊館・天保山 |  | 3 | 0 | 5 |
| osaka | usj ユニバーサルシティ |  | 1 | 6 | **0** |
| osaka | umeda 梅田 |  | 2 | 4 | 7 |

## 7. 可信度

### S、A 但 confidence low（12）

| tier | ID | 名稱 | 推薦度理由 |
|---|---|---|---|
| A | shima-iwajin-kissa | イワジン喫茶室 | 食べログ 3.45（122 則）＋ Google 4.3 → 第 1 條 4；口コミ（2025～2026）多在 3.5 以上，負評只有送錯餐 1 則 |
| A | futami-ofukumochi-honke | 御福餅 本家 | 食べログ 3.49（203 則）、Google 4.2（604 則），まっぷる、4travel 都有介紹；口コミ多半是 2024 年搬遷前的舊店 |
| A | futami-asahiya-sakamoto-manju | 旭家 酒素饅頭製造本舗 | 食べログ 3.45（100 則）、Google 4.6（175 則），観光三重、るるぶ、まっぷる 都介紹 |
| A | ise-tofuan-yamanaka | 豆腐庵山中 | 食べログ 3.59（593 則）、Google 4.2（227 則），觀光三重 2 篇特輯都選入 |
| A | ise-nikawa | にかわ | 食べログ 3.93（150 則）、Google 4.5（62 則）→ 伊勢的第 1 條（3.55／150 則＋Google 4.1）；Time Out、なっぷ 說入選米其林必比登 |
| A | ise-bon-vivant | ボン・ヴィヴァン | 食べログ 3.71（155 則）、Google 4.5（147 則）→ 伊勢的第 1 條（3.55／150 則＋Google 4.1）；米其林 2019、Gault&Millau 掲載，觀光三重、まっぷる 推薦 |
| A | ise-dandelion-chocolate-geku | ダンデライオン・チョコレート 伊勢外宮店 | 食べログ 3.59（414 則）、Google 4.1（535 則）→ 伊勢的第 1 條（3.55／150 則＋Google 4.1）；觀光三重、Walkerplus、Time Out 介紹 |
| A | ise-kaki-no-tomo | 牡蠣の朋 | 食べログ 3.55（178 則）、Google 4.5（296 則）→ 伊勢的第 1 條（3.55／150 則＋Google 4.1）；介紹只有 TikTok／IG 轉載 |
| A | osaka-yatagarasu-udon | やたがらす UDON | 食べログ 3.66（655 則）、Google 4.2（296 則）→ 大阪門檻的 4 |
| A | osaka-gojoya | 五條家 | 食べログ 3.66（615 則）、Google 4.5（280 則）→ 大阪門檻的 4 |
| A | kyoto-shubaku | しゅばく | 食べログ 3.67（511 則）、Google 4.3（445 則），京都門檻的 4 |
| A | kyoto-fujitora | らぁ麺や ふぢとら | 食べログ 3.67（297 則）、Google 4.2（272 則），京都門檻的 4 |

### 2 月營業或營業狀態沒確認的景點（10）

| tier | ID | 名稱 | winterFit | 理由 |
|---|---|---|---|---|
| B | shima-espana-cruise | 賢島エスパーニャクルーズ（英虞湾遊覧） | 2 | 2/1～3/5 大船休業、改小型代替船（定員、設備不明），冬天甲板冷 |
| B | shima-kashikojima-yuransen | あご湾島めぐりクルーズ（賢島遊覧船組合） | 2 | 2 月營業沒明寫（不定期運行、天候休） |
| B | shima-kaiyuen | 賢島フィッシングパーク 海遊苑 | 2 | 觀光協會說冬天改陶板燒，但 2 月釣り堀營業沒明寫 |
| B | shima-sushi-benkei | すし べんけい 寿司握り体験 | 4 | 室內體驗；營業日、2 月營業沒有來源，但沒有冬季休業的跡象 |
| B | shima-satoumian | 海女小屋体験施設さとうみ庵（海女資料館） | 3 | 2 月營業沒明寫（觀光三重是 2022～23 年的資料），沒有冬季休業的跡象；海女小屋沒有暖氣 |
| B | shima-pearl-miki | 真珠体験 パール美樹 | 4 | 室內的珍珠體驗；2 月營業沒明寫，但沒有冬季休業的跡象 |
| B | shima-iwaho-bbq-cruise | あご湾めぐりと船上バーベキュー（いわほ観光汽船） | 2 | 2 月營業沒明寫（觀光三重只寫年中無休） |
| A | toba-bay-cruise-irukajima | 鳥羽湾めぐりとイルカ島 | 2 | 1 月中旬～2 月上旬有年度休業，旅程大半很可能停航；有開的話海上也冷 |
| A | toba-osatsu-kamado | 海女小屋 相差かまど | 4 | 室內有炭火、冬天是貝類的季節；2 月營業沒有來源確認 |
| B | futami-omotesando | 夫婦岩表参道（旅館街） | 3 | 戶外街道、全年通行，2 月店家營業不明 |

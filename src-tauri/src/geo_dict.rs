/// Translate English location name to Japanese equivalents.
/// Returns multiple tags: prefecture name + city name if applicable.
pub fn translate(en: &str) -> Vec<&'static str> {
    match en {
        // ===== 47 Prefectures =====
        "Hokkaido" => vec!["北海道"],
        "Aomori" => vec!["青森県", "青森"],
        "Iwate" => vec!["岩手県"],
        "Miyagi" => vec!["宮城県"],
        "Akita" => vec!["秋田県", "秋田"],
        "Yamagata" => vec!["山形県", "山形"],
        "Fukushima" => vec!["福島県", "福島"],
        "Ibaraki" => vec!["茨城県"],
        "Tochigi" => vec!["栃木県"],
        "Gunma" => vec!["群馬県"],
        "Saitama" => vec!["埼玉県", "さいたま"],
        "Chiba" => vec!["千葉県", "千葉"],
        "Tokyo" => vec!["東京都", "東京"],
        "Kanagawa" => vec!["神奈川県"],
        "Niigata" => vec!["新潟県", "新潟"],
        "Toyama" => vec!["富山県", "富山"],
        "Ishikawa" => vec!["石川県"],
        "Fukui" => vec!["福井県", "福井"],
        "Yamanashi" => vec!["山梨県"],
        "Nagano" => vec!["長野県", "長野"],
        "Gifu" => vec!["岐阜県", "岐阜"],
        "Shizuoka" => vec!["静岡県", "静岡"],
        "Aichi" => vec!["愛知県"],
        "Mie" => vec!["三重県"],
        "Shiga" => vec!["滋賀県"],
        "Kyoto" => vec!["京都府", "京都"],
        "Osaka" => vec!["大阪府", "大阪"],
        "Hyogo" => vec!["兵庫県"],
        "Nara" => vec!["奈良県", "奈良"],
        "Wakayama" => vec!["和歌山県", "和歌山"],
        "Tottori" => vec!["鳥取県", "鳥取"],
        "Shimane" => vec!["島根県"],
        "Okayama" => vec!["岡山県", "岡山"],
        "Hiroshima" => vec!["広島県", "広島"],
        "Yamaguchi" => vec!["山口県", "山口"],
        "Tokushima" => vec!["徳島県", "徳島"],
        "Kagawa" => vec!["香川県"],
        "Ehime" => vec!["愛媛県"],
        "Kochi" => vec!["高知県", "高知"],
        "Fukuoka" => vec!["福岡県", "福岡"],
        "Saga" => vec!["佐賀県", "佐賀"],
        "Nagasaki" => vec!["長崎県", "長崎"],
        "Kumamoto" => vec!["熊本県", "熊本"],
        "Oita" => vec!["大分県", "大分"],
        "Miyazaki" => vec!["宮崎県", "宮崎"],
        "Kagoshima" => vec!["鹿児島県", "鹿児島"],
        "Okinawa" => vec!["沖縄県", "沖縄"],

        // ===== Hokkaido =====
        "Sapporo" => vec!["札幌"],
        "Hakodate" => vec!["函館"],
        "Asahikawa" => vec!["旭川"],
        "Obihiro" => vec!["帯広"],
        "Kushiro" => vec!["釧路"],
        "Otaru" => vec!["小樽"],
        "Niseko" => vec!["ニセコ"],
        "Furano" => vec!["富良野"],
        "Biei" => vec!["美瑛"],
        "Noboribetsu" => vec!["登別"],
        "Toyako" | "Toya" => vec!["洞爺湖"],
        "Wakkanai" => vec!["稚内"],
        "Abashiri" => vec!["網走"],
        "Shakotan" => vec!["積丹"],

        // ===== Tohoku =====
        "Sendai" => vec!["仙台"],
        "Morioka" => vec!["盛岡"],
        "Hirosaki" => vec!["弘前"],
        "Aizuwakamatsu" => vec!["会津若松"],
        "Towada" => vec!["十和田"],
        "Hiraizumi" => vec!["平泉"],
        "Tono" => vec!["遠野"],
        "Kakunodate" => vec!["角館"],
        "Matsushima" => vec!["松島"],
        "Sakata" => vec!["酒田"],
        "Tsuruoka" => vec!["鶴岡"],
        "Zao" => vec!["蔵王"],
        "Naruko" => vec!["鳴子"],

        // ===== Kanto: Tokyo areas =====
        "Shibuya" => vec!["渋谷"],
        "Shinjuku" => vec!["新宿"],
        "Ginza" => vec!["銀座"],
        "Asakusa" => vec!["浅草"],
        "Akihabara" => vec!["秋葉原"],
        "Roppongi" => vec!["六本木"],
        "Ikebukuro" => vec!["池袋"],
        "Ueno" => vec!["上野"],
        "Odaiba" => vec!["お台場"],
        "Harajuku" => vec!["原宿"],
        "Marunouchi" => vec!["丸の内"],
        "Takanawa" => vec!["高輪"],
        "Akasaka" => vec!["赤坂"],
        "Tsukiji" => vec!["築地"],
        "Toyosu" => vec!["豊洲"],
        "Ebisu" => vec!["恵比寿"],
        "Azabu" => vec!["麻布"],

        // ===== Kanto: Tokyo wards =====
        "Chiyoda" => vec!["千代田区"],
        "Minato" => vec!["港区"],
        "Chuo" => vec!["中央区"],
        "Taito" => vec!["台東区"],
        "Sumida" => vec!["墨田区"],
        "Koto" => vec!["江東区"],
        "Shinagawa" => vec!["品川区"],
        "Meguro" => vec!["目黒区"],
        "Setagaya" => vec!["世田谷区"],
        "Nakano" => vec!["中野区"],
        "Suginami" => vec!["杉並区"],
        "Nerima" => vec!["練馬区"],
        "Toshima" => vec!["豊島区"],
        "Kita" => vec!["北区"],
        "Itabashi" => vec!["板橋区"],
        "Adachi" => vec!["足立区"],
        "Katsushika" => vec!["葛飾区"],
        "Edogawa" => vec!["江戸川区"],
        "Bunkyo" => vec!["文京区"],
        "Ota" => vec!["大田区"],
        "Arakawa" => vec!["荒川区"],

        // ===== Kanto: Kanagawa =====
        "Yokohama" => vec!["横浜"],
        "Kamakura" => vec!["鎌倉"],
        "Hakone" => vec!["箱根"],
        "Enoshima" => vec!["江ノ島"],
        "Kawasaki" => vec!["川崎"],
        "Yokosuka" => vec!["横須賀"],
        "Miyanoshita" => vec!["宮ノ下"],

        // ===== Kanto: Saitama =====
        "Kawagoe" => vec!["川越"],
        "Chichibu" => vec!["秩父"],

        // ===== Kanto: Chiba =====
        "Narita" => vec!["成田"],

        // ===== Kanto: Ibaraki =====
        "Mito" => vec!["水戸"],

        // ===== Kanto: Tochigi =====
        "Utsunomiya" => vec!["宇都宮"],
        "Nikko" => vec!["日光"],

        // ===== Kanto: Gunma =====
        "Maebashi" => vec!["前橋"],
        "Kusatsu" => vec!["草津"],

        // ===== Chubu: Nagano =====
        "Matsumoto" => vec!["松本"],
        "Karuizawa" => vec!["軽井沢"],
        "Hakuba" => vec!["白馬"],
        "Nozawa" | "Nozawa Onsen" => vec!["野沢温泉"],
        "Tsumago" => vec!["妻籠"],
        "Suwa" => vec!["諏訪"],

        // ===== Chubu: Yamanashi =====
        "Kofu" => vec!["甲府"],
        "Kawaguchiko" | "Fujikawaguchiko" => vec!["河口湖"],

        // ===== Chubu: Niigata =====
        "Sado" => vec!["佐渡"],

        // ===== Chubu: Ishikawa =====
        "Kanazawa" => vec!["金沢"],
        "Wajima" => vec!["輪島"],

        // ===== Chubu: Gifu =====
        "Takayama" => vec!["高山"],
        "Shirakawa" | "Shirakawa-go" => vec!["白川郷"],
        "Gero" => vec!["下呂"],
        "Magome" => vec!["馬籠"],
        "Gujo" => vec!["郡上"],

        // ===== Chubu: Shizuoka =====
        "Atami" => vec!["熱海"],
        "Ito" => vec!["伊東"],
        "Numazu" => vec!["沼津"],
        "Hamamatsu" => vec!["浜松"],
        "Shimoda" => vec!["下田"],
        "Izu" => vec!["伊豆"],
        "Gotemba" => vec!["御殿場"],
        "Fuji" => vec!["富士"],

        // ===== Chubu: Aichi =====
        "Nagoya" => vec!["名古屋"],
        "Gamagori" => vec!["蒲郡"],
        "Inuyama" => vec!["犬山"],

        // ===== Chubu: Mie =====
        "Tsu" => vec!["津"],
        "Ise" => vec!["伊勢"],
        "Toba" => vec!["鳥羽"],
        "Kumano" => vec!["熊野"],

        // ===== Kansai: Kyoto =====
        "Arashiyama" => vec!["嵐山"],
        "Fushimi" => vec!["伏見"],
        "Uji" => vec!["宇治"],
        "Higashiyama" => vec!["東山"],
        "Nakagyo" => vec!["中京区"],
        "Shimogyo" => vec!["下京区"],
        "Kamigyo" => vec!["上京区"],
        "Sakyo" => vec!["左京区"],
        "Ukyo" => vec!["右京区"],
        "Miyazu" => vec!["宮津"],
        "Amanohashidate" => vec!["天橋立"],

        // ===== Kansai: Osaka =====
        "Namba" => vec!["難波"],
        "Umeda" => vec!["梅田"],
        "Tennoji" => vec!["天王寺"],
        "Nakanoshima" => vec!["中之島"],
        "Naniwa" => vec!["浪速区"],
        "Sakai" => vec!["堺"],

        // ===== Kansai: Hyogo =====
        "Kobe" => vec!["神戸"],
        "Himeji" => vec!["姫路"],
        "Arimacho" | "Arima" => vec!["有馬"],
        "Kinosaki" => vec!["城崎"],
        "Takeda" => vec!["竹田"],

        // ===== Kansai: Shiga =====
        "Otsu" => vec!["大津"],

        // ===== Kansai: Nara =====
        "Yoshino" => vec!["吉野"],

        // ===== Kansai: Wakayama =====
        "Koyasan" | "Koya" => vec!["高野山"],
        "Shirahama" => vec!["白浜"],

        // ===== Chugoku =====
        "Kurashiki" => vec!["倉敷"],
        "Miyajima" => vec!["宮島"],
        "Onomichi" => vec!["尾道"],
        "Matsue" => vec!["松江"],
        "Izumo" => vec!["出雲"],
        "Tsuwano" => vec!["津和野"],
        "Iwakuni" => vec!["岩国"],
        "Shimonoseki" => vec!["下関"],

        // ===== Shikoku =====
        "Takamatsu" => vec!["高松"],
        "Matsuyama" => vec!["松山"],
        "Naruto" => vec!["鳴門"],
        "Naoshima" => vec!["直島"],
        "Kotohira" => vec!["琴平"],
        "Shimanto" => vec!["四万十"],
        "Uwajima" => vec!["宇和島"],

        // ===== Kyushu =====
        "Hakata" => vec!["博多"],
        "Kitakyushu" => vec!["北九州"],
        "Dazaifu" => vec!["太宰府"],
        "Yanagawa" => vec!["柳川"],
        "Sasebo" => vec!["佐世保"],
        "Arita" => vec!["有田"],
        "Aso" => vec!["阿蘇"],
        "Beppu" => vec!["別府"],
        "Yufuin" => vec!["湯布院"],
        "Yufu" => vec!["由布"],
        "Takachiho" => vec!["高千穂"],
        "Ibusuki" => vec!["指宿"],
        "Yakushima" => vec!["屋久島"],
        "Tanegashima" => vec!["種子島"],
        "Amami" => vec!["奄美"],

        // ===== Okinawa =====
        "Naha" => vec!["那覇"],
        "Ishigaki" => vec!["石垣"],
        "Miyako" => vec!["宮古"],
        "Nago" => vec!["名護"],
        "Chatan" => vec!["北谷"],
        "Motobu" => vec!["本部"],
        "Onna" => vec!["恩納"],

        _ => vec![],
    }
}

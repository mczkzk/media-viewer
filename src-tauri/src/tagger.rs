use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
struct TagCache {
    version: u32,
    tags: HashMap<String, Vec<String>>,
}

impl TagCache {
    fn new() -> Self {
        Self {
            version: 1,
            tags: HashMap::new(),
        }
    }
}

fn cache_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("cache").join("tags.json")
}

pub fn load_tags(app_data_dir: &Path) -> HashMap<String, Vec<String>> {
    let path = cache_path(app_data_dir);
    let data = match fs::read_to_string(&path) {
        Ok(d) => d,
        Err(_) => return HashMap::new(),
    };
    match serde_json::from_str::<TagCache>(&data) {
        Ok(cache) => cache.tags,
        Err(_) => HashMap::new(),
    }
}

fn save_tags(app_data_dir: &Path, tags: &HashMap<String, Vec<String>>) -> Result<(), String> {
    let path = cache_path(app_data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let cache = TagCache {
        version: 1,
        tags: tags.clone(),
    };
    let data = serde_json::to_string(&cache).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}

fn find_vision_tagger() -> Option<PathBuf> {
    // Check bundled binary in app Resources
    if let Ok(exe) = std::env::current_exe() {
        let resources = exe
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("Resources"));
        if let Some(ref res) = resources {
            // Tauri bundles resources with their relative path
            let bundled = res.join("helpers").join("vision-tagger");
            if bundled.exists() {
                return Some(bundled);
            }
            let flat = res.join("vision-tagger");
            if flat.exists() {
                return Some(flat);
            }
        }
    }

    // Dev mode: check helpers directory relative to source
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("helpers").join("vision-tagger");
    if dev_path.exists() {
        return Some(dev_path);
    }

    None
}

/// Call the Swift vision-tagger helper for a batch of images.
/// Returns Vec of label arrays (English), one per image.
fn classify_batch(paths: &[String]) -> Result<Vec<Vec<String>>, String> {
    let tagger = find_vision_tagger().ok_or("vision-tagger binary not found")?;

    let output = Command::new(&tagger)
        .args(paths)
        .output()
        .map_err(|e| format!("Failed to run vision-tagger: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("vision-tagger failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse vision-tagger output: {}", e))
}

fn translate_label(label: &str) -> &str {
    match label {
        // Nature / Scenery
        "sky" => "空",
        "blue_sky" => "青空",
        "night_sky" => "夜空",
        "cloud" | "cloudy" => "雲",
        "sunset" | "sunrise" | "sunset_sunrise" => "夕焼け",
        "mountain" | "hill" => "山",
        "ocean" | "sea" | "water_body" => "海",
        "beach" | "shore" => "ビーチ",
        "lake" => "湖",
        "river" | "creek" | "waterways" => "川",
        "waterfall" => "滝",
        "water" | "liquid" => "水",
        "snow" | "frozen" => "雪",
        "rain" | "storm" | "blizzard" => "雨",
        "fog" | "haze" => "霧",
        "rainbow" => "虹",
        "forest" | "jungle" => "森",
        "tree" | "branch" | "evergreen" | "maple_tree" | "palm_tree" | "willow" | "sequoia" => "木",
        "plant" | "vegetation" | "decorative_plant" => "植物",
        "flower" | "blossom" | "flower_arrangement" | "bouquet" => "花",
        "grass" | "foliage" | "shrub" | "ferns" | "moss" | "ivy" => "草",
        "garden" | "greenhouse" => "庭",
        "field" | "land" | "prairie_dog" => "野原",
        "desert" | "sand_dune" => "砂漠",
        "volcano" => "火山",
        "island" => "島",
        "rock" | "rocks" | "cliff" | "megalith" => "岩",
        "sand" => "砂",
        "sun" => "太陽",
        "ice" => "氷",
        "wood_natural" => "自然木",
        "canyon" => "渓谷",
        "wetland" => "湿地",

        // Structures / Architecture
        "structure" => "構造物",
        "building" => "建物",
        "house" | "domicile" | "house_single" => "家",
        "apartment" => "マンション",
        "skyscraper" => "高層ビル",
        "temple" | "shrine" => "寺社",
        "church" => "教会",
        "castle" | "ruins" => "城",
        "bridge" | "arch" => "橋",
        "tower" | "clock_tower" | "belltower" => "塔",
        "dome" => "ドーム",
        "pyramid" => "ピラミッド",
        "monument" | "obelisk" => "記念碑",
        "statue" | "sculpture" | "gargoyle" => "彫刻",
        "stained_glass" => "ステンドグラス",
        "fountain" => "噴水",
        "fence" => "柵",
        "wall" => "壁",
        "roof" => "屋根",
        "stairs" | "escalator" => "階段",
        "door" | "portal" => "入口",
        "window" => "窓",
        "balcony" | "deck" | "patio" | "pergola" => "バルコニー",
        "tunnel" => "トンネル",
        "barn" => "納屋",
        "gazebo" => "東屋",

        // Location / Setting
        "outdoor" => "屋外",
        "indoor" | "interior_room" => "屋内",
        "urban" => "都市",
        "rural" | "agriculture" | "farm" | "vineyard" | "rice_field" => "田舎",
        "city" | "cityscape" => "街並み",
        "street" | "sidewalk" | "crosswalk" | "alley" => "通り",
        "road" | "highway" | "path" | "trail" | "road_other" => "道路",
        "park" => "公園",
        "playground" => "遊び場",
        "pool" | "swimming_pool" | "jacuzzi" => "プール",
        "stadium" | "arena" | "bleachers" => "スタジアム",
        "airport" => "空港",
        "train_station" | "station" | "railroad" | "track_rail" => "駅",
        "restaurant" | "bar" | "nightclub" => "レストラン",
        "shop" | "store" | "storefront" | "interior_shop" | "market" => "店",
        "museum" | "gallery" => "美術館",
        "school" | "classroom" => "学校",
        "hospital" | "health_club" => "病院",
        "office" | "conference" => "オフィス",
        "hotel" => "ホテル",
        "room" | "living_room" => "部屋",
        "kitchen" | "kitchen_countertop" => "キッチン",
        "bathroom" | "bath" | "washbasin" | "bathroom_faucet" => "浴室",
        "bedroom" => "寝室",
        "library" | "bookshelf" => "図書館",
        "auditorium" | "theater" => "劇場",
        "aquarium" => "水族館",
        "zoo" => "動物園",
        "amusement_park" | "ferris_wheel" | "carousel" => "遊園地",
        "parking_lot" => "駐車場",
        "elevator" => "エレベーター",
        "dock" | "harbour" => "港",

        // People
        "person" | "people" => "人物",
        "adult" => "大人",
        "teen" => "十代",
        "face" | "portrait" => "顔",
        "baby" | "infant" => "赤ちゃん",
        "child" | "kid" => "子供",
        "crowd" => "群衆",
        "selfie" => "自撮り",
        "bride" | "groom" | "wedding" | "wedding_dress" => "結婚式",
        "party" | "celebration" => "パーティー",
        "graduation" => "卒業式",
        "parade" => "パレード",
        "entertainer" | "singer" | "performance" => "パフォーマンス",

        // Animals
        "animal" | "mammal" => "動物",
        "dog" => "犬",
        "cat" | "adult_cat" | "feline" => "猫",
        "bird" | "gull" | "pigeon" | "swan" | "penguin" => "鳥",
        "fish" | "koi" | "puffer_fish" | "stingray" | "shark" | "tuna" | "salmon" => "魚",
        "horse" | "equestrian" | "saddle" => "馬",
        "insect" | "bug" | "butterfly" => "虫",
        "pet" => "ペット",
        "deer" => "鹿",
        "cow" => "牛",
        "camel" | "llama" => "ラクダ",
        "elephant" => "象",
        "panda" => "パンダ",
        "rhinoceros" => "サイ",
        "rodent" => "げっ歯類",
        "shellfish" | "crab" | "oyster" => "貝",
        "seafood" => "海鮮",
        "ungulates" => "有蹄類",

        // Food / Drink
        "food" | "meal" => "食べ物",
        "drink" | "beverage" | "juice" => "飲み物",
        "fruit" | "berry" | "citrus_fruit" | "apple" | "banana" | "mango" | "peach"
        | "strawberry" | "raspberry" | "lemon" | "lime" | "kiwi" => "果物",
        "vegetable" | "lettuce" | "tomato" | "broccoli" | "corn" | "potato"
        | "carrot" | "cucumber" | "asparagus" => "野菜",
        "dessert" | "sweet" | "frozen_dessert" | "ice_cream" => "デザート",
        "cake" | "birthday_cake" | "wedding_cake" | "cheesecake" | "muffin" => "ケーキ",
        "bread" | "baked_goods" | "croissant" | "white_bread" => "パン",
        "meat" | "steak" | "poultry" | "sausage" => "肉",
        "sushi" | "roe" => "寿司",
        "ramen" | "spaghetti" | "pasta" => "麺",
        "tempura" => "天ぷら",
        "rice" => "ごはん",
        "soup" => "スープ",
        "salad" | "arugula" => "サラダ",
        "sandwich" | "hamburger" | "hotdog" => "サンドイッチ",
        "fries" => "フライ",
        "egg" | "yolk" | "fried_egg" | "scrambled_eggs" | "omelet" => "卵",
        "stir_fry" | "cooking" => "料理",
        "falafel" | "springroll" => "揚げ物",
        "wasabi" | "seasonings" | "condiment" | "herb" | "cilantro" | "sesame" => "調味料",
        "coffee" => "コーヒー",
        "wine" | "alcohol" | "beer" | "liquor" | "red_wine" | "white_wine" => "酒",
        "cookie" | "candy" | "chocolate" => "お菓子",
        "chopsticks" => "箸",

        // Tableware / Kitchen
        "table" => "テーブル",
        "tableware" | "plate" | "bowl" | "cup" | "mug" | "drinking_glass" => "食器",
        "utensil" | "spoon" | "fork" | "knife" | "cutting_board" => "食器",
        "cookware" | "pot_cooking" | "stove" | "grill" => "調理器具",
        "bottle" | "wine_bottle" => "ボトル",

        // Furniture / Interior
        "furniture" => "家具",
        "chair" | "armchair" | "folding_chair" | "swivel_chair" | "chair_other" | "seat"
        | "stool" | "high_chair" | "bench" => "椅子",
        "sofa" => "ソファ",
        "bed" | "bedding" | "pillow" => "ベッド",
        "desk" => "机",
        "cabinet" | "closet" | "bookshelf" => "棚",
        "curtain" => "カーテン",
        "lamp" | "chandelier" | "lamppost" | "spotlight" => "照明",
        "frame" => "額縁",
        "housewares" | "decoration" => "インテリア",
        "fireplace" => "暖炉",
        "straw_drinking" => "ストロー",
        "vase" => "花瓶",

        // Transport
        "car" | "automobile" | "vehicle" | "suv" => "車",
        "conveyance" => "乗り物",
        "train" | "train_real" | "streetcar" | "monorail" => "電車",
        "bus" | "van" | "truck" | "motorhome" | "ambulance" => "バス",
        "airplane" | "aircraft" => "飛行機",
        "boat" | "ship" | "watercraft" | "cruise_ship" | "sailboat"
        | "speedboat" | "houseboat" | "canoe" | "rowboat" => "船",
        "bicycle" | "bike" | "cycling" | "tricycle" => "自転車",
        "motorcycle" | "scooter" | "atv" => "バイク",
        "tire" | "wheel" | "rim" => "タイヤ",
        "cart" | "shopping_cart" | "wheelbarrow" | "stroller" | "wagon" => "カート",
        "rickshaw" => "人力車",

        // Clothing / Accessories
        "clothing" | "fashion" | "textile" => "ファッション",
        "jacket" | "hoodie" | "suit" | "tuxedo" | "gown" | "costume"
        | "kimono" | "sari" | "lab_coat" | "military_uniform" | "safety_vest" => "服",
        "jeans" | "swimsuit" => "服",
        "hat" | "headgear" | "baseball_hat" | "sunhat" | "beanie" | "fedora" | "hardhat" => "帽子",
        "shoes" | "footwear" | "sneaker" | "sandal" | "boot" | "ski_boot" | "high_heel" => "靴",
        "eyeglasses" | "sunglasses" | "goggles" => "眼鏡",
        "scarf" | "necktie" | "bib" | "apron" => "アクセサリー",
        "purse" | "backpack" | "luggage" | "suitcase" | "bag" | "paper_bag" => "かばん",
        "umbrella" => "傘",
        "jewelry" => "ジュエリー",
        "tattoo" | "henna" => "タトゥー",
        "helmet" => "ヘルメット",

        // Activities / Sports
        "sport" | "sports" | "sports_equipment" | "recreation" => "スポーツ",
        "concert" | "music" | "musical_instrument" | "speakers_music"
        | "drum" | "bongo_drum" | "organ_instrument" | "orchestra" => "音楽",
        "dance" | "dancing" => "ダンス",
        "festival" | "matsuri" => "祭り",
        "ceremony" => "式典",
        "fireworks" | "pyrotechnics" | "sparkler" => "花火",
        "travel" => "旅行",
        "hiking" => "ハイキング",
        "camping" | "tent" => "キャンプ",
        "swimming" | "watersport" | "sunbathing" => "水泳",
        "skiing" | "winter_sport" | "ski_equipment" | "snowboarding" | "snowboard"
        | "sledding" | "sled" | "skating" | "ice_skating" => "ウィンタースポーツ",
        "rock_climbing" => "ロッククライミング",
        "surfing" => "サーフィン",
        "fishing" => "釣り",
        "ballgames" | "baseball" | "tennis" | "racquet" => "球技",
        "cycling" => "サイクリング",
        "games" | "chess" | "foosball" => "ゲーム",
        "workout" | "athletics" => "運動",

        // Time / Lighting
        "night" | "nighttime" => "夜",
        "daytime" => "昼",
        "golden_hour" => "ゴールデンアワー",
        "dark" | "darkness" => "暗い",
        "bright" | "light" => "明るい",
        "fire" | "flame" => "火",

        // Technology / Electronics
        "phone" | "smartphone" => "スマートフォン",
        "computer" | "laptop" | "computer_monitor" | "computer_keyboard" => "パソコン",
        "screen" | "monitor" | "television" => "画面",
        "camera" | "optical_equipment" | "tripod" => "カメラ",
        "consumer_electronics" | "circuit_board" => "電子機器",
        "electric_fan" | "appliance" | "refrigerator" => "家電",
        "drone_machine" => "ドローン",
        "headphones" => "ヘッドホン",
        "machine" => "機械",

        // Objects
        "book" | "printed_page" => "本",
        "clock" | "watch" | "timepiece" | "dial" => "時計",
        "sign" | "banner" | "billboards" | "street_sign" => "看板",
        "flag" | "flagpole" => "旗",
        "art" | "painting" | "artwork" | "illustrations" | "graffiti" => "アート",
        "toy" | "stuffed_animals" | "vehicle_toy" | "blocks" | "figurine" => "おもちゃ",
        "gift" | "present" => "プレゼント",
        "document" | "paper" | "receipt" | "ticket" | "map" | "calendar" => "書類",
        "balloon" => "風船",
        "candle" | "candlestick" => "ろうそく",
        "christmas_tree" | "christmas_decoration" | "christmas" => "クリスマス",
        "halloween" => "ハロウィン",
        "handwriting" | "chalkboard" | "whiteboard" => "手書き",
        "origami" => "折り紙",
        "globe" => "地球儀",
        "trophy" => "トロフィー",
        "pen" | "office_supplies" => "文房具",
        "money" | "coin" | "currency" => "お金",
        "rope" | "cord" => "ロープ",
        "lifejacket" | "lifesaver" => "ライフジャケット",
        "screenshot" => "スクリーンショット",
        "container" | "basket_container" | "bucket" | "crate"
        | "carton" | "cardboard_box" => "容器",

        // Materials
        "material" => "素材",
        "wood_processed" => "木材",
        "brick" => "レンガ",
        "raw_glass" => "ガラス",
        "polka_dots" => "水玉",

        // Misc
        "landscape" => "風景",
        "scenery" => "景色",
        "panorama" => "パノラマ",
        "abstract" => "抽象",
        "texture" => "テクスチャ",
        "pattern" => "パターン",
        "colorful" => "カラフル",
        "black_and_white" | "monochrome" => "モノクロ",
        "blurry" | "blur" => "ぼけ",
        "closeup" | "macro" => "接写",
        "aerial" => "空撮",
        "underwater" => "水中",
        "reflection" => "反射",
        "shadow" => "影",
        "silhouette" => "シルエット",
        "symmetric" | "symmetry" => "対称",
        "vintage" | "retro" => "レトロ",
        "snow_covered" => "雪景色",
        "rose" | "sunflower" | "chrysanthemum" | "daffodil" => "花",
        "grave" => "墓",
        "rangoli" => "ランゴリ",
        "diorama" => "ジオラマ",
        "shower" => "シャワー",
        "toilet_seat" => "トイレ",
        "diaper" | "pacifier" => "赤ちゃん用品",
        "wheelchair" => "車椅子",

        // Pass through unknown labels as-is
        other => other,
    }
}

/// Tag a batch of images. Returns number of newly tagged images.
pub fn tag_images(
    paths: &[String],
    base_path: &str,
    app_data_dir: &Path,
) -> Result<usize, String> {
    let full_paths: Vec<String> = paths
        .iter()
        .map(|p| format!("{}/{}", base_path, p))
        .collect();

    let results = classify_batch(&full_paths)?;
    let mut tags = load_tags(app_data_dir);
    let mut count = 0;

    for (rel_path, labels) in paths.iter().zip(results.iter()) {
        let translated: Vec<String> = labels.iter().map(|l| translate_label(l).to_string()).collect();
        tags.insert(rel_path.clone(), translated);
        count += 1;
    }

    save_tags(app_data_dir, &tags)?;
    Ok(count)
}

/**
 * Simplified Kana Converter
 * Based on WanaKana (MIT License) - https://github.com/WaniKani/WanaKana
 * Converts between Romaji, Hiragana, and Katakana
 */

// Romaji to Hiragana mapping
const ROMAJI_TO_HIRAGANA = {
  // Vowels
  'a': 'あ', 'i': 'い', 'u': 'う', 'e': 'え', 'o': 'お',

  // K consonants
  'ka': 'か', 'ki': 'き', 'ku': 'く', 'ke': 'け', 'ko': 'こ',
  'kya': 'きゃ', 'kyu': 'きゅ', 'kyo': 'きょ',

  // S consonants
  'sa': 'さ', 'shi': 'し', 'su': 'す', 'se': 'せ', 'so': 'そ',
  'sha': 'しゃ', 'shu': 'しゅ', 'sho': 'しょ',

  // T consonants
  'ta': 'た', 'chi': 'ち', 'tsu': 'つ', 'te': 'て', 'to': 'と',
  'cha': 'ちゃ', 'chu': 'ちゅ', 'cho': 'ちょ',

  // N consonants
  'na': 'な', 'ni': 'に', 'nu': 'ぬ', 'ne': 'ね', 'no': 'の',
  'nya': 'にゃ', 'nyu': 'にゅ', 'nyo': 'にょ',
  'n': 'ん',

  // H consonants
  'ha': 'は', 'hi': 'ひ', 'fu': 'ふ', 'he': 'へ', 'ho': 'ほ',
  'hya': 'ひゃ', 'hyu': 'ひゅ', 'hyo': 'ひょ',

  // M consonants
  'ma': 'ま', 'mi': 'み', 'mu': 'む', 'me': 'め', 'mo': 'も',
  'mya': 'みゃ', 'myu': 'みゅ', 'myo': 'みょ',

  // Y consonants
  'ya': 'や', 'yu': 'ゆ', 'yo': 'よ',

  // R consonants
  'ra': 'ら', 'ri': 'り', 'ru': 'る', 're': 'れ', 'ro': 'ろ',
  'rya': 'りゃ', 'ryu': 'りゅ', 'ryo': 'りょ',

  // W consonants
  'wa': 'わ', 'wo': 'を',

  // G consonants
  'ga': 'が', 'gi': 'ぎ', 'gu': 'ぐ', 'ge': 'げ', 'go': 'ご',
  'gya': 'ぎゃ', 'gyu': 'ぎゅ', 'gyo': 'ぎょ',

  // Z consonants
  'za': 'ざ', 'ji': 'じ', 'zu': 'ず', 'ze': 'ぜ', 'zo': 'ぞ',
  'ja': 'じゃ', 'ju': 'じゅ', 'jo': 'じょ',

  // D consonants
  'da': 'だ', 'di': 'ぢ', 'du': 'づ', 'de': 'で', 'do': 'ど',

  // B consonants
  'ba': 'ば', 'bi': 'び', 'bu': 'ぶ', 'be': 'べ', 'bo': 'ぼ',
  'bya': 'びゃ', 'byu': 'びゅ', 'byo': 'びょ',

  // P consonants
  'pa': 'ぱ', 'pi': 'ぴ', 'pu': 'ぷ', 'pe': 'ぺ', 'po': 'ぽ',
  'pya': 'ぴゃ', 'pyu': 'ぴゅ', 'pyo': 'ぴょ',
};

// Hiragana to Romaji mapping (reverse of above)
const HIRAGANA_TO_ROMAJI = {};
Object.keys(ROMAJI_TO_HIRAGANA).forEach(romaji => {
  const hiragana = ROMAJI_TO_HIRAGANA[romaji];
  HIRAGANA_TO_ROMAJI[hiragana] = romaji;
});

// Hiragana to Katakana conversion (Unicode offset)
const HIRAGANA_START = 0x3041;
const HIRAGANA_END = 0x3096;
const KATAKANA_START = 0x30A1;
const KATAKANA_OFFSET = KATAKANA_START - HIRAGANA_START;

/**
 * Convert Romaji to Hiragana
 */
function toHiragana(text) {
  if (!text) return '';

  let result = '';
  let i = 0;
  const lower = text.toLowerCase();

  while (i < lower.length) {
    // Try 3-char match first (longest possible)
    if (i + 3 <= lower.length) {
      const three = lower.slice(i, i + 3);
      if (ROMAJI_TO_HIRAGANA[three]) {
        result += ROMAJI_TO_HIRAGANA[three];
        i += 3;
        continue;
      }
    }

    // Try 2-char match
    if (i + 2 <= lower.length) {
      const two = lower.slice(i, i + 2);
      if (ROMAJI_TO_HIRAGANA[two]) {
        result += ROMAJI_TO_HIRAGANA[two];
        i += 2;
        continue;
      }

      // Handle double consonants (kka -> っか)
      if (two[0] === two[1] && two[0] !== 'n') {
        result += 'っ';
        i += 1;
        continue;
      }
    }

    // Try 1-char match
    const one = lower[i];
    if (ROMAJI_TO_HIRAGANA[one]) {
      result += ROMAJI_TO_HIRAGANA[one];
      i += 1;
      continue;
    }

    // Keep original character if no match
    result += text[i];
    i += 1;
  }

  return result;
}

/**
 * Convert Hiragana to Katakana
 */
function hiraganaToKatakana(text) {
  if (!text) return '';

  return Array.from(text).map(char => {
    const code = char.charCodeAt(0);
    if (code >= HIRAGANA_START && code <= HIRAGANA_END) {
      return String.fromCharCode(code + KATAKANA_OFFSET);
    }
    return char;
  }).join('');
}

/**
 * Convert Katakana to Hiragana
 */
function katakanaToHiragana(text) {
  if (!text) return '';

  return Array.from(text).map(char => {
    const code = char.charCodeAt(0);
    if (code >= KATAKANA_START && code <= KATAKANA_START + (HIRAGANA_END - HIRAGANA_START)) {
      return String.fromCharCode(code - KATAKANA_OFFSET);
    }
    return char;
  }).join('');
}

/**
 * Convert Romaji to Katakana
 */
function toKatakana(text) {
  return hiraganaToKatakana(toHiragana(text));
}

/**
 * Convert Hiragana to Romaji
 */
function toRomaji(text) {
  if (!text) return '';

  let result = '';
  let i = 0;

  while (i < text.length) {
    // Try 2-char match first (for combined characters like きゃ)
    if (i + 2 <= text.length) {
      const two = text.slice(i, i + 2);
      if (HIRAGANA_TO_ROMAJI[two]) {
        result += HIRAGANA_TO_ROMAJI[two];
        i += 2;
        continue;
      }
    }

    // Try 1-char match
    const one = text[i];
    if (HIRAGANA_TO_ROMAJI[one]) {
      result += HIRAGANA_TO_ROMAJI[one];
      i += 1;
      continue;
    }

    // Handle Katakana by converting to Hiragana first
    const hiragana = katakanaToHiragana(one);
    if (HIRAGANA_TO_ROMAJI[hiragana]) {
      result += HIRAGANA_TO_ROMAJI[hiragana];
      i += 1;
      continue;
    }

    // Handle small tsu (っ)
    if (one === 'っ' || one === 'ッ') {
      // Double the next consonant
      if (i + 1 < text.length) {
        const nextChar = text[i + 1];
        const nextRomaji = HIRAGANA_TO_ROMAJI[nextChar] || HIRAGANA_TO_ROMAJI[katakanaToHiragana(nextChar)];
        if (nextRomaji && nextRomaji.length > 0) {
          result += nextRomaji[0];
        }
      }
      i += 1;
      continue;
    }

    // Keep original character if no match
    result += text[i];
    i += 1;
  }

  return result;
}

/**
 * Check if text contains Hiragana
 */
function hasHiragana(text) {
  return Array.from(text).some(char => {
    const code = char.charCodeAt(0);
    return code >= HIRAGANA_START && code <= HIRAGANA_END;
  });
}

/**
 * Check if text contains Katakana
 */
function hasKatakana(text) {
  return Array.from(text).some(char => {
    const code = char.charCodeAt(0);
    return code >= KATAKANA_START && code <= KATAKANA_START + (HIRAGANA_END - HIRAGANA_START);
  });
}

/**
 * Check if text contains Kanji
 */
function hasKanji(text) {
  const KANJI_START = 0x4E00;
  const KANJI_END = 0x9FAF;
  return Array.from(text).some(char => {
    const code = char.charCodeAt(0);
    return code >= KANJI_START && code <= KANJI_END;
  });
}

// Export functions
window.KanaConverter = {
  toHiragana,
  toKatakana,
  toRomaji,
  hiraganaToKatakana,
  katakanaToHiragana,
  hasHiragana,
  hasKatakana,
  hasKanji,
};

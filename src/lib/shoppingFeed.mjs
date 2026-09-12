// Google taxonomy IDs. Match specific categories before their parent categories.
const CATEGORY_RULES = [
  [/スマホケース|iPhone用ケース/, '2353'],
  [/スマホアクセサリー|スマホリング/, '264'],
  [/リュック|バックパック/, '100'],
  [/座布団カバー|クッションカバー/, '2927'],
  [/ランチョンマット/, '2547'],
  [/コースター/, '2363'],
  [/ラグ|カーペット|マット/, '598'],
  [/バッグ/, '5181'],
  [/インテリア/, '696'],
];

export function getGoogleCategory(category) {
  return CATEGORY_RULES.find(([pattern]) => pattern.test(category || ''))?.[1] || '';
}

export function getCondition(condition) {
  if (!condition || condition.includes('新品')) return 'new';
  // Google accepts new / used / refurbished, not like_new.
  return 'used';
}

export function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function validGtin(value) {
  const code = String(value || '').trim();
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code) || /^0+$/.test(code)) return '';
  const digits = [...code].reverse().map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 ? 3 : 1), 0);
  return sum % 10 === 0 ? code : '';
}

export function identifierXml(product) {
  const brand = String(product.brand || '').trim();
  const gtin = validGtin(product.jan_code);
  const fields = [];
  if (brand && !/^(?:ノーブランド(?:品)?|ブランドなし|なし|不明|unknown|no[ -]?brand)$/i.test(brand)) {
    fields.push(`<g:brand>${escapeXml(brand)}</g:brand>`);
  }
  if (gtin) fields.push(`<g:gtin>${gtin}</g:gtin>`);
  // An empty database field means unknown; it does not prove identifiers do not exist.
  // Do not invent a brand, use an internal SKU as MPN, or assert identifier_exists=no.
  return fields.join('\n      ');
}

export const CURRENCY_OPTIONS = [
    {
        country: 'Multiple countries',
        code: 'USD',
        name: 'Dollar / Peso / Cordoba',
        symbol: '$',
        search_label: '$ – Dollar (USD, AUD, CAD, NZD), Peso (MXN, CLP, PHP), Cordoba (NIO)',
        aliases: ['united states', 'australia', 'canada', 'new zealand', 'mexico', 'chile', 'philippines', 'nicaragua', 'usd', 'aud', 'cad', 'nzd', 'mxn', 'clp', 'php', 'nio', 'dollar', 'peso', 'cordoba'],
    },
    {
        country: 'Eurozone',
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        search_label: '€ – Euro (EUR - Used by 20+ EU countries)',
        aliases: ['europe', 'european union', 'eurozone', 'eur', 'euro', 'germany', 'france', 'italy', 'spain', 'portugal', 'netherlands', 'belgium', 'austria', 'ireland', 'greece', 'finland', 'croatia', 'slovakia', 'slovenia', 'estonia', 'latvia', 'lithuania', 'luxembourg', 'malta', 'cyprus'],
    },
    {
        country: 'United Kingdom / Egypt / Lebanon',
        code: 'GBP',
        name: 'Pound Sterling / Egyptian Pound / Lebanese Pound',
        symbol: '£',
        search_label: '£ – Pound Sterling (GBP), Egyptian Pound (EGP), Lebanese Pound (LBP)',
        aliases: ['united kingdom', 'britain', 'england', 'egypt', 'lebanon', 'gbp', 'egp', 'lbp', 'pound', 'pound sterling', 'egyptian pound', 'lebanese pound'],
    },
    {
        country: 'Japan / China',
        code: 'JPY',
        name: 'Japanese Yen / Chinese Yuan',
        symbol: '¥',
        search_label: '¥ – Japanese Yen (JPY), Chinese Yuan (CNY)',
        aliases: ['japan', 'china', 'jpy', 'cny', 'yen', 'yuan', 'renminbi'],
    },
    {
        country: 'India',
        code: 'INR',
        name: 'Indian Rupee',
        symbol: '₹',
        search_label: '₹ – Indian Rupee (INR)',
        aliases: ['india', 'indian', 'inr', 'rupee'],
    },
    {
        country: 'South Korea / North Korea',
        code: 'KRW',
        name: 'South Korean Won / North Korean Won',
        symbol: '₩',
        search_label: '₩ – South Korean Won (KRW), North Korean Won (KPW)',
        aliases: ['south korea', 'north korea', 'korea', 'krw', 'kpw', 'won'],
    },
    {
        country: 'Russia',
        code: 'RUB',
        name: 'Russian Ruble',
        symbol: '₽',
        search_label: '₽ – Russian Ruble (RUB)',
        aliases: ['russia', 'russian', 'rub', 'ruble', 'rouble'],
    },
    {
        country: 'Turkey',
        code: 'TRY',
        name: 'Turkish Lira',
        symbol: '₺',
        search_label: '₺ – Turkish Lira (TRY)',
        aliases: ['turkey', 'turkish', 'try', 'lira'],
    },
    {
        country: 'Brazil',
        code: 'BRL',
        name: 'Brazilian Real',
        symbol: 'R$',
        search_label: 'R$ – Brazilian Real (BRL)',
        aliases: ['brazil', 'brazilian', 'brl', 'real'],
    },
    {
        country: 'South Africa',
        code: 'ZAR',
        name: 'South African Rand',
        symbol: 'R',
        search_label: 'R – South African Rand (ZAR)',
        aliases: ['south africa', 'zar', 'rand'],
    },
    {
        country: 'Thailand',
        code: 'THB',
        name: 'Thai Baht',
        symbol: '฿',
        search_label: '฿ – Thai Baht (THB)',
        aliases: ['thailand', 'thai', 'thb', 'baht'],
    },
    {
        country: 'Israel',
        code: 'ILS',
        name: 'New Israeli Sheqel',
        symbol: '₪',
        search_label: '₪ – New Israeli Sheqel (ILS)',
        aliases: ['israel', 'israeli', 'ils', 'sheqel', 'shekel'],
    },
    {
        country: 'Nigeria',
        code: 'NGN',
        name: 'Nigerian Naira',
        symbol: '₦',
        search_label: '₦ – Nigerian Naira (NGN)',
        aliases: ['nigeria', 'nigerian', 'ngn', 'naira'],
    },
    {
        country: 'Philippines / Cuba',
        code: 'PHP',
        name: 'Philippine Peso / Cuban Peso',
        symbol: '₱',
        search_label: '₱ – Philippine Peso (PHP), Cuban Peso (CUP)',
        aliases: ['philippines', 'philippine', 'cuba', 'cuban', 'php', 'cup', 'peso'],
    },
    {
        country: 'China',
        code: 'CNY',
        name: 'Chinese Yuan',
        symbol: '元/¥',
        search_label: '元/¥ – Chinese Yuan (CNY)',
        aliases: ['china', 'chinese', 'cny', 'yuan', 'renminbi', 'yuan sign'],
    },
    {
        country: 'Denmark / Norway / Sweden',
        code: 'DKK',
        name: 'Krone / Krona',
        symbol: 'kr',
        search_label: 'kr – Danish Krone (DKK), Norwegian Krone (NOK), Swedish Krona (SEK)',
        aliases: ['denmark', 'norway', 'sweden', 'dkk', 'nok', 'sek', 'krone', 'krona'],
    },
    {
        country: 'Aruba / Netherlands Antilles',
        code: 'AWG',
        name: 'Aruban Florin / Netherlands Antillean Guilder',
        symbol: 'ƒ',
        search_label: 'ƒ – Aruban Florin (AWG), Netherlands Antillean Guilder (ANG)',
        aliases: ['aruba', 'curacao', 'netherlands antilles', 'awg', 'ang', 'florin', 'guilder'],
    },
    {
        country: 'Pakistan / Sri Lanka / Mauritius',
        code: 'PKR',
        name: 'Pakistan Rupee / Sri Lankan Rupee / Mauritian Rupee',
        symbol: '₨',
        search_label: '₨ – Pakistan Rupee (PKR), Sri Lankan Rupee (LKR), Mauritian Rupee (MUR)',
        aliases: ['pakistan', 'sri lanka', 'mauritius', 'pkr', 'lkr', 'mur', 'rupee'],
    },
    {
        country: 'Azerbaijan',
        code: 'AZN',
        name: 'Azerbaijani Manat',
        symbol: '₼',
        search_label: '₼ – Azerbaijani Manat (AZN)',
        aliases: ['azerbaijan', 'azn', 'manat'],
    },
    {
        country: 'Bangladesh',
        code: 'BDT',
        name: 'Bangladeshi Taka',
        symbol: '৳',
        search_label: '৳ – Bangladeshi Taka (BDT)',
        aliases: ['bangladesh', 'bangladeshi', 'bdt', 'taka'],
    },
    {
        country: 'Cambodia',
        code: 'KHR',
        name: 'Cambodian Riel',
        symbol: '៛',
        search_label: '៛ – Cambodian Riel (KHR)',
        aliases: ['cambodia', 'cambodian', 'khr', 'riel'],
    },
    {
        country: 'Mongolia',
        code: 'MNT',
        name: 'Mongolian Tugrik',
        symbol: '₮',
        search_label: '₮ – Mongolian Tugrik (MNT)',
        aliases: ['mongolia', 'mongolian', 'mnt', 'tugrik', 'togrog'],
    },
    {
        country: 'Vietnam',
        code: 'VND',
        name: 'Vietnamese Dong',
        symbol: '₫',
        search_label: '₫ – Vietnamese Dong (VND)',
        aliases: ['vietnam', 'vietnamese', 'vnd', 'dong'],
    },
    {
        country: 'Laos',
        code: 'LAK',
        name: 'Lao Kip',
        symbol: '₭',
        search_label: '₭ – Lao Kip (LAK)',
        aliases: ['laos', 'lao', 'lak', 'kip'],
    },
    {
        country: 'Czechia',
        code: 'CZK',
        name: 'Czech Koruna',
        symbol: 'Kč',
        search_label: 'Kč – Czech Koruna (CZK)',
        aliases: ['czech republic', 'czechia', 'czk', 'koruna'],
    },
    {
        country: 'Poland',
        code: 'PLN',
        name: 'Polish Zloty',
        symbol: 'zł',
        search_label: 'zł – Polish Złoty (PLN)',
        aliases: ['poland', 'polish', 'pln', 'zloty', 'zl'],
    },
    {
        country: 'Ukraine',
        code: 'UAH',
        name: 'Ukrainian Hryvnia',
        symbol: '₴',
        search_label: '₴ – Ukrainian Hryvnia (UAH)',
        aliases: ['ukraine', 'ukrainian', 'uah', 'hryvnia'],
    },
    {
        country: 'Belarus',
        code: 'BYN',
        name: 'Belarusian Ruble',
        symbol: 'Br',
        search_label: 'Br – Belarusian Ruble (BYN)',
        aliases: ['belarus', 'belarusian', 'byn', 'ruble'],
    },
    {
        country: 'Bosnia and Herzegovina',
        code: 'BAM',
        name: 'Convertible Mark',
        symbol: 'KM',
        search_label: 'KM – Convertible Mark (BAM)',
        aliases: ['bosnia', 'herzegovina', 'bosnia and herzegovina', 'bam', 'convertible mark'],
    },
    {
        country: 'Turkmenistan',
        code: 'TMT',
        name: 'Turkmenistan New Manat',
        symbol: 'm',
        search_label: 'm – Turkmenistan New Manat (TMT)',
        aliases: ['turkmenistan', 'tmt', 'manat'],
    },
    {
        country: 'United Arab Emirates',
        code: 'AED',
        name: 'UAE Dirham',
        symbol: 'د.إ',
        search_label: 'د.إ – UAE Dirham (AED)',
        aliases: ['uae', 'united arab emirates', 'aed', 'dirham'],
    },
    {
        country: 'Saudi Arabia',
        code: 'SAR',
        name: 'Saudi Riyal',
        symbol: 'ر.س',
        search_label: 'ر.س – Saudi Riyal (SAR)',
        aliases: ['saudi arabia', 'saudi', 'sar', 'riyal'],
    },
    {
        country: 'Qatar',
        code: 'QAR',
        name: 'Qatari Rial',
        symbol: 'ر.ق',
        search_label: 'ر.ق – Qatari Rial (QAR)',
        aliases: ['qatar', 'qatari', 'qar', 'rial', 'riyal'],
    },
    {
        country: 'Kuwait',
        code: 'KWD',
        name: 'Kuwaiti Dinar',
        symbol: 'د.ك',
        search_label: 'د.ك – Kuwaiti Dinar (KWD)',
        aliases: ['kuwait', 'kuwaiti', 'kwd', 'dinar'],
    },
    {
        country: 'Tunisia',
        code: 'TND',
        name: 'Tunisian Dinar',
        symbol: 'د.ت',
        search_label: 'د.ت – Tunisian Dinar (TND)',
        aliases: ['tunisia', 'tunisian', 'tnd', 'dinar'],
    },
    {
        country: 'Iraq',
        code: 'IQD',
        name: 'Iraqi Dinar',
        symbol: 'ع.د',
        search_label: 'ع.د – Iraqi Dinar (IQD)',
        aliases: ['iraq', 'iraqi', 'iqd', 'dinar'],
    },
    {
        country: 'Iran / Oman',
        code: 'IRR',
        name: 'Iranian Rial / Omani Rial',
        symbol: '﷼',
        search_label: '﷼ – Iranian Rial (IRR), Omani Rial (OMR)',
        aliases: ['iran', 'oman', 'iranian', 'omani', 'irr', 'omr', 'rial'],
    },
    {
        country: 'Romania',
        code: 'RON',
        name: 'Romanian Leu',
        symbol: 'L',
        search_label: 'L – Romanian Leu (RON)',
        aliases: ['romania', 'romanian', 'ron', 'leu'],
    },
    {
        country: 'Tanzania / Uganda',
        code: 'TZS',
        name: 'Tanzanian Shilling / Ugandan Shilling',
        symbol: 'Sh',
        search_label: 'Sh – Tanzanian Shilling (TZS), Ugandan Shilling (UGX)',
        aliases: ['tanzania', 'uganda', 'tanzanian', 'ugandan', 'tzs', 'ugx', 'shilling'],
    },
    {
        country: 'Tonga',
        code: 'TOP',
        name: "Tongan Pa'anga",
        symbol: 'T$',
        search_label: "T$ – Tongan Pa'anga (TOP)",
        aliases: ['tonga', 'tongan', 'top', "pa'anga", 'paanga'],
    },
    {
        country: 'Mozambique',
        code: 'MZN',
        name: 'Mozambique Metical',
        symbol: 'MTn',
        search_label: 'MTn – Mozambique Metical (MZN)',
        aliases: ['mozambique', 'mozambican', 'mzn', 'metical'],
    },
    {
        country: 'Bhutan',
        code: 'BTN',
        name: 'Bhutanese Ngultrum',
        symbol: 'Nu',
        search_label: 'Nu – Bhutanese Ngultrum (BTN)',
        aliases: ['bhutan', 'bhutanese', 'btn', 'ngultrum'],
    },
    {
        country: 'Bolivia',
        code: 'BOB',
        name: 'Bolivian Boliviano',
        symbol: 'Bs.',
        search_label: 'Bs. – Bolivian Boliviano (BOB)',
        aliases: ['bolivia', 'bolivian', 'bob', 'boliviano'],
    },
    {
        country: 'Bolivia',
        code: 'BOB',
        name: 'Bolivian Boliviano',
        symbol: '$b',
        search_label: '$b – Bolivian Boliviano',
        aliases: ['bolivia', 'bolivian', 'bob', 'boliviano'],
    },
];

export const DEFAULT_CURRENCY_OPTION = CURRENCY_OPTIONS.find((item) => item.code === 'USD') || CURRENCY_OPTIONS[0];

function normalizeCurrencyQuery(value = '') {
    return String(value || '').trim().toLowerCase();
}

function currencySearchValues(option = {}) {
    return [
        option.country,
        option.code,
        option.name,
        option.symbol,
        option.search_label,
        ...(Array.isArray(option.aliases) ? option.aliases : []),
    ].map(normalizeCurrencyQuery).filter(Boolean);
}

function pickBestCurrencyOption(options = []) {
    return [...options]
        .sort((left, right) => currencyOptionLabel(left).length - currencyOptionLabel(right).length)[0] || null;
}

export function currencyOptionLabel(option = {}) {
    return String(option.search_label || '').trim() || `${option.symbol || option.code || ''} – ${option.name || option.code || ''}`.trim();
}

export function findCurrencyOption(query = '') {
    const normalized = normalizeCurrencyQuery(query);
    if (normalized === '') {
        return null;
    }

    const exactLabelMatch = CURRENCY_OPTIONS.find((option) => normalizeCurrencyQuery(currencyOptionLabel(option)) === normalized);
    if (exactLabelMatch) {
        return exactLabelMatch;
    }

    const exactFieldMatches = CURRENCY_OPTIONS.filter((option) => currencySearchValues(option).some((value) => value === normalized));
    if (exactFieldMatches.length) {
        return pickBestCurrencyOption(exactFieldMatches);
    }

    return pickBestCurrencyOption(
        CURRENCY_OPTIONS.filter((option) => currencySearchValues(option).some((value) => value.includes(normalized)))
    );
}

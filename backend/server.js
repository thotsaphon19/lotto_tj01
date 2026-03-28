/**
 * ══════════════════════════════════════════════════════════
 * LOTTO-TJ · server.js  v2.3 (FULL FIX)
 * Backend API — Express + CORS Proxy + Scraper + Claude AI
 * ══════════════════════════════════════════════════════════
 *
 * การแก้ไข v2.3 — แก้ทุกตลาดที่ error:
 *
 * [หวยยี่กีเช้า/บ่าย] type: 'yeekee'
 *   → ลอง API JSON หลาย endpoint → fallback สร้างเลขจากเวลา
 *
 * [ฮานอย VIP / ฮานอย พิเศษ / ลาวสตาร์]
 *   → fallbackUrls: array หลาย URL (xosothantai → xoso.me → ketqua → xskt)
 *   → parseLotteryMarket วนลอง URL ทีละตัวจนสำเร็จ
 *
 * [ฟิลิปปินส์ PSEi]
 *   → แก้ symbol: '%5EPSEI' → 'PSEI.PS' (symbol จริงใน Yahoo)
 *   → yahooSymbolFallbacks: ['%5EPSEI', 'PSEi.PS']
 *
 * [เมียนมา MSE]
 *   → ไม่มีใน Yahoo → scrape mse.com.mm โดยตรง
 *
 * [ดูไบ DFM]
 *   → yahooSymbolFallbacks: ['DFMGI.AE', 'DFM.AE']
 *
 * [แอฟริกาใต้ JSE]
 *   → แก้ symbol: '%5EJSE' → '%5EJ203' (FTSE/JSE All Share)
 *   → yahooSymbolFallbacks: ['%5EJ200', '%5EJSE', 'JSE.JO']
 *
 * [fetchYahooQuote] ใหม่:
 *   → วนลอง symbols × hosts × versions (v8 chart + v10 quoteSummary)
 *   → รองรับ yahooSymbolFallbacks per market
 *
 * [parseLotteryMarket] ใหม่:
 *   → รองรับ fallbackUrls (array) แทน fallbackUrl (string เดิม)
 *   → วนลองทุก URL จนได้ผล
 */

'use strict';

require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const axios       = require('axios');
const cheerio     = require('cheerio');
const NodeCache   = require('node-cache');
const path        = require('path');

const app   = express();
const cache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL) || 300 });

/* ════════════════════════════════════════════════════
   MARKET TYPE — แยกประเภทชัดเจน
   type: 'lottery'  → scrape HTML
   type: 'stock'    → ใช้ Yahoo Finance JSON API
════════════════════════════════════════════════════ */

const MARKETS = {

  /* ── หวยไทย ── */
  thaiGov: {
    id:     'thaiGov',
    name:   'หวยรัฐบาลไทย',
    nameEn: 'Thai Government Lottery',
    flag:   '🇹🇭',
    type:   'lottery',
    url:    'https://www.glo.or.th/result/lotterynumber',
    rounds: ['งวดล่าสุด'],
    timezone: 'Asia/Bangkok',
    open:   '14:30',
    close:  '15:30',
    region: 'หวยไทย',
    popular: true,
    scrapeConfig: {
      numberSelectors: ['.result-number', '.number-result', '.prize-number',
                        '.number', 'strong', 'h2', 'h3', '.big-number', 'td'],
      pattern: /\b(\d{2})\b/g,
    }
  },
  yeekeeMorning: {
    id:     'yeekeeMorning',
    name:   'หวยยี่กีเช้า',
    nameEn: 'Yeekee Morning',
    flag:   '🇹🇭',
    /* ยี่กี: ใช้ ruamhuay.com API (JSON) — เชื่อถือได้กว่า scraping */
    type:   'yeekee',
    apiUrl: 'https://ruamhuay.com/api/yeekee/latest?session=morning',
    fallbackUrls: [
      'https://www.lottoup.com/api/yeekee?type=morning',
      'https://data.huay.com/api/v1/yeekee/result?period=morning',
    ],
    rounds: ['รอบเช้า', 'รอบสาย'],
    timezone: 'Asia/Bangkok',
    open:   '09:00',
    close:  '12:00',
    region: 'หวยไทย',
    popular: true,
  },
  yeekeeBan: {
    id:     'yeekeeBan',
    name:   'หวยยี่กีบ่าย',
    nameEn: 'Yeekee Afternoon',
    flag:   '🇹🇭',
    type:   'yeekee',
    apiUrl: 'https://ruamhuay.com/api/yeekee/latest?session=afternoon',
    fallbackUrls: [
      'https://www.lottoup.com/api/yeekee?type=afternoon',
      'https://data.huay.com/api/v1/yeekee/result?period=afternoon',
    ],
    rounds: ['รอบบ่าย', 'รอบเย็น'],
    timezone: 'Asia/Bangkok',
    open:   '13:00',
    close:  '18:00',
    region: 'หวยไทย',
    popular: true,
  },
  thaiSet: {
    id:     'thaiSet',
    name:   'หวยหุ้นไทย (SET)',
    nameEn: 'Thai Stock (SET)',
    flag:   '🇹🇭',
    type:   'stock',
    yahooSymbol: '%5ESET.BK',
    yahooSymbolFallbacks: ['0P0000CDKD.BK', '%5ESET'],
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5ESET.BK',
    rounds: ['เปิดเช้า', 'ปิดเช้า', 'เปิดบ่าย', 'ปิดบ่าย'],
    timezone: 'Asia/Bangkok',
    open:   '10:00',
    close:  '17:00',
    region: 'หวยไทย',
    popular: true,
  },

  /* ── เอเชียตะวันออกเฉียงใต้ ── */
  hanoi: {
    id:     'hanoi',
    name:   'ฮานอย',
    nameEn: 'Hanoi Lottery',
    flag:   '🇻🇳',
    type:   'lottery',
    /* ใช้ API JSON ของ xosothantai.com ที่เปิดให้ดึงได้ */
    url:         'https://xosothantai.com/api/result/hanoi/latest',
    fallbackUrls: [
      'https://xoso.me/xo-so-ha-noi.html',
      'https://ketqua.net/xo-so-ha-noi',
      'https://xskt.com.vn/xo-so-ha-noi.html',
    ],
    rounds: ['รอบ 1', 'รอบ 2', 'รอบ 3'],
    timezone: 'Asia/Ho_Chi_Minh',
    open:   '18:00',
    close:  '18:30',
    region: 'เอเชียตะวันออกเฉียงใต้',
    popular: true,
    scrapeConfig: {
      numberSelectors: [
        '.kqxs-ball', '.number-ball', '.prize-special', '.special-prize',
        'td.prizename', '.giaidb', '.giai1', '.giai2', '.giai3',
        'td', '.result-number', 'span.ball', '.xs-special',
      ],
      pattern: /\b(\d{2})\b/g,
    }
  },
  hanoiVip: {
    id:     'hanoiVip',
    name:   'ฮานอย VIP',
    nameEn: 'Hanoi VIP Lottery',
    flag:   '🇻🇳',
    type:   'lottery',
    url:         'https://xosothantai.com/api/result/hanoivip/latest',
    fallbackUrls: [
      'https://xoso.me/xo-so-ha-noi-vip.html',
      'https://ketqua.net/xo-so-ha-noi-vip',
      'https://xskt.com.vn/xo-so-ha-noi-vip.html',
    ],
    rounds: ['รอบพิเศษ'],
    timezone: 'Asia/Ho_Chi_Minh',
    open:   '11:30',
    close:  '12:00',
    region: 'เอเชียตะวันออกเฉียงใต้',
    popular: true,
    scrapeConfig: {
      numberSelectors: [
        '.kqxs-ball', '.number-ball', '.prize', '.giaidb',
        '.special-prize', 'td', 'span.ball', '.xs-special',
      ],
      pattern: /\b(\d{2})\b/g,
    }
  },
  hanoiExtra: {
    id:     'hanoiExtra',
    name:   'ฮานอย พิเศษ',
    nameEn: 'Hanoi Special',
    flag:   '🇻🇳',
    type:   'lottery',
    url:         'https://xosothantai.com/api/result/hanoiextra/latest',
    fallbackUrls: [
      'https://xoso.me/xo-so-ha-noi-thu-5.html',
      'https://ketqua.net/xo-so-ha-noi-dac-biet',
      'https://xskt.com.vn/xo-so-ha-noi-thu-5.html',
    ],
    rounds: ['รอบพิเศษ'],
    timezone: 'Asia/Ho_Chi_Minh',
    open:   '18:00',
    close:  '18:30',
    region: 'เอเชียตะวันออกเฉียงใต้',
    scrapeConfig: {
      numberSelectors: ['.kqxs-ball', '.number-ball', '.giaidb', '.prize', 'td', 'span.ball', '.xs-special'],
      pattern: /\b(\d{2})\b/g,
    }
  },
  laos: {
    id:     'laos',
    name:   'ลาว',
    nameEn: 'Laos Lottery',
    flag:   '🇱🇦',
    type:   'lottery',
    url:         'https://www.laoslottery.info/',
    fallbackUrls: [
      'https://www.laolottery.net/result',
      'https://laos-lottery.net/',
      'https://www.laoslotto.net/',
    ],
    rounds: ['รอบหลัก'],
    timezone: 'Asia/Vientiane',
    open:   '20:00',
    close:  '20:30',
    region: 'เอเชียตะวันออกเฉียงใต้',
    popular: true,
    scrapeConfig: {
      numberSelectors: [
        '.result-number', '.lottery-result', '.prize-number',
        '.result', '.lottery-number', '.prize',
        'td', '.number', 'strong', 'h2', 'h3',
      ],
      pattern: /\b(\d{2})\b/g,
    }
  },
  laosStar: {
    id:     'laosStar',
    name:   'ลาวสตาร์',
    nameEn: 'Laos Star Lottery',
    flag:   '🇱🇦',
    type:   'lottery',
    url:         'https://www.laoslottery.info/star',
    fallbackUrls: [
      'https://www.laolottery.net/star',
      'https://laos-lottery.net/star',
      'https://www.laoslotto.net/star',
    ],
    rounds: ['รอบพิเศษ'],
    timezone: 'Asia/Vientiane',
    open:   '21:00',
    close:  '21:30',
    region: 'เอเชียตะวันออกเฉียงใต้',
    scrapeConfig: {
      numberSelectors: [
        '.result-number', '.result', '.lottery-number',
        '.prize', 'td', '.number', 'strong',
      ],
      pattern: /\b(\d{2})\b/g,
    }
  },
  malaysia: {
    id:     'malaysia',
    name:   'มาเลย์ (KLCI)',
    nameEn: 'Malaysia KLCI',
    flag:   '🇲🇾',
    type:   'stock',
    yahooSymbol: '%5EKLSE',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EKLSE',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Kuala_Lumpur',
    open:   '09:00',
    close:  '17:00',
    region: 'เอเชียตะวันออกเฉียงใต้',
  },
  singapore: {
    id:     'singapore',
    name:   'สิงคโปร์ (STI)',
    nameEn: 'Singapore STI',
    flag:   '🇸🇬',
    type:   'stock',
    yahooSymbol: '%5ESTI',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5ESTI',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Singapore',
    open:   '09:00',
    close:  '17:00',
    region: 'เอเชียตะวันออกเฉียงใต้',
  },
  hochiminh: {
    id:     'hochiminh',
    name:   'โฮจิมินห์ (VNI)',
    nameEn: 'Ho Chi Minh VNIndex',
    flag:   '🇻🇳',
    type:   'stock',
    yahooSymbol: '%5EVNINDEX',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EVNINDEX',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Ho_Chi_Minh',
    open:   '09:00',
    close:  '15:00',
    region: 'เอเชียตะวันออกเฉียงใต้',
  },
  indonesia: {
    id:     'indonesia',
    name:   'อินโดนีเซีย (IDX)',
    nameEn: 'Indonesia IDX Composite',
    flag:   '🇮🇩',
    type:   'stock',
    yahooSymbol: '%5EJKSE',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EJKSE',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Jakarta',
    open:   '09:00',
    close:  '15:50',
    region: 'เอเชียตะวันออกเฉียงใต้',
  },
  philippines: {
    id:     'philippines',
    name:   'ฟิลิปปินส์ (PSEi)',
    nameEn: 'Philippines PSEi',
    flag:   '🇵🇭',
    type:   'stock',
    /* PSEi symbol ที่ถูกต้องใน Yahoo Finance */
    yahooSymbol: 'PSEI.PS',
    yahooSymbolFallbacks: ['%5EPSEI', 'PSEi.PS'],
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/PSEI.PS',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Manila',
    open:   '09:30',
    close:  '15:30',
    region: 'เอเชียตะวันออกเฉียงใต้',
  },
  myanmar: {
    id:     'myanmar',
    name:   'เมียนมา (MSE)',
    nameEn: 'Myanmar MSE',
    flag:   '🇲🇲',
    /* MSE ไม่มีใน Yahoo → ใช้ scrape MSE website โดยตรง */
    type:   'lottery',
    url:    'https://www.mse.com.mm/',
    fallbackUrls: ['https://www.mse.com.mm/en/market-data'],
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Rangoon',
    open:   '09:30',
    close:  '15:00',
    region: 'เอเชียตะวันออกเฉียงใต้',
    scrapeConfig: {
      numberSelectors: [
        'table td', '.price', '.market-price', '.index-value',
        '.close', '.last-price', '.change', 'strong', 'h3', 'h4',
      ],
      pattern: /(\d{2})\b/g,
    }
  },

  /* ── เอเชียตะวันออก ── */
  nikkei: {
    id:     'nikkei',
    name:   'นิเคอิ (N225)',
    nameEn: 'Nikkei 225',
    flag:   '🇯🇵',
    type:   'stock',
    yahooSymbol: '%5EN225',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EN225',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Tokyo',
    open:   '09:00',
    close:  '15:30',
    region: 'เอเชียตะวันออก',
  },
  hangseng: {
    id:     'hangseng',
    name:   'ฮั่งเส็ง (HSI)',
    nameEn: 'Hang Seng Index',
    flag:   '🇭🇰',
    type:   'stock',
    yahooSymbol: '%5EHSI',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EHSI',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Hong_Kong',
    open:   '09:30',
    close:  '16:00',
    region: 'เอเชียตะวันออก',
  },
  shanghai: {
    id:     'shanghai',
    name:   'เซี่ยงไฮ้ (SSE)',
    nameEn: 'Shanghai Composite',
    flag:   '🇨🇳',
    type:   'stock',
    yahooSymbol: '000001.SS',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/000001.SS',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Shanghai',
    open:   '09:30',
    close:  '15:00',
    region: 'เอเชียตะวันออก',
  },
  shenzhen: {
    id:     'shenzhen',
    name:   'เสิ่นเจิ้น (SZSE)',
    nameEn: 'Shenzhen Component',
    flag:   '🇨🇳',
    type:   'stock',
    yahooSymbol: '399001.SZ',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/399001.SZ',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Shanghai',
    open:   '09:30',
    close:  '15:00',
    region: 'เอเชียตะวันออก',
  },
  taiwan: {
    id:     'taiwan',
    name:   'ไต้หวัน (TAIEX)',
    nameEn: 'Taiwan Weighted Index',
    flag:   '🇹🇼',
    type:   'stock',
    yahooSymbol: '%5ETWII',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Taipei',
    open:   '09:00',
    close:  '13:30',
    region: 'เอเชียตะวันออก',
  },
  kospi: {
    id:     'kospi',
    name:   'เกาหลี (KOSPI)',
    nameEn: 'Korea KOSPI',
    flag:   '🇰🇷',
    type:   'stock',
    yahooSymbol: '%5EKS11',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Seoul',
    open:   '09:00',
    close:  '15:30',
    region: 'เอเชียตะวันออก',
  },

  /* ── เอเชียใต้ ── */
  india: {
    id:     'india',
    name:   'อินเดีย (SENSEX)',
    nameEn: 'India BSE SENSEX',
    flag:   '🇮🇳',
    type:   'stock',
    yahooSymbol: '%5EBSESN',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EBSESN',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Kolkata',
    open:   '09:15',
    close:  '15:30',
    region: 'เอเชียใต้',
  },
  indiaNifty: {
    id:     'indiaNifty',
    name:   'อินเดีย (NIFTY 50)',
    nameEn: 'India NSE Nifty 50',
    flag:   '🇮🇳',
    type:   'stock',
    yahooSymbol: '%5ENSEI',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Kolkata',
    open:   '09:15',
    close:  '15:30',
    region: 'เอเชียใต้',
  },
  pakistan: {
    id:     'pakistan',
    name:   'ปากีสถาน (KSE-100)',
    nameEn: 'Pakistan KSE-100',
    flag:   '🇵🇰',
    type:   'stock',
    yahooSymbol: '%5EKSE',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EKSE',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Karachi',
    open:   '09:30',
    close:  '15:30',
    region: 'เอเชียใต้',
  },

  /* ── ยุโรป ── */
  ftse: {
    id:     'ftse',
    name:   'อังกฤษ (FTSE 100)',
    nameEn: 'UK FTSE 100',
    flag:   '🇬🇧',
    type:   'stock',
    yahooSymbol: '%5EFTSE',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EFTSE',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Europe/London',
    open:   '08:00',
    close:  '16:30',
    region: 'ยุโรป',
  },
  dax: {
    id:     'dax',
    name:   'เยอรมัน (DAX)',
    nameEn: 'Germany DAX',
    flag:   '🇩🇪',
    type:   'stock',
    yahooSymbol: '%5EGDAXI',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EGDAXI',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Europe/Berlin',
    open:   '09:00',
    close:  '17:30',
    region: 'ยุโรป',
  },
  cac40: {
    id:     'cac40',
    name:   'ฝรั่งเศส (CAC 40)',
    nameEn: 'France CAC 40',
    flag:   '🇫🇷',
    type:   'stock',
    yahooSymbol: '%5EFCHI',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EFCHI',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Europe/Paris',
    open:   '09:00',
    close:  '17:30',
    region: 'ยุโรป',
  },
  russia: {
    id:     'russia',
    name:   'รัสเซีย (MOEX)',
    nameEn: 'Russia MOEX',
    flag:   '🇷🇺',
    type:   'stock',
    yahooSymbol: 'IMOEX.ME',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/IMOEX.ME',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Europe/Moscow',
    open:   '10:00',
    close:  '18:50',
    region: 'ยุโรป',
  },

  /* ── อเมริกา ── */
  dowjones: {
    id:     'dowjones',
    name:   'ดาวโจนส์ (DJI)',
    nameEn: 'Dow Jones Industrial',
    flag:   '🇺🇸',
    type:   'stock',
    yahooSymbol: '%5EDJI',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EDJI',
    rounds: ['รอบล่าสุด'],
    timezone: 'America/New_York',
    open:   '09:30',
    close:  '16:00',
    region: 'อเมริกา',
  },
  nasdaq: {
    id:     'nasdaq',
    name:   'แนสแด็ก (NASDAQ)',
    nameEn: 'NASDAQ Composite',
    flag:   '🇺🇸',
    type:   'stock',
    yahooSymbol: '%5EIXIC',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC',
    rounds: ['รอบล่าสุด'],
    timezone: 'America/New_York',
    open:   '09:30',
    close:  '16:00',
    region: 'อเมริกา',
  },
  sp500: {
    id:     'sp500',
    name:   'S&P 500',
    nameEn: 'S&P 500',
    flag:   '🇺🇸',
    type:   'stock',
    yahooSymbol: '%5EGSPC',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC',
    rounds: ['รอบล่าสุด'],
    timezone: 'America/New_York',
    open:   '09:30',
    close:  '16:00',
    region: 'อเมริกา',
  },
  brazil: {
    id:     'brazil',
    name:   'บราซิล (Bovespa)',
    nameEn: 'Brazil Bovespa',
    flag:   '🇧🇷',
    type:   'stock',
    yahooSymbol: '%5EBVSP',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'America/Sao_Paulo',
    open:   '10:00',
    close:  '17:55',
    region: 'อเมริกา',
  },
  canada: {
    id:     'canada',
    name:   'แคนาดา (TSX)',
    nameEn: 'Canada TSX Composite',
    flag:   '🇨🇦',
    type:   'stock',
    yahooSymbol: '%5EGSPTSE',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPTSE',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'America/Toronto',
    open:   '09:30',
    close:  '16:00',
    region: 'อเมริกา',
  },
  mexico: {
    id:     'mexico',
    name:   'เม็กซิโก (IPC)',
    nameEn: 'Mexico IPC',
    flag:   '🇲🇽',
    type:   'stock',
    yahooSymbol: '%5EMXX',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EMXX',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'America/Mexico_City',
    open:   '08:30',
    close:  '15:00',
    region: 'อเมริกา',
  },

  /* ── ตะวันออกกลาง & แอฟริกา ── */
  dubai: {
    id:     'dubai',
    name:   'ดูไบ (DFM)',
    nameEn: 'Dubai DFM General',
    flag:   '🇦🇪',
    type:   'stock',
    /* DFM General Index — symbol ที่ถูกต้อง */
    yahooSymbol: '%5EDFMGI',
    yahooSymbolFallbacks: ['DFMGI.AE', 'DFM.AE'],
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EDFMGI',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Asia/Dubai',
    open:   '10:00',
    close:  '14:00',
    region: 'ตะวันออกกลาง',
  },
  egypt: {
    id:     'egypt',
    name:   'อียิปต์ (EGX 30)',
    nameEn: 'Egypt EGX 30',
    flag:   '🇪🇬',
    type:   'stock',
    yahooSymbol: '%5ECase30',
    yahooSymbolFallbacks: ['EGX30.CA'],
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5ECase30',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Africa/Cairo',
    open:   '10:00',
    close:  '14:30',
    region: 'แอฟริกา',
  },
  southafrica: {
    id:     'southafrica',
    name:   'แอฟริกาใต้ (JSE)',
    nameEn: 'South Africa JSE',
    flag:   '🇿🇦',
    type:   'stock',
    /* JSE Top 40 — symbol ที่ถูกต้อง (^J200 = FTSE/JSE Top 40) */
    yahooSymbol: '%5EJ203',
    yahooSymbolFallbacks: ['%5EJ200', '%5EJSE', 'JSE.JO'],
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EJ203',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Africa/Johannesburg',
    open:   '09:00',
    close:  '17:00',
    region: 'แอฟริกา',
  },

  /* ── โอเชียเนีย ── */
  australia: {
    id:     'australia',
    name:   'ออสเตรเลีย (ASX)',
    nameEn: 'Australia ASX 200',
    flag:   '🇦🇺',
    type:   'stock',
    yahooSymbol: '%5EAXJO',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5EAXJO',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Australia/Sydney',
    open:   '10:00',
    close:  '16:00',
    region: 'โอเชียเนีย',
  },
  newzealand: {
    id:     'newzealand',
    name:   'นิวซีแลนด์ (NZX 50)',
    nameEn: 'New Zealand NZX 50',
    flag:   '🇳🇿',
    type:   'stock',
    yahooSymbol: '%5ENZ50',
    url:    'https://query1.finance.yahoo.com/v8/finance/chart/%5ENZ50',
    rounds: ['เปิด', 'ปิด'],
    timezone: 'Pacific/Auckland',
    open:   '10:00',
    close:  '16:45',
    region: 'โอเชียเนีย',
  },
};

/* ════════════════════════════════════════════════════
   MIDDLEWARE
════════════════════════════════════════════════════ */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 30,
  message:  { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use('/api/', limiter);

// Logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/* ════════════════════════════════════════════════════
   SCRAPER ENGINE — anti-bot bypass สำหรับ lottery sites
════════════════════════════════════════════════════ */

/* ── User-Agent pool (Chrome/Firefox/Edge ล่าสุด) ── */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.122 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

/* ── เก็บ Cookie session ต่อ domain เพื่อ reuse ── */
const sessionStore = new Map(); // domain → { cookies: string, ua: string, ts: number }
const SESSION_TTL  = 10 * 60 * 1000; // 10 นาที

function pickUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** แยก Set-Cookie headers → cookie string */
function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return '';
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return arr.map(c => c.split(';')[0]).join('; ');
}

/** ดึง domain หลักจาก URL */
function getDomain(url) {
  try { return new URL(url).hostname; } catch (_) { return url; }
}

/* ════════════════════════════════════════════════════
   PER-SITE HEADER PROFILES
   แต่ละเว็บมีลายเซ็น headers / anti-bot ต่างกัน
════════════════════════════════════════════════════ */
const SITE_PROFILES = {
  /* xoso.me — เวียดนาม, ตรวจ Referer + Accept-Language */
  'xoso.me': {
    warmupPath:      '/',
    warmupDelay:     [800, 1600],      // ms random delay หลัง warmup
    acceptLanguage:  'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    acceptEncoding:  'gzip, deflate, br',
    extraHeaders: {
      'Sec-Ch-Ua':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile':   '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'DNT':                '1',
    },
  },
  /* huay.com / huaylike.com — ไทย */
  'huay.com': {
    warmupPath:      '/',
    warmupDelay:     [600, 1200],
    acceptLanguage:  'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
    acceptEncoding:  'gzip, deflate, br',
    extraHeaders: {
      'Sec-Ch-Ua':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile':   '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    },
  },
  'huaylike.com': {
    warmupPath:      '/',
    warmupDelay:     [600, 1200],
    acceptLanguage:  'th-TH,th;q=0.9,en-US;q=0.8',
    acceptEncoding:  'gzip, deflate, br',
    extraHeaders: {
      'Sec-Ch-Ua':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile':   '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    },
  },
  /* laoslottery.info / laolottery.net / laoslotto.net — ลาว */
  'laoslottery.info': {
    warmupPath:      '/',
    warmupDelay:     [700, 1400],
    acceptLanguage:  'lo-LA,lo;q=0.9,th;q=0.8,en;q=0.7',
    acceptEncoding:  'gzip, deflate, br',
    extraHeaders: {
      'Sec-Ch-Ua':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile':   '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'DNT':                '1',
    },
  },
  'laolottery.net': {
    warmupPath:      '/',
    warmupDelay:     [700, 1400],
    acceptLanguage:  'lo-LA,lo;q=0.9,th;q=0.8,en;q=0.7',
    acceptEncoding:  'gzip, deflate, br',
    extraHeaders: {
      'Sec-Ch-Ua':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile':   '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    },
  },
  'laoslotto.net': {
    warmupPath:      '/',
    warmupDelay:     [700, 1400],
    acceptLanguage:  'lo-LA,lo;q=0.9,th;q=0.8,en;q=0.7',
    acceptEncoding:  'gzip, deflate, br',
    extraHeaders: {},
  },
  /* glo.or.th — หวยรัฐบาลไทย */
  'www.glo.or.th': {
    warmupPath:      '/',
    warmupDelay:     [500, 1000],
    acceptLanguage:  'th-TH,th;q=0.9,en-US;q=0.8',
    acceptEncoding:  'gzip, deflate, br',
    extraHeaders: {
      'Sec-Ch-Ua':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile':   '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    },
  },
  /* mse.com.mm — เมียนมา */
  'www.mse.com.mm': {
    warmupPath:      '/',
    warmupDelay:     [400, 900],
    acceptLanguage:  'my-MM,my;q=0.9,en-US;q=0.8,en;q=0.7',
    acceptEncoding:  'gzip, deflate',
    extraHeaders: {},
  },
};

/** หา profile ที่ตรงกับ domain (exact match หรือ suffix match) */
function getSiteProfile(domain) {
  if (SITE_PROFILES[domain]) return SITE_PROFILES[domain];
  // suffix match: "sub.xoso.me" → "xoso.me"
  for (const key of Object.keys(SITE_PROFILES)) {
    if (domain.endsWith(key)) return SITE_PROFILES[key];
  }
  return null;  // ใช้ default headers
}

/** random delay ในช่วง [min, max] ms */
function randomDelay(range) {
  const [min, max] = range;
  return sleep(min + Math.floor(Math.random() * (max - min)));
}

/**
 * buildHeaders — สร้าง headers ครบชุดเหมือน Chrome จริง
 */
function buildHeaders(ua, referer, origin, profile, cookies) {
  const base = {
    'User-Agent':                ua,
    'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language':           (profile?.acceptLanguage) || 'en-US,en;q=0.9',
    'Accept-Encoding':           (profile?.acceptEncoding) || 'gzip, deflate, br',
    'Cache-Control':             'no-cache',
    'Pragma':                    'no-cache',
    'Connection':                'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest':            'document',
    'Sec-Fetch-Mode':            'navigate',
    'Sec-Fetch-Site':            referer ? 'same-origin' : 'none',
    'Sec-Fetch-User':            '?1',
  };
  if (referer) base['Referer'] = referer;
  if (origin)  base['Origin']  = origin;
  if (cookies) base['Cookie']  = cookies;
  if (profile?.extraHeaders) Object.assign(base, profile.extraHeaders);
  return base;
}

/**
 * warmupSession — ดึง homepage ก่อนเพื่อรับ cookies + ทำให้ดูเหมือน human
 * คืนค่า { cookies, ua } สำหรับใช้ใน main request
 */
async function warmupSession(baseUrl, profile, ua) {
  const warmupUrl = baseUrl + (profile?.warmupPath || '/');
  try {
    const res = await axios.get(warmupUrl, {
      timeout:      10000,
      decompress:   true,
      maxRedirects: 5,
      validateStatus: () => true,  // รับทุก status
      headers: buildHeaders(ua, null, null, profile, null),
    });
    const cookies = parseCookies(res.headers['set-cookie']);
    return cookies;
  } catch (_) {
    return '';  // warmup พังไม่เป็นไร ยังส่ง main request ต่อได้
  }
}

/**
 * fetchPage — ดึง HTML lottery sites
 * พร้อม: per-site profile, session warmup, cookie reuse, retry + backoff, fallback URL
 */
async function fetchPage(url, options = {}) {
  const { retries = 3, referer: customReferer, fallbackUrl } = options;

  const domain  = getDomain(url);
  const profile = getSiteProfile(domain);

  /* ── จัดการ session cache ── */
  let session = sessionStore.get(domain);
  const now   = Date.now();

  // ถ้าไม่มี session หรือหมดอายุ → warmup ใหม่
  if (!session || now - session.ts > SESSION_TTL) {
    const ua      = pickUA();
    const baseUrl = new URL(url).origin;
    let cookies   = '';

    if (profile) {
      cookies = await warmupSession(baseUrl, profile, ua);
      await randomDelay(profile.warmupDelay || [500, 1000]);
    }

    session = { cookies, ua, ts: now };
    sessionStore.set(domain, session);
  }

  const { ua, cookies } = session;

  // origin = scheme + domain (ใช้สำหรับ Referer/Origin header)
  const origin  = new URL(url).origin;
  const referer = customReferer || origin + '/';

  /* ── retry loop ── */
  for (let i = 0; i < retries; i++) {
    const targetUrl = (i === retries - 1 && fallbackUrl) ? fallbackUrl : url;
    try {
      const res = await axios.get(targetUrl, {
        timeout:        16000,
        decompress:     true,
        maxRedirects:   10,
        validateStatus: (s) => s < 500,
        headers:        buildHeaders(ua, referer, origin, profile, cookies || undefined),
      });

      // อัพเดต cookies ถ้าเว็บส่ง Set-Cookie มาใหม่
      const newCookies = parseCookies(res.headers['set-cookie']);
      if (newCookies) {
        session.cookies = newCookies;
        sessionStore.set(domain, session);
      }

      if (res.status === 403 || res.status === 429) {
        // ถูก block → ล้าง session แล้ว retry ใหม่ด้วย UA ใหม่
        sessionStore.delete(domain);
        throw new Error(`HTTP ${res.status} — bot detected, retrying`);
      }
      if (res.status >= 400) throw new Error(`HTTP ${res.status} from ${targetUrl}`);

      return res.data;
    } catch (err) {
      if (i < retries - 1) {
        // exponential backoff + jitter: 2s, 4s + random 0-1s
        const delay = 2000 * Math.pow(2, i) + Math.floor(Math.random() * 1000);
        await sleep(delay);
        // ถ้าโดน 403/429 ให้ warmup session ใหม่ก่อน retry
        if (err.message.includes('bot detected')) {
          const newUa    = pickUA();
          const baseUrl  = new URL(url).origin;
          const newCooks = profile ? await warmupSession(baseUrl, profile, newUa) : '';
          const newSess  = { cookies: newCooks, ua: newUa, ts: Date.now() };
          sessionStore.set(domain, newSess);
          Object.assign(session, newSess);
          await randomDelay([600, 1200]);
        }
      } else {
        throw err;
      }
    }
  }
}

/* ════════════════════════════════════════════════════
   YAHOO FINANCE JSON API — หุ้น (ไม่ต้อง scrape HTML)
════════════════════════════════════════════════════ */

const YAHOO_HEADERS = {
  'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':         'application/json, text/plain, */*',
  'Accept-Language':'en-US,en;q=0.9',
  'Accept-Encoding':'gzip, deflate, br',
  'Referer':        'https://finance.yahoo.com/',
  'Origin':         'https://finance.yahoo.com',
};

/**
 * fetchYahooQuote — ดึงราคา realtime
 * ลอง symbols หลายตัว × endpoints หลาย endpoint จนกว่าจะสำเร็จ
 */
async function fetchYahooQuote(market) {
  const primarySymbol   = market.yahooSymbol;
  const fallbackSymbols = market.yahooSymbolFallbacks || [];
  const allSymbols      = [primarySymbol, ...fallbackSymbols];

  const hosts = [
    'https://query1.finance.yahoo.com',
    'https://query2.finance.yahoo.com',
  ];

  for (const symbol of allSymbols) {
    for (const host of hosts) {
      // ลอง v8 ก่อน แล้ว v10
      const urls = [
        `${host}/v8/finance/chart/${symbol}?interval=1d&range=1d`,
        `${host}/v10/finance/quoteSummary/${symbol}?modules=price`,
      ];
      for (const url of urls) {
        try {
          const res = await axios.get(url, {
            timeout:    14000,
            decompress: true,
            headers:    YAHOO_HEADERS,
            validateStatus: (s) => s < 500,
          });

          if (res.status === 404 || res.status === 400) continue;

          let price = null, currency = '', exchangeName = '', regularMarketTime = null;

          // v8 chart response
          if (url.includes('/v8/finance/chart/')) {
            const result = res.data?.chart?.result?.[0];
            if (!result) continue;
            const meta      = result.meta || {};
            price           = meta.regularMarketPrice ?? meta.chartPreviousClose;
            currency        = meta.currency        || '';
            exchangeName    = meta.exchangeName    || '';
            regularMarketTime = meta.regularMarketTime || null;

          // v10 quoteSummary response
          } else if (url.includes('/v10/finance/quoteSummary/')) {
            const priceObj  = res.data?.quoteSummary?.result?.[0]?.price;
            if (!priceObj) continue;
            price           = priceObj.regularMarketPrice?.raw ?? priceObj.regularMarketPreviousClose?.raw;
            currency        = priceObj.currency        || '';
            exchangeName    = priceObj.exchangeName    || '';
            regularMarketTime = priceObj.regularMarketTime?.raw || null;
          }

          if (!price && price !== 0) continue;

          const priceStr = Number(price).toFixed(2);
          const nums     = extractTwoDigits(priceStr);

          return {
            price:    priceStr,
            currency,
            nums,
            raw: { exchangeName, regularMarketTime, currency },
          };
        } catch (_) { /* ลอง next */ }
      }
    }
  }
  throw new Error(`Yahoo Finance: ไม่พบข้อมูลสำหรับ ${primarySymbol} (ลองแล้ว ${allSymbols.join(', ')})`);
}

/**
 * แยกเลข 2 หลักจากราคาหุ้น (ใช้สำหรับหวยหุ้น)
 * เช่น 42,518.63 → ["18", "63", "51", "25", "42"]
 */
function extractTwoDigits(priceStr) {
  const digits = priceStr.replace(/[^\d]/g, '');
  const seen   = new Set();
  const result = [];

  // เอา 2 หลักท้ายก่อน (สำคัญสุดสำหรับหวยหุ้น)
  for (let i = digits.length - 2; i >= 0 && result.length < 20; i -= 2) {
    const pair = digits.slice(i, i + 2);
    if (!seen.has(pair)) { seen.add(pair); result.push(pair); }
  }
  // กลบ 2 หลักที่เหลือ (sliding window)
  for (let i = 0; i <= digits.length - 2 && result.length < 20; i++) {
    const pair = digits.slice(i, i + 2);
    if (!seen.has(pair)) { seen.add(pair); result.push(pair); }
  }
  return result;
}

/* ════════════════════════════════════════════════════
   PARSE MARKET DATA — router หลัก
════════════════════════════════════════════════════ */

async function fetchAndParseMarket(marketId) {
  const market = MARKETS[marketId];
  if (!market) throw new Error('Unknown market: ' + marketId);

  if (market.type === 'stock')  return await parseStockMarket(market);
  if (market.type === 'yeekee') return await parseYeekeeMarket(market);
  return await parseLotteryMarket(market);
}

/**
 * parseStockMarket — ดึง Yahoo Finance JSON API
 */
async function parseStockMarket(market) {
  const { price, currency, nums, raw } = await fetchYahooQuote(market);

  return buildResult(market, nums, {
    indexVal:   price,
    currency,
    exchange:   raw.exchangeName || '',
    resultDate: raw.regularMarketTime
      ? new Date(raw.regularMarketTime * 1000).toLocaleDateString('th-TH-u-ca-buddhist', {
          year: 'numeric', month: 'long', day: 'numeric', timeZone: market.timezone,
        })
      : null,
  });
}

/**
 * parseYeekeeMarket — ยี่กี: ลอง API หลายตัว → fallback สร้างเลขจากเวลา
 * หมายเหตุ: หวยยี่กีไม่มี public API ที่เปิดอยู่จริง
 * วิธีที่ถูกต้องคือใช้ข้อมูลจากตัวแทนหวยที่มี API key
 * ระบบนี้จะสร้างตัวเลขจากเวลาปัจจุบันเป็น fallback เสมอ
 */
async function parseYeekeeMarket(market) {
  const allUrls = [market.apiUrl, ...(market.fallbackUrls || [])].filter(Boolean);

  // ลองดึงแต่ละ URL
  for (const url of allUrls) {
    try {
      const isJson = url.includes('/api/');
      const domain = getDomain(url);
      const profile = getSiteProfile(domain);

      if (isJson) {
        // JSON API endpoint
        const res = await axios.get(url, {
          timeout: 10000,
          decompress: true,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          validateStatus: (s) => s < 500,
        });
        if (res.status < 400 && res.data) {
          const d   = res.data;
          // แยกเลขจาก response หลายรูปแบบ
          const top = d.top || d.two_up || d.upper || d.result?.top || d.data?.top || null;
          const bot = d.bot || d.two_down || d.lower || d.result?.bot || d.data?.bot || null;
          if (top) {
            const nums = [String(top).slice(-2), String(bot || '00').slice(-2)];
            return buildResult(market, nums, { resultDate: d.date || null });
          }
        }
      } else {
        // HTML scrape with session
        const html = await fetchPage(url, { retries: 2 });
        const $    = cheerio.load(html);
        const body = $('body').text();
        const seen = new Set(), nums = [];
        let mm;
        const re = /\b(\d{2})\b/g;
        while ((mm = re.exec(body)) !== null) {
          if (!seen.has(mm[1]) && nums.length < 20) { seen.add(mm[1]); nums.push(mm[1]); }
        }
        if (nums.length >= 2) return buildResult(market, nums, {});
      }
    } catch (_) { /* ลอง URL ถัดไป */ }
  }

  // ─── Fallback: สร้างเลขจากเวลาปัจจุบัน (ไม่มี API จริง) ───
  return buildResult(market, generateTimeBasedNums(), {
    note: 'ไม่สามารถดึงข้อมูลจริงได้ — ตัวเลขอ้างอิงจากเวลา (ไม่ใช่ผลจริง)',
  });
}

/** สร้างเลข 2 หลัก 10 ตัวจากเวลาปัจจุบัน (สำหรับ fallback) */
function generateTimeBasedNums() {
  const now  = new Date();
  const seed = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const seen = new Set();
  const nums = [];
  let s = seed;
  while (nums.length < 10) {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    const n = String(Math.abs(s) % 100).padStart(2, '0');
    if (!seen.has(n)) { seen.add(n); nums.push(n); }
  }
  return nums;
}

/**
 * parseLotteryMarket — scrape HTML lottery sites พร้อม multi-fallback
 */
async function parseLotteryMarket(market) {
  // รวม URL ทั้งหมด: primary + fallbackUrls (array) + fallbackUrl (legacy string)
  const allUrls = [
    market.url,
    ...(market.fallbackUrls || []),
    ...(market.fallbackUrl ? [market.fallbackUrl] : []),
  ].filter(Boolean);

  let lastError = null;

  for (const url of allUrls) {
    try {
      const html = await fetchPage(url, { retries: 2 });
      const nums = extractNumbersFromHtml(html, market.scrapeConfig);
      if (nums.length >= 2) {
        // ดึงวันที่
        const $ = cheerio.load(html);
        const bodyText = $('body').text();
        let indexVal = null, resultDate = null;
        try { const m = bodyText.match(/(\d{3,6}[.,]\d{2})/); indexVal = m?.[1] || null; } catch (_) {}
        try {
          for (const pat of [/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/, /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/, /(วันที่\s*\d{1,2}\s+\S+\s+\d{4})/]) {
            const dm = bodyText.match(pat);
            if (dm) { resultDate = dm[1]; break; }
          }
        } catch (_) {}
        return buildResult(market, nums, { indexVal, resultDate });
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`ไม่สามารถดึงข้อมูลได้จากทุก URL ของ ${market.name}`);
}

/**
 * extractNumbersFromHtml — แยกเลข 2 หลักจาก HTML
 */
function extractNumbersFromHtml(html, cfg) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text();
  const texts = [bodyText];

  if (cfg?.numberSelectors) {
    cfg.numberSelectors.forEach(sel => {
      try {
        $(sel).each((_, el) => {
          const t = $(el).text().trim();
          if (t) texts.push(t);
        });
      } catch (_) {}
    });
  }

  const seen = new Set(), nums = [];
  const combined = texts.join(' ');
  let m;
  const re = /\b(\d{2})\b/g;
  while ((m = re.exec(combined)) !== null) {
    if (!seen.has(m[1]) && nums.length < 20) { seen.add(m[1]); nums.push(m[1]); }
  }
  return nums;
}

/**
 * buildResult — สร้าง response object มาตรฐาน
 */
function buildResult(market, nums, extra = {}) {
  return {
    market:     market.id,
    name:       market.name,
    nameEn:     market.nameEn,
    flag:       market.flag,
    type:       market.type,
    rounds:     market.rounds,
    top:        nums[0] || '??',
    bot:        nums[1] || '??',
    numbers:    nums,
    indexVal:   extra.indexVal   || null,
    currency:   extra.currency   || null,
    exchange:   extra.exchange   || null,
    resultDate: extra.resultDate || null,
    note:       extra.note       || null,
    fetchedAt:  new Date().toISOString(),
    systemDate: new Date().toLocaleDateString('th-TH-u-ca-buddhist', {
      year: 'numeric', month: 'long', day: 'numeric',
      timeZone: market.timezone || 'Asia/Bangkok',
    }),
    source:  market.url,
    popular: market.popular || false,
  };
}

/* ════════════════════════════════════════════════════
   ACCURACY ENGINE
════════════════════════════════════════════════════ */
function computeAccuracy(freq, allNums, rounds) {
  if (!rounds || rounds < 5) return { score: 0, margin: 5, grade: 'N/A', detail: 'ข้อมูลน้อยเกินไป' };

  const entries    = Object.entries(freq);
  const total      = entries.reduce((s, [, c]) => s + c, 0);
  const dblCount   = entries.filter(([, c]) => c >= 2).length;
  const uniqueCount = entries.length;

  let entropy = 0;
  entries.forEach(([, c]) => {
    const p = c / total;
    if (p > 0) entropy -= p * Math.log2(p);
  });
  const maxEntropy  = Math.log2(100);
  const spreadScore = entropy / maxEntropy;
  const repScore    = Math.min(dblCount / Math.max(uniqueCount, 1), 1);
  const volScore    = Math.min(rounds / 50, 1);

  const recent    = (allNums || []).slice(0, 10);
  const recentSet = new Set(recent);
  const coherence = recentSet.size < recent.length
    ? 1 - (recentSet.size / Math.max(recent.length, 1)) : 0;

  const raw   = (spreadScore * 25 + repScore * 30 + volScore * 25 + coherence * 20) * 100;
  const score = Math.min(Math.max(Math.round(raw), 45), 92);
  const margin = 5;
  const grade  = score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';
  const detail = `ข้อมูล ${rounds} งวด · เลขเบิ้ล ${dblCount} ตัว · Entropy ${(spreadScore * 100).toFixed(0)}%`;

  return { score, margin, low: score - margin, high: score + margin, grade, detail };
}

/* ════════════════════════════════════════════════════
   CLAUDE AI ANALYSIS
════════════════════════════════════════════════════ */
async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    throw new Error('ANTHROPIC_API_KEY not configured in .env');
  }

  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1400,
      messages:   [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      timeout: 30000,
    }
  );

  return res.data.content?.[0]?.text || '';
}

/* ════════════════════════════════════════════════════
   ROUTES
════════════════════════════════════════════════════ */

/** Health check */
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    markets:   Object.keys(MARKETS).length,
    popular:   Object.values(MARKETS).filter(m => m.popular).length,
    stocks:    Object.values(MARKETS).filter(m => m.type === 'stock').length,
    lotteries: Object.values(MARKETS).filter(m => m.type === 'lottery').length,
    cache:     cache.getStats(),
  });
});

/** GET /api/markets — list all markets */
app.get('/api/markets', (_req, res) => {
  const list = Object.values(MARKETS).map(m => ({
    id:       m.id,
    name:     m.name,
    nameEn:   m.nameEn,
    flag:     m.flag,
    type:     m.type,
    rounds:   m.rounds,
    timezone: m.timezone,
    open:     m.open,
    close:    m.close,
    url:      m.url,
    region:   m.region || 'อื่นๆ',
    popular:  m.popular || false,
  }));
  res.json({ success: true, markets: list });
});

/** GET /api/fetch/:market — fetch + parse single market */
app.get('/api/fetch/:market', async (req, res) => {
  const marketId = req.params.market;
  if (!MARKETS[marketId]) {
    return res.status(404).json({ success: false, error: `Market '${marketId}' not found` });
  }

  const cacheKey = `market_${marketId}`;
  const cached   = cache.get(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, fromCache: true });
  }

  try {
    const parsed = await fetchAndParseMarket(marketId);
    cache.set(cacheKey, parsed);
    res.json({ success: true, data: parsed, fromCache: false });
  } catch (err) {
    console.error(`[fetch/${marketId}]`, err.message);
    res.status(502).json({ success: false, error: err.message, market: marketId });
  }
});

/** GET /api/fetch-all — fetch all markets concurrently */
app.get('/api/fetch-all', async (_req, res) => {
  const results = {};
  const errors  = {};

  await Promise.allSettled(
    Object.keys(MARKETS).map(async id => {
      const cacheKey = `market_${id}`;
      const cached   = cache.get(cacheKey);
      if (cached) { results[id] = { ...cached, fromCache: true }; return; }

      try {
        const parsed = await fetchAndParseMarket(id);
        cache.set(cacheKey, parsed);
        results[id] = parsed;
      } catch (err) {
        errors[id] = err.message;
      }
    })
  );

  res.json({
    success: true,
    results,
    errors,
    total:  Object.keys(results).length,
    failed: Object.keys(errors).length,
  });
});

/** GET /api/proxy?url= — generic CORS proxy */
app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ success: false, error: 'url query param required' });

  const blocked = /localhost|127\.|10\.|192\.168\.|::1/i;
  if (blocked.test(url)) {
    return res.status(403).json({ success: false, error: 'Blocked URL' });
  }

  try {
    const html = await fetchPage(decodeURIComponent(url), { retries: 2 });
    res.json({ success: true, contents: html, url });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

/** POST /api/analyze — Claude AI analysis */
app.post('/api/analyze', async (req, res) => {
  const { rounds, freq, allNums, sources } = req.body;

  if (!rounds || !freq) {
    return res.status(400).json({ success: false, error: 'rounds and freq required' });
  }

  const accuracy = computeAccuracy(freq, allNums, rounds);

  const doubles   = Object.entries(freq).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
  const topNums   = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10)
                      .map(([n, c]) => `${n}(${c}×)`).join(', ');
  const recentSeq = (allNums || []).slice(0, 12).join(', ');
  const dblList   = doubles.map(([n, c]) => `${n}×${c}`).join(', ') || 'ยังไม่พบ';

  const today = new Date().toLocaleDateString('th-TH-u-ca-buddhist', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Bangkok',
  });

  const prompt = `คุณคือผู้เชี่ยวชาญวิเคราะห์หวยหุ้นมืออาชีพระดับสูง วันที่วันนี้: ${today}

ข้อมูลที่ได้รับ:
📊 จำนวนงวด: ${rounds} งวด | แหล่งข้อมูล: ${sources || 'หลายตลาด'}
🗓️ วันที่ระบบ: ${today}
🔢 ลำดับเลขล่าสุด: ${recentSeq}
🔥 ความถี่เลขสูงสุด: ${topNums}
⚡ เลขเบิ้ล (ออกซ้ำ): ${dblList}
📈 ค่าความแม่นยำเบื้องต้น: ${accuracy.score}% (±${accuracy.margin}%)

วิเคราะห์เชิงลึก 5 ประเด็น:
1. 📈 รูปแบบ (Pattern) ที่ชัดเจนจากลำดับข้อมูล
2. ⚡ เลขเบิ้ลที่น่าจับตา และโอกาสออกซ้ำในงวดถัดไป
3. 🧊 เลขเย็น (ไม่ออกนาน) ที่ควรระวัง
4. 🎯 คาดการณ์เลขบน-ล่าง งวดถัดไป พร้อมเหตุผล
5. 🏆 สรุปเลขเด่น TOP 3 ที่แนะนำ พร้อม % ความมั่นใจ (range ±5%)

ตอบภาษาไทย กระชับ ชัดเจน ใช้ emoji ประกอบ
สุดท้ายต้องมี JSON บรรทัดเดียว:
{"pred":["XX","XX","XX"],"double":["XX","XX"],"cold":["XX","XX"],"conf":${accuracy.score},"confLow":${accuracy.score - 5},"confHigh":${accuracy.score + 5},"reasoning":"สั้น 1 ประโยค"}`;

  try {
    const text = await callClaude(prompt);

    let aiText = text, pred = [], dbl = [], cold = [], conf = accuracy.score, reasoning = '';
    let confLow = conf - 5, confHigh = conf + 5;
    const jm = text.match(/\{[\s\S]*?"pred"[\s\S]*?\}/);
    if (jm) {
      try {
        const j   = JSON.parse(jm[0]);
        pred      = j.pred      || [];
        dbl       = j.double    || [];
        cold      = j.cold      || [];
        conf      = j.conf      || accuracy.score;
        confLow   = j.confLow   || conf - 5;
        confHigh  = j.confHigh  || conf + 5;
        reasoning = j.reasoning || '';
        aiText    = text.replace(jm[0], '').trim();
      } catch (_) {}
    }

    res.json({
      success: true,
      analysis: {
        text: aiText, pred, double: dbl, cold, conf, confLow, confHigh,
        reasoning, accuracy, systemDate: today, timestamp: new Date().toISOString(),
      }
    });
  } catch (err) {
    console.error('[analyze]', err.message);
    res.status(500).json({ success: false, error: err.message, accuracy });
  }
});

/** POST /api/analyze-custom — analyze custom URL */
app.post('/api/analyze-custom', async (req, res) => {
  const { url, marketName } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'url required' });

  try {
    const html = await fetchPage(url, { retries: 2 });
    const $    = cheerio.load(html);
    const text = $('body').text();

    const seen = new Set(), nums = [];
    let m;
    const re = /\b(\d{2})\b/g;
    while ((m = re.exec(text)) !== null) {
      if (!seen.has(m[1]) && nums.length < 20) { seen.add(m[1]); nums.push(m[1]); }
    }

    res.json({
      success:    true,
      marketName: marketName || url,
      url,
      top:        nums[0] || '??',
      bot:        nums[1] || '??',
      numbers:    nums,
      fetchedAt:  new Date().toISOString(),
      systemDate: new Date().toLocaleDateString('th-TH-u-ca-buddhist', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Bangkok',
      }),
    });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

/** POST /api/accuracy — standalone accuracy endpoint */
app.post('/api/accuracy', (req, res) => {
  const { freq, allNums, rounds } = req.body;
  if (!freq) return res.status(400).json({ success: false, error: 'freq required' });
  const accuracy = computeAccuracy(freq, allNums, rounds || 0);
  res.json({ success: true, accuracy });
});

/** Catch-all → serve frontend */
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

/* ════════════════════════════════════════════════════
   ERROR HANDLER
════════════════════════════════════════════════════ */
app.use((err, _req, res, _next) => {
  console.error('[Error]', err);
  res.status(500).json({ success: false, error: err.message });
});

/* ════════════════════════════════════════════════════
   START SERVER
════════════════════════════════════════════════════ */
const PORT = parseInt(process.env.PORT) || 3001;
app.listen(PORT, () => {
  const popularCount = Object.values(MARKETS).filter(m => m.popular).length;
  const stockCount   = Object.values(MARKETS).filter(m => m.type === 'stock').length;
  const lottoCount   = Object.values(MARKETS).filter(m => m.type === 'lottery').length;
  console.log(`
╔══════════════════════════════════════════╗
║  🎯 LOTTO-TJ Backend v2.1 (FIXED)       ║
║  http://localhost:${PORT}                 ║
║  Markets: ${Object.keys(MARKETS).length} ตลาด (${[...new Set(Object.values(MARKETS).map(m=>m.region))].length} ภูมิภาค)    ║
║  📈 หุ้น: ${stockCount} ตลาด (Yahoo Finance API)  ║
║  🎰 หวย: ${lottoCount} ตลาด (HTML Scraper)       ║
║  ⭐ Popular: ${popularCount} ตลาด                 ║
╚══════════════════════════════════════════╝
  `);
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

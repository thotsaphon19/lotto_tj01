# LOTTO-X · Full Stack Application
> วิเคราะห์หวยหุ้นทุกตลาด · ตรวจจับเลขเบิ้ล · พยากรณ์งวดถัดไปด้วย Claude AI

---

## 📁 โครงสร้างโปรเจกต์

```
lotto-x/
├── backend/
│   ├── server.js          ← Express API server (main)
│   ├── package.json       ← Node.js dependencies
│   └── .env.example       ← ตัวอย่าง environment variables
│
├── frontend/
│   └── public/
│       ├── index.html     ← หน้าหลัก UI
│       ├── css/
│       │   └── styles.css ← Design system + ทุก component
│       └── js/
│           └── app.js     ← Frontend engine (fetch, render, AI)
│
└── README.md
```

---

## 🚀 วิธีติดตั้งและใช้งาน

### 1. Clone / Copy ไฟล์ทั้งหมด

```bash
mkdir lotto-x && cd lotto-x
# วางไฟล์ทั้งหมดตามโครงสร้างด้านบน
```

### 2. ติดตั้ง Backend Dependencies

```bash
cd backend
npm install
```

### 3. ตั้งค่า Environment Variables

```bash
cp .env.example .env
# แก้ไขไฟล์ .env
```

ค่าที่ต้องกรอก:
```env
PORT=3001
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxx   # จาก https://console.anthropic.com
CORS_ORIGIN=http://localhost:3001
CACHE_TTL=300
```

### 4. รัน Server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

### 5. เปิดใช้งาน

เปิด browser ไปที่ **http://localhost:3001**

---

## 🌐 ตลาดที่รองรับ (10 ตลาด)

| ตลาด | ธง | เวลาเปิด | Timezone |
|------|-----|---------|----------|
| หวยหุ้นไทย (SET) | 🇹🇭 | 10:00–17:00 | Asia/Bangkok |
| นิเคอิ 225 | 🇯🇵 | 09:00–15:30 | Asia/Tokyo |
| ฮั่งเส็ง | 🇭🇰 | 09:30–16:00 | Asia/Hong_Kong |
| ดาวโจนส์ | 🇺🇸 | 09:30–16:00 | America/New_York |
| ฮานอย | 🇻🇳 | 18:00–18:30 | Asia/Ho_Chi_Minh |
| ลาว | 🇱🇦 | 20:00–20:30 | Asia/Vientiane |
| มาเลย์ (KLSE) | 🇲🇾 | 09:00–17:00 | Asia/Kuala_Lumpur |
| ไต้หวัน (TWII) | 🇹🇼 | 09:00–13:30 | Asia/Taipei |
| เซี่ยงไฮ้ | 🇨🇳 | 09:30–15:00 | Asia/Shanghai |
| สิงคโปร์ (STI) | 🇸🇬 | 09:00–17:00 | Asia/Singapore |

**เพิ่มตลาดใหม่** ได้ง่ายๆ ใน `backend/server.js` ที่ object `MARKETS`

---

## 📡 API Endpoints

| Method | Endpoint | คำอธิบาย |
|--------|----------|----------|
| GET | `/health` | Health check + สถิติ cache |
| GET | `/api/markets` | รายชื่อตลาดทั้งหมด |
| GET | `/api/fetch/:market` | ดึงผลหวย 1 ตลาด (cached) |
| GET | `/api/fetch-all` | ดึงทุกตลาดพร้อมกัน |
| GET | `/api/proxy?url=` | CORS proxy ทั่วไป |
| POST | `/api/analyze` | Claude AI วิเคราะห์ |
| POST | `/api/analyze-custom` | ดึง + วิเคราะห์ custom URL |

### ตัวอย่าง API Response

```bash
# ดึงผลหวยหุ้นไทย
curl http://localhost:3001/api/fetch/thai

# Response:
{
  "success": true,
  "data": {
    "market": "thai",
    "name": "หวยหุ้นไทย",
    "flag": "🇹🇭",
    "top": "47",
    "bot": "82",
    "numbers": ["47", "82", "15", "33", ...],
    "indexVal": "1,482.50",
    "fetchedAt": "2025-03-23T10:30:00.000Z"
  },
  "fromCache": false
}
```

```bash
# AI วิเคราะห์
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"rounds": 10, "freq": {"15":5,"28":4,"44":3}, "allNums":["15/72","28/15"]}'

# Response:
{
  "success": true,
  "analysis": {
    "text": "1. รูปแบบ: เลข 15 ออกบ่อยมาก...",
    "pred": ["15", "28", "44"],
    "double": ["15", "28"],
    "cold": ["07", "91"],
    "conf": 78,
    "reasoning": "เลข 15 และ 28 มีความถี่สูงสุด"
  }
}
```

---

## ✨ ฟีเจอร์ทั้งหมด

### Frontend
- ✅ ดึงข้อมูลผ่าน Backend API (เต็มรูปแบบ)
- ✅ Fallback ใช้ CORS proxy เมื่อ backend ออฟไลน์
- ✅ กรอกเลขเองแบบ manual
- ✅ Custom URL — ดึงจากเว็บหวยหุ้นใดก็ได้
- ✅ Auto refresh ทุก 1/5/10 นาที
- ✅ Export CSV ประวัติทุกงวด
- ✅ Heatmap 10×10 แสดงความถี่ 00–99
- ✅ ตรวจจับเลขเบิ้ลพร้อมแจ้งเตือน
- ✅ วิเคราะห์รูปแบบ 6 ประเภท
- ✅ พยากรณ์งวดถัดไป (สถิติ 4 วิธี + AI)
- ✅ Claude AI วิเคราะห์เชิงลึก
- ✅ ประวัติ 50 งวดล่าสุด

### Backend
- ✅ Caching ป้องกันดึงข้อมูลซ้ำถี่เกินไป (300 วินาที)
- ✅ Rate limiting ป้องกัน abuse
- ✅ Rotating User-Agents + retry 3 ครั้ง
- ✅ HTML parser ด้วย Cheerio
- ✅ Claude AI integration ผ่าน API key ที่ปลอดภัย
- ✅ Helmet security headers
- ✅ CORS configurable

---

## ⚙️ การปรับแต่ง

### เพิ่มตลาดใหม่ใน `backend/server.js`

```javascript
const MARKETS = {
  // ...ตลาดที่มีอยู่...
  
  mymarket: {
    id:     'mymarket',
    name:   'ชื่อตลาด',
    nameEn: 'Market Name',
    flag:   '🏳️',
    url:    'https://your-lottery-website.com/',
    rounds: ['รอบ 1', 'รอบ 2'],
    timezone: 'Asia/Bangkok',
    open:   '10:00',
    close:  '17:00',
    scrapeConfig: {
      numberSelectors: ['.lottery-number', 'td.result', '.prize'],
      indexSelector:   null,
      pattern:         /\b(\d{2})\b/g,
    }
  },
};
```

### ปรับ Cache TTL

```env
CACHE_TTL=600   # 10 นาที
```

### ปรับ Rate Limit

```env
RATE_LIMIT_WINDOW_MS=60000   # 1 นาที
RATE_LIMIT_MAX=60            # สูงสุด 60 requests/นาที
```

---

## 🛡️ Security Notes

- **API Key** เก็บใน `.env` ไม่ commit ขึ้น git
- Block internal URLs ใน CORS proxy (localhost, 10.x, 192.168.x)
- Rate limiting ป้องกัน DDoS
- Helmet headers ป้องกัน XSS, Clickjacking

---

## ⚠️ ข้อควรระวัง

> ผลการวิเคราะห์ทั้งหมดใช้สถิติเชิงคณิตศาสตร์เท่านั้น **ไม่รับประกันความแม่นยำ** ใช้เป็นข้อมูลประกอบการตัดสินใจเท่านั้น

- เว็บหวยหุ้นบางแห่งมี anti-bot protection อาจดึงข้อมูลไม่ได้
- แนะนำให้ตั้ง CACHE_TTL ไม่ต่ำกว่า 60 วินาที
- Claude API มีค่าใช้จ่ายตาม token ที่ใช้

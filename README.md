# 🏆 ENGSE207 Software Architecture - Final Lab Set 2
## Microservices + Activity Tracking + Cloud Deployment (Railway)

---

## 🎓 ข้อมูลรายวิชา

| | |
|---|---|
| **วิชา** | ENGSE207 Software Architecture |
| **สถาบัน** | มหาวิทยาลัยเทคโนโลยีราชมงคลล้านนา (RMUTL) |
| **ภาคเรียนที่** | 2 ปีการศึกษา 2568 |

---

## 👥 สมาชิกในกลุ่ม

| รหัสนักศึกษา | ชื่อ-นามสกุล |
|---|---|
| 67543210054-2 | นายณฐภาพ สายหล้า |
| 67543210065-8 | นางสาววรินทร เครืออินตา |

---

## ☁️ Railway Production URLs

| Service | Production URL |
|---|---|
| 🔐 Auth Service | https://auth-service-production-9612.up.railway.app |
| ✅ Task Service | https://task-service-production-9234.up.railway.app |
| 📅 Activity Service | https://activity-service-production-895b.up.railway.app |

---

## 1. 🚀 Evolution: From Set 1 to Set 2

| คุณสมบัติ | Set 1 | Set 2 (Current) |
|---|---|---|
| Architecture | 4 Services (Auth, Task, Log, FE) | 3 Core Services บน Cloud |
| Database | Shared PostgreSQL (1 DB) | Database-per-Service (3 DB แยกขาด) |
| Log Strategy | รวมศูนย์ที่ Log Service | แยก Local Log + ส่ง Event ไป Activity Service |
| Authentication | ไม่มี Register API | Register & Login สมบูรณ์แบบ |
| Deployment | Local-only (Docker + Nginx) | Cloud Deployment (Railway + HTTPS) |

---

## 2. 🗺️ Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│         index.html + activity.html               │
│                  config.js                       │
└────────┬───────────────┬──────────────┬──────────┘
         │               │              │
         ▼               ▼              ▼
  auth-service    task-service   activity-service
  :3001           :3002          :3003
         │               │
         └───────────────┴──→ POST /api/activity/internal
                                    (fire-and-forget)
  auth-db         task-db       activity-db
  (users, logs)   (tasks, logs) (activities)
```

---

## 3. 🧠 Key Architectural Decisions

### 📊 Denormalization Strategy

ใน `activities` table เราเลือกเก็บ `username` ควบคู่ไปกับ `user_id` เนื่องจาก:

- **Isolation:** `activity-db` ไม่มีสิทธิ์เข้าถึง `users` table ใน `auth-db`
- **Performance:** หลีกเลี่ยงการทำ Distributed JOIN ระหว่าง Database
- **Audit Trail:** บันทึกชื่อผู้ใช้ ณ ขณะที่เกิดเหตุการณ์จริง (Point-in-time record)

```sql
CREATE TABLE activities (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  username    VARCHAR(50),   -- ← denormalized จาก JWT payload
  event_type  VARCHAR(50) NOT NULL,
  summary     TEXT,
  meta        JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

### 📨 Fire-and-Forget Pattern

```javascript
async function logActivity({ userId, username, eventType, summary, meta }) {
  fetch(`${ACTIVITY_URL}/api/activity/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, username, event_type: eventType, summary, meta })
  }).catch(() => {
    console.warn('[service] activity-service unreachable — skipping event log');
  });
  // ไม่มี await → return ทันที ไม่รอผล
}
```

**เหตุผล:**
- **Non-critical:** หาก Activity Service ล่ม งานหลัก (Login/Task) ต้องทำงานต่อได้
- **Latency:** ลด Response Time ให้ผู้ใช้ ไม่ต้องรอผลการบันทึก Log
- **Loose Coupling:** ลดการพึ่งพากันระหว่าง Service ให้เหลือน้อยที่สุด

---

## 4. 🛠️ Gateway & Networking Strategy

เราเลือกใช้ **Option A: Multi-endpoint Client**

```javascript
window.APP_CONFIG = {
  AUTH_URL:     'https://auth-service-production-9612.up.railway.app',
  TASK_URL:     'https://task-service-production-9234.up.railway.app',
  ACTIVITY_URL: 'https://activity-service-production-895b.up.railway.app'
};
```

**เหตุผล:** ลดความซับซ้อนในการ Deploy Reverse Proxy บน Cloud และใช้ Auto-HTTPS ของ Railway ได้ทันที

---

## 5. ⚙️ Environment Variables Reference

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Railway auto-fill) |
| `JWT_SECRET` | รหัสลับสำหรับถอดรหัส Token (ต้องตรงกันทุก Service) |
| `ACTIVITY_SERVICE_URL` | URL ของ Activity Service สำหรับส่ง Internal Event |
| `PORT` | Port ที่ Service นั้นๆ รัน (3001, 3002, 3003) |
| `NODE_ENV` | `production` สำหรับ Railway, `development` สำหรับ Local |
| `JWT_EXPIRES` | อายุของ Token เช่น `1h` (auth-service เท่านั้น) |

---

## 6. 🐳 วิธีรัน Local ด้วย Docker Compose

```bash
# Clone repository
git clone https://github.com/your-username/engse207-sec2-lab2-67543210054-67543210065.git
cd engse207-sec2-lab2-67543210054-67543210065

# Copy environment file
cp .env.example .env

# รัน services ทั้งหมด
docker compose up --build

# หยุด services
docker compose down

# ล้าง volumes (reset database)
docker compose down -v
```

---

## 7. 🧪 Cloud Testing Guide

```bash
AUTH_URL="https://auth-service-production-9612.up.railway.app"
TASK_URL="https://task-service-production-9234.up.railway.app"
ACTIVITY_URL="https://activity-service-production-895b.up.railway.app"

# T2: Register
curl -X POST $AUTH_URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@sec2.local","password":"123456"}'

# T3: Login & Get Token
TOKEN=$(curl -s -X POST $AUTH_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@sec2.local","password":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# T4: Auth Me
curl $AUTH_URL/api/auth/me -H "Authorization: Bearer $TOKEN"

# T5: USER_REGISTERED + USER_LOGIN
curl $ACTIVITY_URL/api/activity/me -H "Authorization: Bearer $TOKEN"

# T6: Create Task → TASK_CREATED
curl -X POST $TASK_URL/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Cloud Verification","priority":"high"}'
curl $ACTIVITY_URL/api/activity/me -H "Authorization: Bearer $TOKEN"

# T7: Update Status → TASK_STATUS_CHANGED
curl -X PUT $TASK_URL/api/tasks/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"DONE"}'

# T8: Get Task List
curl $TASK_URL/api/tasks -H "Authorization: Bearer $TOKEN"

# T9: No JWT → 401
curl $TASK_URL/api/tasks
curl $ACTIVITY_URL/api/activity/me

# T10: Admin vs Member
ADMIN_TOKEN=$(curl -s -X POST $AUTH_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lab.local","password":"adminpass"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl $ACTIVITY_URL/api/activity/all -H "Authorization: Bearer $ADMIN_TOKEN"  # → 200
curl $ACTIVITY_URL/api/activity/all -H "Authorization: Bearer $TOKEN"         # → 403
```

---

## 8. ⚠️ Known Limitations

1. **Frontend ไม่มี API Gateway** — URL ต้องแก้ใน `config.js` ด้วยตนเองทุกครั้งที่ redeploy
2. **Activity log อาจหาย** — fire-and-forget ไม่มี retry mechanism
3. **JWT หมดอายุใน 1 ชั่วโมง** — ต้อง login ใหม่หลัง token หมดอายุ
4. **No failover** — ไม่มี load balancing หรือ backup service
5. **CORS open** — ตั้งค่า CORS แบบ `*` เหมาะสำหรับ development เท่านั้น

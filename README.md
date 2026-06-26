# luvu — Anonymous Stranger Chat

`luvu` là web trò chuyện ẩn danh với người lạ, giao diện mobile-first theo vibe gradient chat hiện đại.

## Tính năng có sẵn

- Ẩn danh bằng Supabase Anonymous Auth
- Ghép đôi ngẫu nhiên 1-1
- Chat text realtime bằng Supabase Realtime Broadcast
- Không lưu lịch sử tin nhắn vào database
- Gọi thoại audio-only bằng WebRTC
- Nút tìm người khác
- Nút kết thúc phòng
- Báo cáo người lạ
- Chặn người lạ để không bị ghép lại
- Giao diện responsive, dùng được trên điện thoại và máy tính

## Stack

- Next.js App Router
- React
- Tailwind CSS
- Supabase Auth + Postgres + Realtime
- Deploy trên Vercel

## Cách chạy local

### 1. Cài package

```bash
npm install
```

### 2. Tạo project Supabase

Vào Supabase Dashboard và tạo project mới.

Sau đó bật anonymous login:

```txt
Authentication > Sign In / Providers > Anonymous Sign-ins > Enable
```

### 3. Chạy SQL schema

Mở:

```txt
Supabase Dashboard > SQL Editor
```

Copy toàn bộ nội dung file:

```txt
supabase/schema.sql
```

Dán vào SQL Editor rồi bấm Run.

### 4. Thêm biến môi trường

Tạo file `.env.local` từ `.env.example`:

```bash
cp .env.example .env.local
```

Điền:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Lấy 2 key này ở:

```txt
Supabase Dashboard > Project Settings > API
```

### 5. Chạy web

```bash
npm run dev
```

Mở:

```txt
http://localhost:3000
```

Để test ghép đôi, mở 2 tab trình duyệt hoặc 2 thiết bị khác nhau.

## Deploy Vercel

### 1. Đẩy code lên GitHub

```bash
git init
git add .
git commit -m "init luvu"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### 2. Import vào Vercel

Vào Vercel > Add New Project > Import repo.

### 3. Thêm Environment Variables trên Vercel

Thêm 2 biến:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Sau đó deploy lại.

## Ghi chú quan trọng

### Không lưu lịch sử chat

Project này không có bảng `messages`.

Tin nhắn chỉ được gửi realtime qua Supabase Broadcast. Khi reload/rời phòng, tin nhắn biến mất.

Database chỉ lưu:

- `waiting_users`: hàng chờ ghép đôi
- `rooms`: metadata phòng chat
- `reports`: báo cáo người dùng
- `blocks`: danh sách chặn

### Voice call

Voice call dùng WebRTC. Trên production cần HTTPS, Vercel mặc định có HTTPS. Localhost cũng được trình duyệt cho phép dùng micro.

Nếu gọi thoại không kết nối ở một số mạng khó tính, cần thêm TURN server như Twilio/Numb/Cloudflare Calls. Bản này đang dùng STUN miễn phí của Google để demo.

### Bảo mật

Bản này đủ tốt cho demo/MVP nhỏ. Nếu muốn public đông người, nên thêm:

- moderation nâng cao
- rate limit server-side
- captcha
- TURN server cho voice ổn định hơn
- job tự xoá room cũ
- admin dashboard xem reports
- terms/privacy policy

## Cấu trúc thư mục

```txt
luvu/
├─ src/
│  ├─ app/
│  │  ├─ globals.css
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ components/
│  │  └─ LuvuApp.tsx
│  └─ lib/
│     ├─ safety.ts
│     ├─ supabase.ts
│     └─ types.ts
├─ supabase/
│  └─ schema.sql
├─ .env.example
├─ package.json
├─ tailwind.config.ts
├─ tsconfig.json
└─ README.md
```

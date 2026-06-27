# Cabang - Percabangan Masa Depan Obrolan

Bukan chatbot biasa. Setiap giliran, AI menyiapkan **4 kemungkinan balasan sekaligus** dengan gaya berbeda-beda (antusias, skeptis, santai, serius), bukan cuma satu jawaban. Kamu pilih satu buat lanjut -- dan bisa **balik lagi pilih cabang lain** kapan saja buat lihat jalan cerita yang berbeda. Didukung Groq API (cepat, gratis). Jalan di Cloudflare Workers.

## Konsep

Chatbot pada umumnya cuma kasih 1 jawaban per giliran -- kamu nggak pernah tahu "jalan lain" yang nggak diambil AI. Cabang membalik ini: AI menghasilkan beberapa kemungkinan arah sekaligus dalam **satu kali panggilan API**, lalu kamu yang memilih. Setiap pilihan yang nggak diambil tetap tersimpan sebagai "pil" kecil di bawah pesan itu -- klik kapan saja buat berpindah jalur, dan semua yang terjadi setelah titik itu otomatis diganti.

## Fitur

- 🌳 **2-6 cabang sekaligus per giliran** (bisa diatur) -- setiap cabang punya label gaya/nada yang jelas berbeda
- 🎭 **Atur peran/skenario lawan bicara** -- tentukan konteks (misal "teman dekat", "atasan di kantor", "psikolog"), semua cabang menyesuaikan peran itu
- 🔀 **Bisa kembali ke percabangan lama** -- klik pil cabang manapun di pesan sebelumnya buat pindah jalur
- 🔄 **Coba lagi** -- nggak suka opsi yang muncul? Generate ulang
- 🎨 **Warna konsisten per cabang** -- tiap "jalur" punya warna sendiri, gampang dilacak
- 🔒 **Proteksi password (opsional)**

## Setup dari Nol

### 1. Dapatkan API Key Groq (gratis)

Kalau sudah punya dari proyek Tutur, key yang sama bisa dipakai lagi. Kalau belum, daftar gratis di [console.groq.com](https://console.groq.com).

### 2. Upload ke GitHub

Upload `src/index.js`, `wrangler.jsonc`, `.gitignore`.

### 3. Hubungkan ke Cloudflare Workers

Dashboard Cloudflare → **Workers & Pages** → **Create** → **Import a Git Repository** → pilih repo `cabang`.

### 4. Isi Secrets

- `GROQ_API_KEY` = API key Groq kamu
- `APP_PASSWORD` (opsional, disarankan)

### 5. Buka link-nya dan mulai!

Tulis pesan pembuka apa saja, lihat 4 kemungkinan balasan muncul, pilih satu, lanjutkan.

## Catatan teknis

- **1 panggilan API per giliran** -- semua cabang dihasilkan sekaligus dalam satu request terstruktur, bukan beberapa panggilan terpisah
- **Jumlah cabang & peran divalidasi di server** -- nilai `branchCount` dibatasi hanya boleh 2/4/6, dan teks skenario dipotong maksimal 200 karakter, supaya tidak bisa disalahgunakan lewat manipulasi request
- **Parsing format terstruktur** -- AI diminta jawab dalam format `LABEL1: ...` / `TEKS1: ...` dst, lalu diparsing pakai regex di server (bukan JSON mode, supaya lebih robust kalau modelnya sedikit menyimpang dari format)
- **Riwayat percabangan cuma di memori browser** -- refresh halaman akan menghapusnya, sesuai filosofi proyek-proyek "ringan" lainnya

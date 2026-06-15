# MetaVid Randomizer

Aplikasi web untuk memproses video agar hasil export memiliki metadata dan karakteristik file yang berbeda, dengan nama file yang tetap mudah dikenali.

## ✨ Fitur Utama

- **Upload Multiple Video**: Upload 1 atau banyak video sekaligus (max 20 files, 500MB per file)
- **Queue Processing**: Video diproses satu per satu menggunakan FFmpeg
- **Uniqueness Engine**: 10 teknik untuk membuat setiap video unik:
  - Random Author
  - Hidden Tags
  - Title Spin
  - Shuffle Description
  - Timestamp Shift
  - Hash Trick
  - Encoding Jitter
  - Noise Injection
  - Pixel Shift
  - Audio Pitch ±0.01

- **Smart Naming**: Output menggunakan `nama_asli_new.mp4`
- **Manual Download**: Download hasil per file saat selesai
- **Bulk ZIP Download**: Download semua hasil dalam ZIP
- **Auto Delete**: File otomatis dihapus setelah 60 menit

## 🚀 Deploy ke Railway

### 1. Persiapan

```bash
# Clone atau buat repository
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/username/metavid-randomizer.git
git push -u origin main
```

### 2. Deploy di Railway

1. Buka [Railway](https://railway.app)
2. Klik **New Project**
3. Pilih **Deploy from GitHub repo**
4. Pilih repository `metavid-randomizer`
5. Railway akan otomatis detect Dockerfile dan deploy

### 3. Environment Variables (Optional)

Tambahkan di Railway Settings → Variables:

```
NODE_ENV=production
MAX_UPLOAD_FILES=20
MAX_FILE_SIZE_MB=500
AUTO_DELETE_MINUTES=60
CLEANUP_INTERVAL_MINUTES=5
QUEUE_CONCURRENCY=1
```

### 4. Generate Domain

Railway akan otomatis generate domain seperti:
```
https://metavid-randomizer.up.railway.app
```

## 💻 Development Lokal

### Prerequisites

- Node.js 18+
- FFmpeg terinstall

### Install FFmpeg

**Windows:**
```bash
# Gunakan Chocolatey
choco install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt update
sudo apt install ffmpeg
```

### Install & Run

```bash
# Install dependencies
npm install

# Run server
npm start
```

Buka browser: `http://localhost:3000`

## 📁 Struktur Project

```
metavid-randomizer/
├── Dockerfile
├── package.json
├── server.js
├── public/
│   └── index.html
├── uploads/          # Upload files (temporary)
│   └── job_xxx/
└── outputs/          # Processed files
    └── job_xxx/
```

## 🎯 Cara Pakai

1. Buka aplikasi di browser
2. Upload 1 atau lebih video
3. Klik **Proses Video**
4. Tunggu proses selesai (bisa download per file saat selesai)
5. Download hasil:
   - Manual per file
   - Atau download semua dalam ZIP
6. File akan otomatis dihapus setelah 60 menit

## 🔧 Teknologi

- **Backend**: Node.js + Express
- **Video Processing**: FFmpeg + fluent-ffmpeg
- **Queue**: In-memory queue (production: BullMQ + Redis)
- **Storage**: Local filesystem (production: Cloudflare R2 / S3)
- **Compression**: Archiver (ZIP)
- **Upload**: Multer

## 📊 Output Format

Input video dengan format apapun (.mp4, .mov, .mkv, dll) akan menghasilkan:

```
input:  video-iklan.mp4
output: video-iklan_new.mp4

input:  konten jualan.mov
output: konten jualan_new.mp4
```

## ⚙️ FFmpeg Processing

Setiap video diproses dengan:

```bash
ffmpeg -i input.mp4 \
  -map_metadata -1 \
  -vf "noise=alls=1:allf=t+u,crop=iw-2:ih-2:1:1,scale=iw:ih" \
  -af "asetrate=44100*1.01,aresample=44100,atempo=0.9901" \
  -c:v libx264 -crf 23 -preset veryfast \
  -c:a aac -b:a 192k \
  -metadata title="..." \
  -metadata artist="..." \
  [... metadata lainnya ...] \
  output_new.mp4
```

## 🔒 Error Handling

- Format tidak valid → ditolak
- File terlalu besar → ditolak
- FFmpeg gagal → file di-skip, lanjut ke berikutnya
- Partial success → ZIP dibuat dari file yang berhasil
- File expired → error message

## 📈 Upgrade ke Production

Untuk traffic lebih besar, upgrade:

1. **Queue**: Ganti in-memory queue dengan BullMQ + Upstash Redis
2. **Storage**: Pindah ke Cloudflare R2 / AWS S3
3. **Database**: Simpan job status di database
4. **Worker**: Pisah worker processing ke service terpisah
5. **CDN**: Gunakan signed URL untuk download

## 📝 License

MIT

## 👤 Author

MetaVid Randomizer

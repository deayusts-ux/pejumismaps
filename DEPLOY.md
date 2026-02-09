# Panduan Akses Pengguna Lain (Access Guide)

Untuk membuat aplikasi ZenMap dapat diakses oleh pengguna lain (teman, keluarga), Anda memiliki 2 opsi utama:

## Opsi 1: Jaringan Wi-Fi yang Sama (Lokal)
Jika teman Anda berada di satu ruangan dengan Anda dan terhubung ke Wi-Fi yang sama:

1.  Pastikan aplikasi berjalan (`npm run dev`).
2.  Lihat output di terminal Anda, cari bagian **Network**:
    ```
    ➜  Local:   http://localhost:5173/
    ➜  Network: http://192.168.1.5:5173/  <-- Gunakan IP ini
    ```
3.  Buka browser di laptop Anda menggunakan alamat **Network** (contoh: `http://192.168.1.5:5173`), BUKAN `localhost`.
4.  Klik tombol **QR Code** di aplikasi.
5.  Teman Anda bisa scan QR Code tersebut dengan HP mereka untuk membuka aplikasi.

## Opsi 2: Akses Internet (Publik / Jarak Jauh)
Jika teman Anda berada di tempat lain (beda rumah/kota), Anda perlu **Deploy** aplikasi agar bisa diakses lewat internet.

### Cara Deploy ke Vercel (Gratis & Mudah)
1.  Buat akun di [vercel.com](https://vercel.com).
2.  Install Vercel CLI di terminal:
    ```bash
    npm install -g vercel
    ```
3.  Jalankan perintah deploy di dalam folder proyek ini:
    ```bash
    vercel
    ```
4.  Ikuti petunjuk di layar (tekan Enter untuk default).
5.  Setelah selesai, Anda akan mendapatkan link (contoh: `https://zenmap.vercel.app`).
6.  Bagikan link tersebut ke teman Anda!

---
**Catatan:** Fitur *Live Location* (berbagi lokasi real-time) saat ini hanya bekerja secara lokal pada browser masing-masing. Untuk melihat lokasi teman secara real-time di peta ANDA, diperlukan backend server (database) yang akan dikembangkan di tahap selanjutnya.

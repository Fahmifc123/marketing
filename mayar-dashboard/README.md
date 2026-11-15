# Dashboard Penjualan Mayar — Intelligo ID

Menu **DASHBOARD MAYAR (PENJUALAN)** di Marketing Kit (`marketing.intelligo.id/dashboard/penjualan`) menampilkan pergerakan dana masuk dari Mayar untuk tim marketing (termasuk part time): kotor, fee Mayar + Xendit, dan neto per hari, bulan, dan produk.

Dashboard **hanya membaca** dari Mayar. Tidak ada aksi yang mengubah data di akun Mayar.

## Hasil Tahap 0 (verifikasi API, 15 Nov 2026)

Skrip: `scripts/tahap0-verifikasi.mjs`. Diuji pada 150 transaksi terbaru (17 Jul – 13 Nov 2026).

| Yang dicari | Hasil |
|---|---|
| Kode afiliator (`ma`), nama afiliator | **Tidak ada** di respons API. `paymentLinkTransaction.urlParamTrackingData` ada tetapi selalu `null`. |
| Komisi afiliator | **Tidak ada.** |
| Refund | **Tidak terlihat.** Status yang muncul hanya `settled` dan `paid`, tanpa nilai negatif. |
| Fee | **Ada**: `fee[]` berisi `mayar_fee` dan `xendit_fee`. Neto = `amount − jumlah fee[].debit`. |

Belum diuji: transaksi lewat link afiliator `?ma=<kode>`. Karena itu atribusi closing per orang dan bonus **belum** dibangun.

## Memasang API key Mayar

API key hanya disimpan di server, tidak pernah di kode, repo, atau browser.

1. Buat API key di dashboard Mayar (menu Integrasi / API Key). Kalau tersedia, pilih yang read-only.
2. Buka Vercel → project **marketing** → **Settings → Environment Variables**.
3. Tambahkan:
   - Name: `MAYAR_API_KEY`
   - Value: API key dari Mayar
   - Centang **Sensitive**
   - Environment: **Production** (dan Preview bila perlu)
4. Klik **Save**, lalu **Redeploy** deployment terbaru.

Data penjualan disimpan di storage privat Vercel Blob **marketing-data** (variabel `DATA_STORE_ID`, sudah tersambung). Yang disimpan hanya nama depan pembeli, produk, metode bayar, nominal, fee, dan waktu. Email dan nomor HP **tidak** disimpan.

## Sinkron transaksi

- **Otomatis:** saat halaman DASHBOARD MAYAR dibuka dan data terakhir lebih dari 15 menit, aplikasi mengambil transaksi baru dari Mayar.
- **Manual:** klik **Sinkron sekarang** di kanan atas dashboard.
- **Rentang data:** hanya transaksi sejak **tanggal 1 bulan lalu** (WIB), cukup untuk bulan berjalan dan perbandingan dengan bulan lalu. Data yang lebih lama otomatis dibuang dari penyimpanan.
- **Idempoten:** transaksi disimpan berdasarkan ID Mayar, jadi transaksi yang sama tidak pernah masuk dua kali.

### Menjalankan skrip verifikasi secara lokal

```bash
cd mayar-dashboard
MAYAR_API_KEY=isi_key_anda node scripts/tahap0-verifikasi.mjs --pages 3
```

Respons mentah tersimpan di `mayar-dashboard/data/`. Folder ini diabaikan git karena berisi data pembeli, jadi **jangan dibagikan**.

## Mengubah pengaturan

| Pengaturan | Lokasi | Default |
|---|---|---|
| Batas data dianggap basi (sinkron otomatis) | `STALE_MS` di `components/SalesDashboard.tsx` | 15 menit |
| Waktu maksimum satu kali sinkron | `syncSales(40_000)` di `app/api/sales/sync/route.ts` | 40 detik |
| Jeda antar halaman API Mayar | `PAGE_DELAY_MS` di `lib/mayar-server.ts` | 1,1 detik |
| Zona waktu hari/bulan | `JKT` di `lib/sales.ts` | Asia/Jakarta |

## Batasan saat ini

- Angka bersifat **estimasi**: refund belum terdeteksi lewat API, dan biaya iklan/trainer tidak dikurangkan.
- Status transaksi lama tidak diperbarui setelah tersimpan.
- Atribusi per orang, bonus, dan pembatasan per peran (spec bagian 5–6) belum dibuat. Semua yang login ke Marketing Kit bisa melihat dashboard ini.

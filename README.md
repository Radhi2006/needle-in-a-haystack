# 🌾 Needle in a Haystack

Game web FPP: temukan **1 jarum** di antara **10.000.000 helai jerami** (dihitung per helai).
Kumpulkan jerami → dapat uang → beli alat, detektor, upgrade, hewan & mesin → temukan jarum → prestige ke tumpukan yang lebih besar.

## Menjalankan

```bash
npm install
npm run dev      # buka http://localhost:5173
npm test         # unit test (grid, fisika runtuh, ekonomi)
npm run build    # build produksi ke dist/
```

Tambahkan `?debug` di URL untuk mode debug: jarum selalu terlihat, tombol **K** menambah uang & Jarum Emas.

## Kontrol

| Tombol | Aksi |
|---|---|
| WASD / Shift / Spasi | Jalan / lari / lompat (& jetpack) |
| Klik kiri (tahan) | Ambil jerami |
| 1–9, scroll | Ganti alat |
| B | Toko |
| G / T | Pakai / ganti konsumabel |
| F / X / P / M | Senter / Sinar-X / Sonar / bisukan detektor |

## Cara kerjanya (singkat)

- **Tanpa database.** Tumpukan disimpan sebagai grid `Uint8Array` berisi *jumlah helai per sel* (0,5 m³).
  Posisi tiap helai dihitung ulang dari `hash(seed, sel, nomor helai)`, jadi 10 juta helai cukup ±500 KB
  dan disimpan di IndexedDB browser (autosave tiap 15 detik).
- **Render:** permukaan tumpukan dibuat dengan *surface nets* per chunk 16³ (hanya chunk yang berubah di-mesh ulang);
  helai individual (InstancedMesh) hanya untuk sel terbuka di sekitar pemain.
- **Fisika runtuh:** helai jatuh ke sel di bawahnya bila ada ruang; dinding yang lebih curam dari ~2:1 meluncur.
- **Item & harga** semuanya ada di `src/items/catalog.ts` — tambah/ubah item cukup di sana.

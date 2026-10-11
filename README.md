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

Tambahkan `?debug` di URL untuk mode debug: jarum selalu terlihat, tombol **K** menambah uang & Jarum Emas, tombol **E** memicu event acak berikutnya.

## Kontrol

| Tombol | Aksi |
|---|---|
| WASD / Shift / Spasi | Jalan / lari / lompat (& jetpack) |
| Klik kiri (tahan) | Ambil jerami |
| 1–9, scroll | Ganti alat |
| B | Toko |
| G / T | Pakai / ganti konsumabel |
| F / X / P / M | Senter / Sinar-X / Sonar / bisukan detektor |

## Harta karun & event acak

- **Harta karun:** ±36 harta (bertambah tiap tumpukan) tertimbun di dalam jerami — kantong koin, peti kejutan berisi
  konsumabel, botol ramuan misterius, jerami emas, fosil, barang rongsok, dan satu **Peti Harta Legendaris** (+1 Jarum Emas).
  Saat tergali, harta tersembul & berkilau; dekati atau klik untuk mengambil. Nilainya ikut membesar seiring penghasilanmu.
  Item terkait: 🗺️ Peta Harta Karun (deteksi), 🏴‍☠️ Mata Pemburu Harta (prestige), magnet ikut menarik harta.
- **Event acak** (pertama setelah 2 menit, lalu tiap ±2–4 menit; 🧿 Jimat Keberuntungan mempercepat):
  🌟 Jam Emas (uang ×3), ☄️ Hujan Meteor, 🌪️ Angin Puting Beliung, 🪂 Paket Udara, 🛒 Pedagang Keliling (diskon 50%),
  🐐 Kambing Emas Kabur (kejar & tangkap).

## Bom raksasa (untuk tumpukan miliaran helai)

Dibidik sampai ±220 m, dijatuhkan dari langit/orbit, dan uangnya dibayar 100%:
☢️ Bom Nuklir (r 40 m) · 🚀 Rudal MIRV (6 hulu ledak r 32 m) · 🛰️ Tongkat Dewa (9 batang tungsten berderet 240 m) ·
🌞 Bom Hidrogen Tsar (r 70 m) · 🕳️ Bom Lubang Hitam (menyedot & membesar sampai r 85 m) ·
🔮 Bom Antimateri (bola r 100 m) · ☣️ Bom Kobalt Kiamat (kawah r 120 m) · 🌑 Asteroid Kiamat (kawah r 190 m) ·
☄️ Hujan Asteroid (7 kawah r 120 m selebar ±400 m) · 🌟 Bom Supernova (bintang mini meledak, bola r 340 m) ·
🌌 Big Bang (seluruh tumpukan lenyap).

Bom kelas menengah dengan cara kerja berbeda: 🌋 Bom Napalm (api menjalar sampai r 16 m) ·
🛩️ Serangan Bom Karpet (pesawat menjatuhkan 24 bom sepanjang 160 m) · 🌩️ Bom Badai Petir (36 sambaran petir menembus sampai tanah) ·
👽 Sinar Penculik UFO (menyedot kolom jerami r 24 m dari puncak sampai tanah).

Ledakan sebesar ini memakai `HaystackGrid.carve` (per kolom, tanpa listener per sel) supaya tidak membuat game tersendat;
supernova & Big Bang mengikis bola sebagai kulit yang membesar per tick sehingga bebannya terbagi ke banyak frame.

## Cara kerjanya (singkat)

- **Tanpa database.** Tumpukan disimpan sebagai grid `Uint8Array` berisi *jumlah helai per sel* (0,5 m³).
  Posisi tiap helai dihitung ulang dari `hash(seed, sel, nomor helai)`, jadi 10 juta helai cukup ±500 KB
  dan disimpan di IndexedDB browser (autosave tiap 15 detik).
- **Render:** permukaan tumpukan dibuat dengan *surface nets* per chunk 16³ (hanya chunk yang berubah di-mesh ulang);
  helai individual (InstancedMesh) hanya untuk sel terbuka di sekitar pemain.
- **Fisika runtuh:** helai jatuh ke sel di bawahnya bila ada ruang; dinding yang lebih curam dari ~2:1 meluncur.
- **Item & harga** semuanya ada di `src/items/catalog.ts` — tambah/ubah item cukup di sana.

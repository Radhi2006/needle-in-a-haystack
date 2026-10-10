export type Category = 'tool' | 'detector' | 'upgrade' | 'automator' | 'consumable' | 'prestige';
export type BuffId = 'speed' | 'rate' | 'money' | 'luck' | 'golden' | 'diskon';

export interface ToolSpec {
  /** Helai maksimum per sekali ambil. */
  amount: number;
  /** Ambil per detik saat tombol ditahan. */
  rate: number;
  /** Radius area ambil (meter). */
  radius: number;
  visual: string;
}

export interface AutoSpec {
  /** Helai per detik per unit. */
  rate: number;
  /** ground = makan dari dasar pinggir tumpukan, top = sedot dari atas. */
  mode: 'ground' | 'top';
  kind: 'animal' | 'worker' | 'machine';
  visual: string;
}

export interface ConsumableSpec {
  /**
   * blast = satu ledakan, cluster = pecah jadi bom-bom kecil, drill = ledakan beruntun menembus ke bawah,
   * nuke = dijatuhkan dari langit + awan jamur, fan = tiup lapisan luar, buff = efek sementara.
   */
  kind: 'blast' | 'cluster' | 'drill' | 'nuke' | 'fan' | 'buff';
  radius?: number;
  /** cluster: jumlah bom kecil. */
  count?: number;
  /** cluster: radius sebaran bom kecil (m). */
  spread?: number;
  buff?: BuffId;
  duration?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  category: Category;
  desc: string;
  price: number;
  /** Pengali harga per level/unit yang sudah dimiliki. */
  growth: number;
  /** Level / jumlah maksimum. */
  max: number;
  tool?: ToolSpec;
  auto?: AutoSpec;
  consumable?: ConsumableSpec;
  /** Tombol pintas yang relevan, ditampilkan di toko. */
  key?: string;
}

const tool = (id: string, name: string, icon: string, price: number, amount: number, rate: number, radius: number, desc: string): ItemDef => ({
  id, name, icon, category: 'tool', price, growth: 1, max: 1, desc,
  tool: { amount, rate, radius, visual: id },
});

const MANY = 1_000_000;

export const ITEMS: ItemDef[] = [
  // ───────── ALAT AMBIL ─────────
  tool('tangan', 'Tangan Kosong', '✋', 0, 1, 6, 0.3, 'Ambil jerami helai demi helai. Gratis, tapi... semoga beruntung.'),
  tool('garpu_kecil', 'Garpu Makan', '🍴', 50, 3, 6, 0.4, 'Pinjam dari dapur. Tiga helai sekaligus!'),
  tool('garpu_jerami', 'Garpu Jerami', '🔱', 400, 10, 5, 0.5, 'Alat petani sejati.'),
  tool('sekop', 'Sekop', '⛏️', 2_500, 30, 4, 0.6, 'Gali lebih dalam, lebih cepat.'),
  tool('garu', 'Garu Lebar', '🧹', 12_000, 80, 4, 0.9, 'Menyapu jerami dalam area lebar.'),
  tool('sabit', 'Sabit Tajam', '🌙', 50_000, 200, 4, 1.1, 'Tebas! Tebas! Tebas!'),
  tool('mesin_potong', 'Mesin Potong Rumput', '⚙️', 200_000, 500, 5, 1.3, 'Brrrrm. Tetangga mungkin terganggu.'),
  tool('vakum', 'Vakum Jerami', '🌀', 800_000, 1_200, 6, 1.5, 'Sedot terus selama tombol ditahan.'),
  tool('penyedot', 'Penyedot Industri', '🏭', 3_000_000, 3_000, 6, 1.8, 'Dipakai pabrik. Sekarang dipakai kamu.'),
  tool('bor', 'Bor Jerami Raksasa', '🔩', 12_000_000, 8_000, 5, 2.2, 'Menembus tumpukan seperti mentega.'),
  tool('combine', 'Combine Harvester', '🚜', 50_000_000, 20_000, 5, 2.8, 'Mesin panen sungguhan. Jangan tanya cara masuk ke sini.'),
  tool('lubang_hitam', 'Lubang Hitam Mini', '⚫', 250_000_000, 60_000, 4, 3.5, 'Fisika menangis. Jarum tidak ikut tersedot (katanya).'),

  // ───────── DETEKSI ─────────
  { id: 'kompas', name: 'Kompas Goyang', icon: '🧭', category: 'detector', price: 25_000, growth: 1, max: 1,
    desc: 'Jarumnya menunjuk KIRA-KIRA ke arah jarum. Kadang goyang.' },
  { id: 'detektor', name: 'Detektor Logam', icon: '📟', category: 'detector', price: 150_000, growth: 1, max: 1,
    desc: 'Bunyi bip makin cepat jika jarum dalam radius 8 m.', key: 'M' },
  { id: 'magnet_kecil', name: 'Magnet Kecil', icon: '🧲', category: 'detector', price: 400_000, growth: 1, max: 1,
    desc: 'Jarum langsung tertarik ke kamu bila jaraknya ≤ 1,5 m — walau masih tertimbun. Juga menarik harta karun yang tersembul.' },
  { id: 'detektor_pro', name: 'Detektor Logam Pro', icon: '📡', category: 'detector', price: 1_500_000, growth: 1, max: 1,
    desc: 'Jangkauan 16 m dan menampilkan perkiraan jarak.' },
  { id: 'sonar', name: 'Sonar Ping', icon: '🔊', category: 'detector', price: 4_000_000, growth: 1, max: 1,
    desc: 'Tekan [P]: gelombang sonar 14 m menandai jarum selama 4 detik. Jeda 30 detik.', key: 'P' },
  { id: 'drone_scan', name: 'Drone Pemindai', icon: '🛸', category: 'detector', price: 10_000_000, growth: 1, max: 1,
    desc: 'Memindai tiap 45 detik. Pilar cahaya menandai zona jarum yang makin mengecil.' },
  { id: 'magnet_besar', name: 'Magnet Raksasa', icon: '🧲', category: 'detector', price: 20_000_000, growth: 1, max: 1,
    desc: 'Seperti magnet kecil, tapi radius 4 m.' },
  { id: 'sinar_x', name: 'Kacamata Sinar-X', icon: '🥽', category: 'detector', price: 35_000_000, growth: 1, max: 1,
    desc: 'Tekan [X]: lihat jarum tembus jerami dalam radius 7 m.', key: 'X' },
  { id: 'termal', name: 'Peta Termal', icon: '🌡️', category: 'detector', price: 70_000_000, growth: 1, max: 1,
    desc: 'Menampilkan arah mata angin dan ketinggian jarum di HUD.' },
  { id: 'peta_harta', name: 'Peta Harta Karun', icon: '🗺️', category: 'detector', price: 8_000, growth: 1, max: 1,
    desc: 'Puluhan harta karun ikut tertimbun di tumpukan. Peta ini menunjukkan jarak & arah harta terdekat di HUD.' },
  { id: 'nenek', name: 'Ramalan Nenek', icon: '👵', category: 'detector', price: 5_000, growth: 1.5, max: MANY,
    desc: 'Nenek memberi petunjuk. Biasanya benar. Biasanya.' },

  // ───────── UPGRADE ─────────
  { id: 'sepatu', name: 'Sepatu Lari', icon: '👟', category: 'upgrade', price: 300, growth: 2.2, max: 10, desc: '+10% kecepatan jalan per level.' },
  { id: 'pegas', name: 'Pegas Lompat', icon: '🦘', category: 'upgrade', price: 1_000, growth: 2.5, max: 5, desc: '+12% tinggi lompatan per level.' },
  { id: 'sarung', name: 'Sarung Tangan Kerja', icon: '🧤', category: 'upgrade', price: 500, growth: 2.0, max: 15, desc: '+10% kecepatan memakai alat per level.' },
  { id: 'otot', name: 'Lengan Berotot', icon: '💪', category: 'upgrade', price: 3_000, growth: 2.2, max: 10, desc: '+15% helai per ambil per level.' },
  { id: 'lengan', name: 'Lengan Panjang', icon: '🦾', category: 'upgrade', price: 2_000, growth: 2.4, max: 8, desc: '+0,5 m jangkauan per level.' },
  { id: 'dompet', name: 'Dompet Tebal', icon: '👛', category: 'upgrade', price: 1_000, growth: 2.1, max: 20, desc: '+25% uang per helai per level.' },
  { id: 'hoki', name: 'Tas Hoki', icon: '🍀', category: 'upgrade', price: 5_000, growth: 2.3, max: 10, desc: '+2% peluang "genggaman emas" (×5 helai) per level.' },
  { id: 'senter', name: 'Senter', icon: '🔦', category: 'upgrade', price: 3_000, growth: 1, max: 1, desc: 'Tekan [F] untuk menyalakan. Berguna di dalam tumpukan yang gelap.', key: 'F' },
  { id: 'jetpack', name: 'Jetpack', icon: '🚀', category: 'upgrade', price: 400_000, growth: 1, max: 1, desc: 'Tahan [Spasi] di udara untuk terbang.', key: 'Spasi' },
  { id: 'tangki', name: 'Tangki Jetpack', icon: '⛽', category: 'upgrade', price: 600_000, growth: 2.0, max: 5, desc: '+1 detik bahan bakar jetpack per level.' },
  { id: 'jimat', name: 'Jimat Keberuntungan', icon: '🧿', category: 'upgrade', price: 20_000, growth: 3, max: 5, desc: 'Event acak (hujan meteor, puting beliung, jam emas, ...) datang 15% lebih sering per level.' },
  { id: 'pakan', name: 'Pakan Premium', icon: '🌽', category: 'upgrade', price: 50_000, growth: 8, max: 3, desc: 'Hewan makan +100% lebih cepat per level.' },
  { id: 'oli', name: 'Oli Super', icon: '🛢️', category: 'upgrade', price: 2_000_000, growth: 6, max: 3, desc: 'Pekerja & mesin +100% lebih cepat per level.' },

  // ───────── OTOMATISASI ─────────
  { id: 'ayam', name: 'Ayam', icon: '🐔', category: 'automator', price: 100, growth: 1.15, max: MANY,
    desc: 'Mematuk 1 helai/detik dari pinggir tumpukan.', auto: { rate: 1, mode: 'ground', kind: 'animal', visual: 'chicken' } },
  { id: 'kambing', name: 'Kambing', icon: '🐐', category: 'automator', price: 1_100, growth: 1.15, max: MANY,
    desc: 'Mengunyah 5 helai/detik. Mbeeek.', auto: { rate: 5, mode: 'ground', kind: 'animal', visual: 'goat' } },
  { id: 'sapi', name: 'Sapi', icon: '🐄', category: 'automator', price: 9_000, growth: 1.15, max: MANY,
    desc: 'Melahap 20 helai/detik.', auto: { rate: 20, mode: 'ground', kind: 'animal', visual: 'cow' } },
  { id: 'petani', name: 'Petani Upahan', icon: '👨‍🌾', category: 'automator', price: 60_000, growth: 1.15, max: MANY,
    desc: 'Mengumpulkan 70 helai/detik. Dibayar pakai jerami.', auto: { rate: 70, mode: 'ground', kind: 'worker', visual: 'farmer' } },
  { id: 'robot', name: 'Robot Pengumpul', icon: '🤖', category: 'automator', price: 400_000, growth: 1.15, max: MANY,
    desc: '250 helai/detik. Tidak pernah lelah.', auto: { rate: 250, mode: 'ground', kind: 'machine', visual: 'robot' } },
  { id: 'drone', name: 'Drone Pengumpul', icon: '🚁', category: 'automator', price: 2_500_000, growth: 1.15, max: MANY,
    desc: 'Menyedot 900 helai/detik dari puncak tumpukan.', auto: { rate: 900, mode: 'top', kind: 'machine', visual: 'drone' } },
  { id: 'kincir', name: 'Kincir Angin Penyedot', icon: '🌬️', category: 'automator', price: 15_000_000, growth: 1.15, max: MANY,
    desc: '3.500 helai/detik, tenaga angin.', auto: { rate: 3_500, mode: 'top', kind: 'machine', visual: 'windmill' } },
  { id: 'pabrik', name: 'Pabrik Bal Jerami', icon: '🏭', category: 'automator', price: 100_000_000, growth: 1.15, max: MANY,
    desc: '15.000 helai/detik dipadatkan jadi bal.', auto: { rate: 15_000, mode: 'ground', kind: 'machine', visual: 'factory' } },

  // ───────── KONSUMABEL ─────────
  { id: 'petasan', name: 'Petasan', icon: '🧨', category: 'consumable', price: 600, growth: 1, max: MANY,
    desc: 'Ledakan kecil (r 0,9 m). Separuh jerami hangus.', consumable: { kind: 'blast', radius: 0.9 } },
  { id: 'granat', name: 'Granat Jerami', icon: '🍍', category: 'consumable', price: 1_800, growth: 1, max: MANY,
    desc: 'Cabut pin, lempar, tiarap (r 1,2 m).', consumable: { kind: 'blast', radius: 1.2 } },
  { id: 'bom', name: 'Bom Jerami', icon: '💣', category: 'consumable', price: 4_000, growth: 1, max: MANY,
    desc: 'Ledakan sedang (r 1,6 m).', consumable: { kind: 'blast', radius: 1.6 } },
  { id: 'dinamit', name: 'Dinamit', icon: '💥', category: 'consumable', price: 15_000, growth: 1, max: MANY,
    desc: 'Ledakan besar (r 2,6 m).', consumable: { kind: 'blast', radius: 2.6 } },
  { id: 'bom_cluster', name: 'Bom Cluster', icon: '🎆', category: 'consumable', price: 45_000, growth: 1, max: MANY,
    desc: 'Pecah jadi 8 bom kecil (r 1,5 m) yang menyebar sejauh 5 m.', consumable: { kind: 'cluster', radius: 1.5, count: 8, spread: 5 } },
  { id: 'bom_penembus', name: 'Bom Penembus', icon: '🎯', category: 'consumable', price: 90_000, growth: 1, max: MANY,
    desc: 'Bunker buster: ledakan beruntun (r 1,5 m) menembus lurus sampai ke dasar tumpukan.', consumable: { kind: 'drill', radius: 1.5 } },
  { id: 'bom_raksasa', name: 'Bom Jerami Raksasa', icon: '🎱', category: 'consumable', price: 150_000, growth: 1, max: MANY,
    desc: 'BOOM (r 5 m). Jarum tahan ledakan, tenang saja.', consumable: { kind: 'blast', radius: 5 } },
  { id: 'termobarik', name: 'Bom Termobarik', icon: '🔥', category: 'consumable', price: 1_200_000, growth: 1, max: MANY,
    desc: 'Bola api raksasa (r 8 m). Jerami di sekitarnya langsung jadi abu.', consumable: { kind: 'blast', radius: 8 } },
  { id: 'nuklir', name: 'Bom Nuklir Jerami', icon: '☢️', category: 'consumable', price: 150_000_000, growth: 1, max: MANY,
    desc: 'Dijatuhkan dari langit. Meratakan jerami dalam radius 40 m dari tanah sampai puncak + awan jamur raksasa. Uang 100% (tidak dipotong seperti bom biasa). Larilah!', consumable: { kind: 'nuke', radius: 40 } },
  { id: 'kipas', name: 'Kipas Angin', icon: '🪭', category: 'consumable', price: 12_000, growth: 1, max: MANY,
    desc: 'Meniup lapisan luar jerami dalam radius 4 m.', consumable: { kind: 'fan', radius: 4 } },
  { id: 'r_cepat', name: 'Ramuan Kecepatan', icon: '⚡', category: 'consumable', price: 2_000, growth: 1, max: MANY,
    desc: 'Lari 60% lebih cepat selama 60 detik.', consumable: { kind: 'buff', buff: 'speed', duration: 60 } },
  { id: 'kopi', name: 'Kopi Petani', icon: '☕', category: 'consumable', price: 8_000, growth: 1, max: MANY,
    desc: 'Alat 2× lebih cepat selama 60 detik.', consumable: { kind: 'buff', buff: 'rate', duration: 60 } },
  { id: 'r_rakus', name: 'Ramuan Rakus', icon: '🤑', category: 'consumable', price: 25_000, growth: 1, max: MANY,
    desc: 'Uang ×2 selama 60 detik.', consumable: { kind: 'buff', buff: 'money', duration: 60 } },
  { id: 'r_hoki', name: 'Ramuan Hoki', icon: '🌈', category: 'consumable', price: 50_000, growth: 1, max: MANY,
    desc: '+30% peluang genggaman emas (×10) selama 60 detik.', consumable: { kind: 'buff', buff: 'luck', duration: 60 } },

  // ───────── PRESTIGE (dibeli dengan Jarum Emas, permanen) ─────────
  { id: 'p_warisan', name: 'Warisan Kakek', icon: '👴', category: 'prestige', price: 1, growth: 1.6, max: 10, desc: '+50% uang per helai per level. Permanen.' },
  { id: 'p_sarung', name: 'Sarung Tangan Emas', icon: '🥇', category: 'prestige', price: 1, growth: 1.6, max: 10, desc: '+20% kecepatan alat per level. Permanen.' },
  { id: 'p_peternakan', name: 'Peternakan Abadi', icon: '🏡', category: 'prestige', price: 1, growth: 1.6, max: 10, desc: '+25% kecepatan semua otomatisasi per level.' },
  { id: 'p_modal', name: 'Modal Awal', icon: '💼', category: 'prestige', price: 2, growth: 1.8, max: 6, desc: 'Mulai tumpukan baru dengan Rp 1.000 × 10^(level-1).' },
  { id: 'p_insting', name: 'Insting Pencari', icon: '👃', category: 'prestige', price: 3, growth: 2, max: 3, desc: 'Mulai dengan Kompas (Lv1), + Detektor (Lv2), + Detektor Pro (Lv3).' },
  { id: 'p_alat', name: 'Gudang Warisan', icon: '🧰', category: 'prestige', price: 2, growth: 1.8, max: 5, desc: 'Mulai dengan alat yang lebih baik (1 tingkat per level).' },
  { id: 'p_pemburu', name: 'Mata Pemburu Harta', icon: '🏴‍☠️', category: 'prestige', price: 2, growth: 1.8, max: 5, desc: '+25% jumlah harta karun di tiap tumpukan & isinya +25% lebih banyak per level.' },
  { id: 'p_hemat', name: 'Pelanggan Setia', icon: '🏷️', category: 'prestige', price: 2, growth: 2, max: 3, desc: 'Konsumabel 15% lebih murah per level.' },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const TOOLS = ITEMS.filter((i) => i.category === 'tool');
export const AUTOMATORS = ITEMS.filter((i) => i.category === 'automator');
export const CONSUMABLES = ITEMS.filter((i) => i.category === 'consumable');

export const CATEGORY_LABEL: Record<Category, string> = {
  tool: '🔨 Alat',
  detector: '📡 Deteksi',
  upgrade: '⬆️ Upgrade',
  automator: '🐔 Otomatisasi',
  consumable: '💣 Konsumabel',
  prestige: '🏆 Prestige',
};

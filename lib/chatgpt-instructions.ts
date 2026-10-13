/**
 * Instructions the marketer pastes into ChatGPT so its answer comes back in
 * the exact format the Meta Ads tab parses ("Gaya umum:" + "Slide N:"), with
 * the Intelligo rules that matter for ad copy. Public helper text — not the
 * internal image prompt.
 */
import { LOGO_CORNERS, type LogoCorner } from "@/lib/logo-placement";
import type { MetaAdSize } from "@/lib/meta-ads";

export interface ChatGptInstructionOptions {
  topic: string;
  slideCount: number;
  sizes: MetaAdSize[];
  /** Corner where the official logo will be composited, or null when auto-logo is off. */
  logoCorner: LogoCorner | null;
  /** True when headline/supporting/CTA are typeset by the app (labels must be explicit). */
  textOverlay?: boolean;
}

const FLOW: Record<number, string> = {
  1: "satu kartu yang langsung kuat: hook + value + CTA",
  2: "Hook → CTA",
  3: "Hook → Solution → CTA",
  4: "Hook → Problem → Solution → CTA",
  5: "Hook → Problem → Insight → Solution → CTA",
  6: "Hook → Problem → Insight → Solution → Benefit → CTA",
  7: "Hook → Problem → Insight → Solution → Program → Benefit → CTA",
  8: "Hook → Problem → Insight → Solution → Program → Benefit → Offer/Jadwal → CTA",
};

function flowFor(n: number) {
  return FLOW[n] ?? `${FLOW[8]} (tambahkan kartu benefit/bukti di tengah sampai ${n} kartu)`;
}

export function buildChatGptInstructions({
  topic,
  slideCount,
  sizes,
  logoCorner,
  textOverlay = false,
}: ChatGptInstructionOptions): string {
  const n = Math.max(1, Math.min(10, Math.round(slideCount)));
  const brief = topic.trim() || "[TULIS TOPIK / BRIEF CAMPAIGN DI SINI — program, target audiens, offer (kalau ada)]";
  const sizeList = sizes.length
    ? sizes.map((s) => `${s.exportSize.width}×${s.exportSize.height} (${s.ratio}, ${s.placement})`).join(", ")
    : "1080×1350 (4:5), 1080×1080 (1:1), 1080×1920 (9:16)";
  const cornerLabel = logoCorner ? LOGO_CORNERS.find((c) => c.id === logoCorner)?.label.toLowerCase() : null;

  const firstSlide = textOverlay
    ? `Slide 1: <peran kartu> — <konsep visual & komposisi, TANPA teks di dalam gambar>. Headline "<teks>". Teks pendukung "<teks>" (opsional). Tombol "<teks>" (hanya kalau kartu ini punya CTA).`
    : `Slide 1: <peran kartu> — <konsep visual & komposisi>. Headline "<teks>". Teks pendukung "<teks>" (opsional).`;
  const slideLines = Array.from({ length: n }, (_, i) => (i === 0 ? firstSlide : `Slide ${i + 1}: ...`)).join("\n");
  const textRule = textOverlay
    ? `- Teks iklan dipasang otomatis oleh aplikasi (font & warna brand), BUKAN digambar AI. Untuk setiap kartu tulis dengan label persis: Headline "...", Teks pendukung "..." (opsional), Tombol "..." (hanya kartu CTA). Headline maksimal ±8 kata, teks pendukung maksimal 1 kalimat pendek, tombol 1–3 kata. Konsep visual jangan memuat teks lain.`
    : `- Teks yang harus tampil di gambar tulis dalam tanda kutip "seperti ini". Headline maksimal ±8 kata, teks pendukung maksimal 1 kalimat pendek. Sedikit teks lebih baik untuk iklan.`;

  return `Kamu adalah creative strategist untuk Intelligo ID — perusahaan edukasi & skill karier di Indonesia (Bootcamp, Private Course, Internship, Job Ready, Workshop; topik seperti Data Science, Data Analytics, AI, Machine Learning, Python, SQL, Data Visualization, AI Automation).

TUGAS
Buat prompt gambar untuk ${n === 1 ? "1 kreatif Meta Ads" : `carousel Meta Ads berisi ${n} kartu`} tentang:
${brief}

Prompt ini akan saya tempel ke Intelligo Marketing Kit (generator gambar AI). Ukuran yang dipakai: ${sizeList}. Sistem sudah otomatis menerapkan palet & aturan brand Intelligo (navy #023047 dominan, oranye #FF5400 untuk aksen/CTA, putih, off-white #F8FAFB, pale blue #EAF2F5) dan menyesuaikan tiap ukuran — jadi fokuslah pada ide, alur cerita, copy, dan konsep visual.

ATURAN
- Alur: ${flowFor(n)}. Untuk audiens dingin, buka dengan hook yang relatable, jangan langsung poster program.
- JANGAN mengarang harga, tanggal, jadwal, diskon, persentase, statistik, testimoni, jumlah alumni, nama mentor/partner, atau janji "pasti dapat kerja". Pakai hanya detail yang saya berikan di brief.
- JANGAN menulis URL, akun sosmed, atau QR code kecuali ada di brief.
- ${cornerLabel ? `Jangan minta logo digambar — logo resmi ditempel otomatis di pojok ${cornerLabel}, jadi biarkan pojok itu kosong.` : "Jangan minta logo Intelligo digambar — sisakan pojok kosong untuk logo yang ditempel manual."}
${textRule}
- Visual: orang Indonesia/Asia Tenggara yang natural (mahasiswa, fresh graduate, profesional muda), suasana kerja/belajar modern, gaya editorial premium. Hindari robot, hologram, neon, efek glow, dan desain ramai.
- Variasikan subjek antar kartu (jangan orang yang sama di setiap kartu), tapi gaya visual tetap satu seri.
- Copy di gambar dalam Bahasa Indonesia; deskripsi visual boleh Indonesia atau Inggris.

FORMAT JAWABAN — wajib persis seperti ini, tanpa pembuka/penutup atau penjelasan lain:
Gaya umum: <1–3 kalimat gaya visual yang berlaku untuk semua kartu>

${slideLines}`;
}

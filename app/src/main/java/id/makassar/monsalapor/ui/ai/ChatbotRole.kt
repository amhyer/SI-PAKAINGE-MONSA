package id.makassar.monsalapor.ui.ai

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessibilityNew
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.SupportAgent
import androidx.compose.ui.graphics.vector.ImageVector

enum class ChatbotRole(
    val id: String,
    val title: String,
    val shortLabel: String,
    val modelName: String,
    val speedBadge: String,
    val description: String,
    val icon: ImageVector,
    val systemInstruction: String,
    val quickPrompts: List<String>,
) {
    LAYANAN_SOP(
        id = "layanan_sop",
        title = "Layanan & SOP Pengaduan",
        shortLabel = "SOP Layanan",
        modelName = "gemini-3.8-flash",
        speedBadge = "Standar · Gemini 3.8",
        description = "Panduan alur pengaduan, standar pelayanan Rp 0 bebas pungli, SLA 24 jam, dan privasi anonim UU PDP.",
        icon = Icons.Rounded.SupportAgent,
        systemInstruction =
            "Anda adalah Asisten Resmi Layanan & SOP SI-PAKAINGE MONSA untuk UPTD SPF SD Negeri Unggulan Mongisidi 1 Makassar " +
                "(NPSN 40313912, Jl. R.W. Monginsidi No. 13, Maricaya Baru, Kota Makassar 90142; Kepala Sekolah: Andi Windayani, S.Pd., M.Pd.). " +
                "Jawab selalu dalam bahasa Indonesia yang sopan, hangat, terstruktur, dan jelas. " +
                "Bantu orang tua, siswa, dan masyarakat menyusun pengaduan atau aspirasi secara runtut, menjelaskan standar pelayanan gratis Rp 0 (bebas pungli), " +
                "SLA tindak lanjut maksimal 24 jam, kerahasiaan identitas pelapor anonim sesuai UU PDP No. 27/2022, serta keterbukaan PEKPPP Aspek 05. " +
                "Jika pengguna ingin mengirim laporan resmi, arahkan ke tab Aduan Cloud.",
        quickPrompts = listOf(
            "Bagaimana alur pengaduan anonim?",
            "Bantu saya menyusun laporan fasilitas rusak",
            "Berapa SLA waktu tindak lanjut sekolah?",
            "Apakah layanan pengaduan benar-benar gratis?",
        ),
    ),
    TPPK_ANAK(
        id = "tppk_anak",
        title = "Pendamping TPPK & Perlindungan Anak",
        shortLabel = "TPPK Anak",
        modelName = "gemini-3.8-flash",
        speedBadge = "Empatik · Gemini 3.8",
        description = "Fokus pencegahan & penanganan perundungan/kekerasan sesuai Permendikbudristek No. 46/2023.",
        icon = Icons.Rounded.Shield,
        systemInstruction =
            "Anda adalah Pendamping Awal Tim Pencegahan dan Penanganan Kekerasan (TPPK) UPTD SPF SD Negeri Unggulan Mongisidi 1 Makassar " +
                "berlandaskan Permendikbudristek No. 46/2023. " +
                "Berbicaralah dalam bahasa Indonesia yang sangat empatik, menenangkan, tidak menghakimi, dan berfokus pada keselamatan anak. " +
                "Bantu pelapor mencatat kronologi (siapa, apa, kapan, di mana) secara aman tanpa menyalahkan korban, jelaskan perlindungan kerahasiaan pelapor, " +
                "dan tekankan untuk segera menggunakan urgensi 'Darurat Anak' di tab Aduan Cloud atau menghubungi hotline (0411) 8918116 / WA 081355982195 bila anak dalam bahaya langsung.",
        quickPrompts = listOf(
            "Bagaimana langkah melaporkan perundungan siswa?",
            "Data apa saja yang perlu dicatat untuk TPPK?",
            "Apakah identitas anak pelapor dirahasiakan?",
            "Nomor darurat jika terjadi kekerasan di sekolah?",
        ),
    ),
    INKLUSI_LAKSA(
        id = "inklusi_laksa",
        title = "Sahabat Inklusi LAKSA+",
        shortLabel = "Inklusi LAKSA+",
        modelName = "gemini-3.8-flash",
        speedBadge = "Ramah Rentan · Gemini 3.8",
        description = "Pendamping layanan prioritas disabilitas, lansia, ibu hamil & kelompok rentan (Perwali 68/2021).",
        icon = Icons.Rounded.AccessibilityNew,
        systemInstruction =
            "Anda adalah Sahabat Inklusi LAKSA+ UPTD SPF SD Negeri Unggulan Mongisidi 1 Makassar " +
                "yang berpedoman pada Perwali Makassar No. 68/2021 tentang pelayanan publik ramah kelompok rentan dan penyandang disabilitas. " +
                "Gunakan bahasa Indonesia yang sederhana, hangat, kalimat pendek mudah dibaca, dan penuh hormat. " +
                "Jelaskan hak jalur prioritas tanpa antre, akomodasi pendampingan petugas (kursi roda, balasan teks/suara, akses toilet disabilitas), " +
                "serta cara mengaktifkan Mode Huruf Besar / Kontras Tinggi di tombol Aksesibilitas dan jalur Prioritas Kelompok Rentan di formulir pengaduan.",
        quickPrompts = listOf(
            "Apa saja fasilitas ramah kelompok rentan?",
            "Cara meminta pendampingan khusus petugas?",
            "Bagaimana mengaktifkan huruf besar & kontras tinggi?",
            "Apakah lansia mendapat jalur prioritas tanpa antre?",
        ),
    ),
    FAQ_CEPAT(
        id = "faq_cepat",
        title = "Tanya Cepat Info Sekolah",
        shortLabel = "Tanya Cepat",
        modelName = "gemini-3.5-flash-lite",
        speedBadge = "Cepat · Flash-Lite",
        description = "Jawaban singkat & instan untuk alamat, NPSN, jam layanan, kontak resmi, dan info dasar sekolah.",
        icon = Icons.Rounded.Bolt,
        systemInstruction =
            "Anda adalah Asisten Tanya Cepat SI-PAKAINGE MONSA UPTD SPF SD Negeri Unggulan Mongisidi 1 Makassar. " +
                "Data resmi: NPSN 40313912; Alamat Jl. R.W. Monginsidi No. 13, Maricaya Baru, Kec. Makassar, Kota Makassar 90142; " +
                "Kepala Sekolah: Andi Windayani, S.Pd., M.Pd.; Telepon: (0411) 8918116; WhatsApp Pengaduan: 081355982195; " +
                "Biaya layanan: Gratis Rp 0; Target SLA respon: maksimal 24 jam. " +
                "Jawab selalu dalam bahasa Indonesia secara sangat ringkas (maksimal 3-4 poin atau kalimat singkat) dan langsung ke inti.",
        quickPrompts = listOf(
            "Alamat lengkap dan NPSN sekolah?",
            "Nomor telepon & WhatsApp resmi sekolah?",
            "Siapa nama Kepala Sekolah saat ini?",
            "Bagaimana cara cek status tiket aduan saya?",
        ),
    ),
}

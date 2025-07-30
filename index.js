import express from 'express';
import { gotScraping } from 'got-scraping';
import { load as cheerioLoad } from 'cheerio'; // Cara import cheerio yang benar di ESM
import { CookieJar } from 'tough-cookie';

// Inisialisasi Aplikasi Express
const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Fungsi inti untuk scraping data LPSE.
 * @param {number} year - Tahun anggaran yang akan di-scrape.
 * @returns {Promise<object>} - Data tender dalam format JSON.
 */
async function scrapeLpseData(year) {
    console.log(`🚀 Memulai proses scraping untuk tahun ${year}...`);

    const baseUrl = 'https://spse.inaproc.id/kemhan';
    const lelangPageUrl = `${baseUrl}/lelang`;
    const dataUrl = `${baseUrl}/dt/lelang?tahun=${year}`;
    const cookieJar = new CookieJar();

    // Step 1: GET request untuk mendapatkan token dan cookie
    console.log('   [1/2] Mengambil halaman utama untuk token & cookie...');
    const response = await gotScraping.get(lelangPageUrl, {
        cookieJar,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        }
    });

    const $ = cheerioLoad(response.body); // Gunakan fungsi yang sudah di-import
    const tokenMatch = $("script:contains('authenticityToken')").html().match(/authenticityToken = '([a-f0-9]+)';/);

    if (!tokenMatch || !tokenMatch[1]) {
        throw new Error('Gagal menemukan authenticityToken. Situs mungkin telah berubah atau memblokir request.');
    }
    const token = tokenMatch[1];
    console.log(`   [1/2] ✔️ Token ditemukan: ${token.substring(0, 10)}...`);

    // Step 2: Build payload dan kirim POST request
    const payload = {
        'draw': 1,
        'start': 0,
        'length': 25, // Ambil 25 data pertama sebagai contoh
        'search[value]': '',
        'search[regex]': 'false',
        'authenticityToken': token,
        'order[0][column]': '1',
        'order[0][dir]': 'asc'
    };
    console.log('   [2/2] Mengirim request POST untuk mendapatkan data JSON...');
    
    const { body: tenderData } = await gotScraping.post(dataUrl, {
        cookieJar,
        headers: {
            'Referer': lelangPageUrl,
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        },
        form: payload,
        responseType: 'json'
    });

    console.log('✅ Scraping berhasil!');
    return tenderData;
}

// Membuat Endpoint API
app.get('/api/scrape', async (req, res) => {
    const year = req.query.year || new Date().getFullYear();

    try {
        const data = await scrapeLpseData(parseInt(year));
        res.status(200).json({
            success: true,
            message: `Data untuk tahun ${year} berhasil diambil.`,
            metadata: {
                recordsTotal: data.recordsTotal,
                recordsFiltered: data.recordsFiltered,
            },
            data: data.data
        });
    } catch (error) {
        console.error("❌ Terjadi kesalahan pada endpoint /api/scrape:", error.message);
        res.status(500).json({
            success: false,
            message: "Gagal melakukan scraping.",
            error: error.message
        });
    }
});

app.get('/', (req, res) => {
    res.send('<h2>LPSE Scraper API</h2><p>Gunakan endpoint <strong>/api/scrape?year=2024</strong> untuk mengambil data.</p>');
});

// Menjalankan server
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
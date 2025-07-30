import express from 'express';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

// Inisialisasi Aplikasi Express
const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Fungsi inti untuk scraping data LPSE menggunakan Puppeteer.
 * @param {number} year - Tahun anggaran yang akan di-scrape.
 * @returns {Promise<object>} - Data tender dalam format JSON.
 */
async function scrapeLpseData(year) {
    console.log(`🚀 Memulai proses scraping dengan Puppeteer untuk tahun ${year}...`);
    
    let browser = null;

    try {
        // Meluncurkan browser dengan konfigurasi untuk serverless
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        
        const baseUrl = 'https://spse.inaproc.id/kemhan';
        const lelangPageUrl = `${baseUrl}/lelang`;

        // Step 1: Kunjungi halaman utama. Puppeteer akan otomatis menangani challenge Cloudflare.
        console.log('   [1/3] Mengunjungi halaman utama dan menunggu Cloudflare...');
        await page.goto(lelangPageUrl, {
            waitUntil: 'domcontentloaded' // Tunggu hingga DOM siap
        });

        // Step 2: Ambil authenticityToken dari dalam konteks browser
        console.log('   [2/3] Mengekstrak authenticityToken...');
        const token = await page.evaluate(() => {
            const scriptContent = document.body.innerHTML;
            const match = scriptContent.match(/authenticityToken = '([a-f0-9]+)';/);
            return match ? match[1] : null;
        });

        if (!token) {
            throw new Error('Gagal mengekstrak authenticityToken setelah memuat halaman.');
        }
        console.log(`   [2/3] ✔️ Token ditemukan: ${token.substring(0, 10)}...`);

        // Step 3: Kirim request POST dari dalam browser menggunakan fetch()
        console.log('   [3/3] Mengirim request POST dari dalam browser...');
        const dataUrl = `${baseUrl}/dt/lelang?tahun=${year}`;
        
        const tenderData = await page.evaluate(async (url, authToken) => {
            const formData = new URLSearchParams();
            formData.append('draw', '1');
            formData.append('start', '0');
            formData.append('length', '25');
            formData.append('search[value]', '');
            formData.append('authenticityToken', authToken);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: formData.toString()
            });
            return response.json();
        }, dataUrl, token); // Kirim variabel ke dalam page.evaluate

        console.log('✅ Scraping dengan Puppeteer berhasil!');
        return tenderData;

    } catch (error) {
        console.error("❌ Terjadi kesalahan pada fungsi scrapeLpseData (Puppeteer):", error.message);
        throw error; // Lemparkan lagi agar ditangkap oleh endpoint handler
    } finally {
        // Pastikan browser selalu ditutup untuk mencegah resource leak
        if (browser !== null) {
            await browser.close();
            console.log('   -> Browser ditutup.');
        }
    }
}

// Endpoint API (tidak ada perubahan di sini)
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
            message: "Gagal melakukan scraping dengan Puppeteer.",
            error: error.message
        });
    }
});

app.get('/', (req, res) => {
    res.send('<h2>LPSE Scraper API (Puppeteer)</h2><p>Gunakan endpoint <strong>/api/scrape?year=2024</strong> untuk mengambil data. 12345</p>');
});

app.listen(PORT, () => {
    console.log(`Server fix berjalan di http://localhost:${PORT}`);
});
// server.js
// Backend proxy kecil untuk MoodCheck.
// Tugasnya cuma satu: menyimpan token OpenAI (ChatGPT) dengan aman di server,
// lalu meneruskan permintaan "buatkan pertanyaan baru" dari frontend ke OpenAI.
// Frontend (moodcheck.html) TIDAK PERNAH menyimpan token ini sama sekali.

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // untuk produksi, ganti dengan origin spesifik, lihat README

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;

const MOOD_LABELS = {
  sangat_senang: 'Sangat Senang',
  senang: 'Senang',
  biasa: 'Biasa Saja',
  sedih: 'Sedih',
  stres: 'Stres/Cemas',
  marah: 'Marah',
};

const FALLBACK_QUESTIONS = [
  { q: 'Bagaimana perasaanmu ketika menjalani aktivitas hari ini?', opts: [['Sangat baik', 3], ['Cukup baik', 2], ['Biasa saja', 1], ['Kurang baik', 0]] },
  { q: 'Apakah ada sesuatu yang sedang mengganggu pikiranmu?', opts: [['Tidak ada', 3], ['Sedikit', 2], ['Cukup mengganggu', 1], ['Sangat mengganggu', 0]] },
  { q: 'Bagaimana energimu hari ini?', opts: [['Sangat bersemangat', 3], ['Cukup bersemangat', 2], ['Biasa saja', 1], ['Kurang bersemangat', 0]] },
  { q: 'Bagaimana hubunganmu dengan orang-orang di sekitarmu hari ini?', opts: [['Sangat baik', 3], ['Baik', 2], ['Biasa saja', 1], ['Kurang baik', 0]] },
];

function buildPrompt(moodLabel) {
  return `Kamu membantu aplikasi pengecekan suasana hati (mood check-in) untuk pelajar di Indonesia.
Pengguna baru saja memilih suasana hati: "${moodLabel}".

Buat 4 pertanyaan check-in harian singkat dalam Bahasa Indonesia yang ramah, hangat, dan TIDAK menghakimi atau terasa seperti diagnosis medis/psikologis.
Pertanyaan harus terasa segar dan bervariasi setiap kali diminta (jangan selalu pertanyaan yang sama), namun tetap relevan untuk mengenali kondisi emosi/energi/pikiran/hubungan sosial/istirahat sehari-hari remaja.

Untuk SETIAP pertanyaan, buat TEPAT 4 pilihan jawaban, diurutkan dari yang paling positif ke paling negatif, dengan skor tetap 3, 2, 1, 0 (dalam urutan itu).

Balas HANYA dalam format JSON valid seperti ini, tanpa teks tambahan apa pun:
{
  "questions": [
    {
      "q": "teks pertanyaan",
      "opts": [["pilihan sangat positif", 3], ["pilihan cukup positif", 2], ["pilihan kurang positif", 1], ["pilihan sangat negatif", 0]]
    }
  ]
}`;
}

app.post('/api/generate-questions', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      console.warn('OPENAI_API_KEY belum diset, mengirim pertanyaan fallback.');
      return res.json({ questions: FALLBACK_QUESTIONS, source: 'fallback' });
    }

    const moodId = req.body && req.body.mood;
    const moodLabel = MOOD_LABELS[moodId] || 'suasana hati hari ini';

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Kamu adalah asisten yang membuat pertanyaan check-in mood dalam format JSON yang ketat.' },
          { role: 'user', content: buildPrompt(moodLabel) },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI error:', openaiRes.status, errText);
      return res.json({ questions: FALLBACK_QUESTIONS, source: 'fallback' });
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const valid = questions.filter(
      (item) => item && typeof item.q === 'string' && Array.isArray(item.opts) && item.opts.length === 4
    );

    if (valid.length < 3) {
      return res.json({ questions: FALLBACK_QUESTIONS, source: 'fallback' });
    }

    res.json({ questions: valid, source: 'openai' });
  } catch (err) {
    console.error('Gagal membuat pertanyaan:', err);
    res.json({ questions: FALLBACK_QUESTIONS, source: 'fallback' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`MoodCheck backend berjalan di http://localhost:${PORT}`);
});

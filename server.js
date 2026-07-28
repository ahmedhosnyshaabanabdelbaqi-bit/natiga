const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'natiga.db');

// Auto restore DB from all db_part_*.gz files if natiga.db does not exist
function ensureDatabaseExists() {
    if (fs.existsSync(dbPath)) return;

    console.log('--- natiga.db missing. Auto-assembling from compressed parts... ---');
    try {
        const files = fs.readdirSync(__dirname);
        const partFiles = files.filter(f => f.startsWith('db_part_') && f.endsWith('.gz'))
                               .sort((a, b) => {
                                   const numA = parseInt(a.replace(/\D/g, '')) || 0;
                                   const numB = parseInt(b.replace(/\D/g, '')) || 0;
                                   return numA - numB;
                               });

        console.log(`Found ${partFiles.length} DB part files:`, partFiles);
        const buffers = [];

        for (const p of partFiles) {
            const pPath = path.join(__dirname, p);
            buffers.push(fs.readFileSync(pPath));
        }

        if (buffers.length > 0) {
            const combinedGz = Buffer.concat(buffers);
            const decompressed = zlib.gunzipSync(combinedGz);
            fs.writeFileSync(dbPath, decompressed);
            console.log(`✓ Successfully assembled natiga.db (${(decompressed.length / 1024 / 1024).toFixed(2)} MB)!`);
        }
    } catch (e) {
        console.error('Error auto-assembling DB:', e.message);
    }
}

ensureDatabaseExists();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let db;
function getDbConnection() {
    if (!db) {
        ensureDatabaseExists();
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error connecting to SQLite database:', err.message);
            } else {
                console.log('Connected to SQLite database: natiga.db');
            }
        });
    }
    return db;
}

getDbConnection();

// Search API Endpoint
app.get('/api/search', (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) {
        return res.json({ success: false, message: 'يرجى إدخال اسم الطالب أو رقم الجلوس للبحث', results: [] });
    }

    const database = getDbConnection();
    const isNumber = /^\d+$/.test(query);

    if (isNumber) {
        const seatingNo = parseInt(query, 10);
        const sql = `SELECT * FROM students WHERE seating_no = ? LIMIT 10`;
        
        database.all(sql, [seatingNo], (err, rows) => {
            if (err) {
                console.error('Search error:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({
                success: true,
                searchType: 'seating_no',
                query: seatingNo,
                count: rows.length,
                results: rows
            });
        });
    } else {
        const nameQuery = `%${query}%`;
        const sql = `SELECT * FROM students WHERE arabic_name LIKE ? ORDER BY total_degree DESC LIMIT 50`;
        
        database.all(sql, [nameQuery], (err, rows) => {
            if (err) {
                console.error('Search error:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({
                success: true,
                searchType: 'arabic_name',
                query: query,
                count: rows.length,
                results: rows
            });
        });
    }
});

// Overall Stats Endpoint
app.get('/api/stats', (req, res) => {
    const database = getDbConnection();
    const sql = `
        SELECT 
            COUNT(*) as total_students, 
            MAX(total_degree) as max_degree, 
            AVG(total_degree) as avg_degree
        FROM students
    `;
    database.get(sql, [], (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, stats: row });
    });
});

// Serve Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'natiga.html'));
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 خادم موقع أحمد حسني لنتائج الثانوية العامة يعمل على: http://localhost:${PORT}`);
    console.log(`====================================================`);
});

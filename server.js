const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(session({
    secret: 'super-secret-async-key',
    resave: false,
    saveUninitialized: false
}));

// Multer setup for save files
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${req.params.slug}_${uuidv4()}${ext}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

// Helper to get games from JSON
function getGamesFromJSON() {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) return [];
    
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    const games = files.map(file => {
        const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
        return { ...content, slug: content.slug || path.basename(file, '.json') };
    });
    
    return games.sort((a, b) => a.name.localeCompare(b.name));
}

// Auth Middleware
const requireAuth = (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    next();
};

// --- API ROUTES ---

// Auth
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    
    const hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], function(err) {
        if (err) return res.status(400).json({ error: 'Username taken' });
        
        // Make first user admin
        if (this.lastID === 1) {
            db.run('UPDATE users SET is_admin = 1 WHERE id = 1');
        }
        
        req.session.userId = this.lastID;
        req.session.username = username;
        res.json({ success: true, username });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        
        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ success: true, username: user.username });
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.json({ user: null });
    db.get('SELECT username, current_game_slug, is_admin FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        res.json({ user });
    });
});

// Games
app.get('/api/games', (req, res) => {
    const jsonGames = getGamesFromJSON();
    const slugs = jsonGames.map(g => `'${g.slug}'`).join(',');
    
    if (slugs.length === 0) return res.json([]);

    db.all(`SELECT * FROM games WHERE slug IN (${slugs})`, (err, dbGames) => {
        const dbMap = {};
        dbGames.forEach(g => dbMap[g.slug] = g);

        const result = jsonGames.map(jg => {
            const dg = dbMap[jg.slug] || {};
            return {
                ...jg,
                status: dg.current_user_id ? 'locked' : 'available',
                current_user_id: dg.current_user_id,
                current_save_filename: dg.current_save_filename
            };
        });
        res.json(result);
    });
});

app.get('/api/game/:slug', (req, res) => {
    const slug = req.params.slug;
    const jsonGame = getGamesFromJSON().find(g => g.slug === slug);
    if (!jsonGame) return res.status(404).json({ error: 'Game not found' });

    db.get('SELECT * FROM games WHERE slug = ?', [slug], (err, game) => {
        db.all('SELECT * FROM logs WHERE game_slug = ? ORDER BY started_at DESC', [slug], (err, logs) => {
            db.get('SELECT username FROM users WHERE id = ?', [game?.current_user_id], (err, currentUser) => {
                const totalSeconds = logs.reduce((sum, l) => sum + (l.duration_seconds || 0), 0);
                
                res.json({
                    ...jsonGame,
                    status: game?.current_user_id ? 'locked' : 'available',
                    current_user: currentUser?.username || null,
                    locked_at: game?.locked_at,
                    current_save_filename: game?.current_save_filename,
                    logs: logs.map(l => ({ ...l, duration_seconds: l.duration_seconds || Math.floor((Date.now() - l.started_at)/1000) })),
                    total_time_seconds: totalSeconds
                });
            });
        });
    });
});

// Claim / Release
app.post('/api/game/:slug/claim', requireAuth, (req, res) => {
    const slug = req.params.slug;
    const userId = req.session.userId;

    db.get('SELECT current_game_slug FROM users WHERE id = ?', [userId], (err, user) => {
        if (user.current_game_slug) return res.status(400).json({ error: 'You are already playing a game. Finish it first.' });

        db.get('SELECT current_user_id FROM games WHERE slug = ?', [slug], (err, game) => {
            if (game && game.current_user_id) return res.status(400).json({ error: 'Game is currently locked by another player.' });

            const now = Date.now();
            db.serialize(() => {
                db.run('UPDATE users SET current_game_slug = ? WHERE id = ?', [slug, userId]);
                db.run(`INSERT INTO games (slug, current_user_id, locked_at) VALUES (?, ?, ?)
                        ON CONFLICT(slug) DO UPDATE SET current_user_id = ?, locked_at = ?`, 
                        [slug, userId, now, userId, now]);
                db.run('INSERT INTO logs (game_slug, user_id, username, started_at) VALUES (?, ?, ?, ?)',
                        [slug, userId, req.session.username, now]);
                
                res.json({ success: true });
            });
        });
    });
});

app.post('/api/game/:slug/release', requireAuth, upload.single('savefile'), (req, res) => {
    const slug = req.params.slug;
    const userId = req.session.userId;

    db.get('SELECT current_game_slug FROM users WHERE id = ?', [userId], (err, user) => {
        if (user.current_game_slug !== slug) return res.status(400).json({ error: 'You are not currently playing this game.' });

        const now = Date.now();
        const filename = req.file ? req.file.filename : null;

        db.serialize(() => {
            db.run('UPDATE users SET current_game_slug = NULL WHERE id = ?', [userId]);
            db.run('UPDATE games SET current_user_id = NULL, locked_at = NULL, current_save_filename = COALESCE(?, current_save_filename) WHERE slug = ?', [filename, slug]);
            db.run('UPDATE logs SET ended_at = ?, duration_seconds = ? WHERE game_slug = ? AND user_id = ? AND ended_at IS NULL', 
                   [now, Math.floor((now - (req.body.started_at || now)) / 1000), slug, userId]);
            
            res.json({ success: true });
        });
    });
});

// Settings (Admin only)
app.get('/api/settings', (req, res) => {
    db.all('SELECT * FROM settings', (err, rows) => {
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    });
});

app.post('/api/settings', requireAuth, (req, res) => {
    db.get('SELECT is_admin FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });
        
        const { start_time, end_time } = req.body;
        db.serialize(() => {
            if (start_time) db.run('UPDATE settings SET value = ? WHERE key = "start_time"', [start_time]);
            if (end_time) db.run('UPDATE settings SET value = ? WHERE key = "end_time"', [end_time]);
            res.json({ success: true });
        });
    });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

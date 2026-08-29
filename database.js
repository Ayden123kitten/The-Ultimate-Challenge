const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'async.db'), (err) => {
    if (err) console.error(err.message);
    console.log('Connected to the SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        current_game_slug TEXT,
        is_admin INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS games (
        slug TEXT PRIMARY KEY,
        current_user_id INTEGER,
        locked_at INTEGER,
        current_save_filename TEXT,
        FOREIGN KEY(current_user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_slug TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        duration_seconds INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // Initialize default settings if not exist
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('start_time', '0')`);
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('end_time', '0')`);
});

module.exports = db;

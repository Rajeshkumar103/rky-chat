const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const db = new DatabaseSync(
    path.join(__dirname, "rkychat.db")
);

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        profile_name TEXT,
        photo TEXT,
        status TEXT DEFAULT 'Offline',
        last_seen TEXT
    );

    CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        friend_username TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT,
        UNIQUE(username, friend_username)
    );

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        receiver TEXT NOT NULL,
        message TEXT,
        photo TEXT,
        video TEXT,
        voice TEXT,
        time TEXT,
        seen INTEGER DEFAULT 0,
        delivered INTEGER DEFAULT 0,
        reply_to INTEGER,
        reaction TEXT,
        pinned INTEGER DEFAULT 0,
        starred INTEGER DEFAULT 0,
        edited INTEGER DEFAULT 0,
        deleted INTEGER DEFAULT 0
    );
`);

// ========================================
// 🔧 SAFE DATABASE MIGRATIONS
// Existing data/messages are preserved.
// ========================================

function addColumnIfMissing(table, column, definition) {
    const columns = db
        .prepare(`PRAGMA table_info(${table})`)
        .all();

    const exists = columns.some(
        col => col.name === column
    );

    if (!exists) {
        db.exec(
            `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
        );

        console.log(
            `✅ Added ${table}.${column}`
        );
    }
}

// Friends
addColumnIfMissing(
    "friends",
    "status",
    "TEXT DEFAULT 'pending'"
);

// Messages
addColumnIfMissing(
    "messages",
    "voice",
    "TEXT"
);

addColumnIfMissing(
    "messages",
    "reply_to",
    "INTEGER"
);

addColumnIfMissing(
    "messages",
    "reaction",
    "TEXT"
);

addColumnIfMissing(
    "messages",
    "pinned",
    "INTEGER DEFAULT 0"
);

addColumnIfMissing(
    "messages",
    "starred",
    "INTEGER DEFAULT 0"
);

addColumnIfMissing(
    "messages",
    "edited",
    "INTEGER DEFAULT 0"
);

addColumnIfMissing(
    "messages",
    "deleted",
    "INTEGER DEFAULT 0"
);

// ========================================
// 🗑️ Delete-for-me
// ========================================

db.exec(`
    CREATE TABLE IF NOT EXISTS deleted_for (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        UNIQUE(message_id, username)
    );
`);

// ========================================
// 🔔 Push subscriptions
// ========================================

db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);


// ========================================
// ❤️ Individual message reactions
// ========================================

db.exec(`
    CREATE TABLE IF NOT EXISTS message_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        reaction TEXT NOT NULL,
        UNIQUE(message_id, username)
    );
`);

console.log("Rky Chat Database Ready ✅");

module.exports = db;

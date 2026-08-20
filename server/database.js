const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const db = new DatabaseSync(path.join(__dirname, "rkychat.db"));

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
        time TEXT,
        seen INTEGER DEFAULT 0,
        delivered INTEGER DEFAULT 0,
        re      reaction TEXT,
        pinned INTEGER DEFAULT 0,
        starred INTEGER DEFAULT 0
    );
`);
try {
    db.exec(`
        ALTER TABLE friends
        ADD COLUMN status TEXT DEFAULT 'pending'
    `);
} catch (error) {
    if (!error.message.includes("duplicate column")) {
        console.log("Friends status migration:", error.message);
    }
}

try {
    db.exec(`
        ALTER TABLE messages
        ADD COLUMN edited INTEGER DEFAULT 0
    `);
} catch (error) {
    if (!error.message.includes("duplicate column")) {
        console.log("Messages edited migration:", error.message);
    }
}

try {
    db.exec(`
        ALTER TABLE messages
        ADD COLUMN voice TEXT
    `);
} catch (error) {
    if (!error.message.includes("duplicate column")) {
        console.log("Messages voice migration:", error.message);
    }
}
  

try {
    db.prepare("ALTER TABLE messages ADD COLUMN deleted INTEGER DEFAULT 0").run();
    console.log("Messages deleted column added ✅");
} catch (error) {
    if (!error.message.includes("duplicate column")) {
        console.log("Messages deleted migration:", error.message);
    }
}

db.exec(`
CREATE TABLE IF NOT EXISTS deleted_for (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    UNIQUE(message_id, username)
);
`);

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

console.log("Rky Chat Database Ready ✅");

module.exports = db;

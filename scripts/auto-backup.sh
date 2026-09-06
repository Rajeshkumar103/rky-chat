#!/data/data/com.termux/files/usr/bin/bash

set -e

PROJECT="$HOME/rky-chat"
DB="$PROJECT/server/rkychat.db"
MEDIA="$PROJECT/server/uploads"
BACKUP_DIR="$PROJECT/backups/secure"
LOG_DIR="$PROJECT/backups/logs"

ARCHIVE="$BACKUP_DIR/rkychat-secure-backup.7z"
TEMP_ARCHIVE="$BACKUP_DIR/rkychat-secure-backup-new.7z"
LOG="$LOG_DIR/auto-backup.log"

REMOTE="dropbox:RkyChat-Private-Backup"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

echo "========================================" >> "$LOG"
echo "Rky Chat automatic backup started: $(date)" >> "$LOG"

echo "📦 Creating database backup..."

rm -f "$BACKUP_DIR/rkychat-latest.db"

node - <<'NODE'
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");

const source = "server/rkychat.db";
const target = "backups/secure/rkychat-latest.db";

const db = new DatabaseSync(source);
db.exec(`VACUUM INTO '${target}'`);
db.close();

console.log("Database backup created:", target);
console.log("Size:", fs.statSync(target).size, "bytes");
NODE

BACKUP_PASS="$(cat "$HOME/.rkychat-backup-password")"
rm -f "$TEMP_ARCHIVE"

echo "🔐 Creating encrypted archive..."

if ! 7z a \
    -t7z \
    -mhe=on \
    "-p$BACKUP_PASS" \
    "$TEMP_ARCHIVE" \
    "$BACKUP_DIR/rkychat-latest.db" \
    "$MEDIA"; then
    echo "❌ 7z encryption failed."
    rm -f "$TEMP_ARCHIVE"
    unset BACKUP_PASS
    exit 1
fi

if [ ! -s "$TEMP_ARCHIVE" ]; then
    echo "❌ Encrypted archive is empty."
    rm -f "$TEMP_ARCHIVE"
    unset BACKUP_PASS
    exit 1
fi

mv -f "$TEMP_ARCHIVE" "$ARCHIVE"

unset BACKUP_PASS

echo "☁️ Uploading to Dropbox..."

rclone copy \
    "$ARCHIVE" \
    "$REMOTE" \
    -P \
    >> "$LOG" 2>&1

echo "🔎 Verifying Dropbox backup..."

rclone ls "$REMOTE" | grep "rkychat-secure-backup.7z" >> "$LOG"

echo "✅ BACKUP SUCCESS: $(date)" >> "$LOG"
echo "========================================" >> "$LOG"

echo "✅ Rky Chat backup completed successfully."
echo "☁️ Dropbox: $REMOTE"
echo "📦 Archive: $ARCHIVE"

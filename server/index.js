require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const photoUploadDir = path.join(__dirname, "uploads", "photo");
const videoUploadDir = path.join(__dirname, "uploads", "video");

fs.mkdirSync(photoUploadDir, { recursive: true });
fs.mkdirSync(videoUploadDir, { recursive: true });
const webpush = require("web-push");
const db = require("./database");

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        "mailto:rkychat@example.com",
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    console.log("VAPID configured ✅");
} else {
    console.log("VAPID keys not configured — push notifications disabled ⚠️");
}

const app = express();
const voiceStorage = multer.diskStorage({
    destination: function(req, file, cb){
        cb(null, "server/uploads/voice");
    },
    filename: function(req, file, cb){
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const voiceUpload = multer({
    storage: voiceStorage,
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/uploads/voice", express.static("server/uploads/voice"));

// 🔔 Service Worker
app.get("/service-worker.js", (req, res) => {
    res.sendFile("service-worker.js", {
        root: process.cwd()
    });
});


app.get("/", (req, res) => {
 res.sendFile(path.join(__dirname, "../index.html"));   
});

// Register
app.post("/api/register", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "Username and password are required"
        });
    }

    try {
        const stmt = db.prepare(`
            INSERT INTO users (username, password, profile_name, status)
            VALUES (?, ?, ?, ?)
        `);

        stmt.run(username, password, username, "Online");

        res.json({
            success: true,
            message: "Registration successful"
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                success: false,
                message: "Username already exists"
            });
        }

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Registration failed"
        });
    }
});

// Change Password
app.post("/api/change-password", (req, res) => {

    const {
        username,
        currentPassword,
        newPassword
    } = req.body;

    if(!username || !currentPassword || !newPassword){
        return res.status(400).json({
            success: false,
            message: "All password fields are required"
        });
    }

    if(newPassword.length < 4){
        return res.status(400).json({
            success: false,
            message: "New password must be at least 4 characters"
        });
    }

    const user = db.prepare(`
        SELECT id, username
        FROM users
        WHERE username = ? AND password = ?
    `).get(username, currentPassword);

    if(!user){
        return res.status(401).json({
            success: false,
            message: "Current password is incorrect"
        });
    }

    db.prepare(`
        UPDATE users
        SET password = ?
        WHERE id = ?
    `).run(newPassword, user.id);

    res.json({
        success: true,
        message: "Password changed successfully"
    });
});

// Login
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "Username and password are required"
        });
    }

    const user = db.prepare(`
        SELECT id, username, profile_name, photo, status
        FROM users
        WHERE username = ? AND password = ?
    `).get(username, password);

    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Invalid username or password"
        });
    }

    db.prepare(`
        UPDATE users
        SET status = 'Online', last_seen = ?
        WHERE username = ?
    `).run(new Date().toISOString(), username);

    res.json({
        success: true,
        message: "Login successful",
        user: user
    });
});
// Send friend request
app.post("/api/friend-request", (req, res) => {
    const { username, friend_username } = req.body;

    if (!username || !friend_username) {
        return res.status(400).json({
            success: false,
            message: "Username and friend username are required"
        });
    }

    if (username === friend_username) {
        return res.status(400).json({
            success: false,
            message: "You cannot add yourself"
        });
    }

    const sender = db.prepare(`
        SELECT id FROM users WHERE username = ?
    `).get(username);

    const receiver = db.prepare(`
        SELECT id FROM users WHERE username = ?
    `).get(friend_username);

    if (!sender || !receiver) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        });
    }

    const existing = db.prepare(`
        SELECT id, status
        FROM friends
        WHERE username = ? AND friend_username = ?
    `).get(username, friend_username);

    if (existing) {
        return res.status(409).json({
            success: false,
            message: "Friend request already exists"
        });
    }

    db.prepare(`
        INSERT INTO friends
        (username, friend_username, status, created_at)
        VALUES (?, ?, 'pending', ?)
    `).run(
        username,
        friend_username,
        new Date().toISOString()
    );

    res.json({
        success: true,
        message: "Friend request sent"
    });
});
// Friend request test page
app.get("/friend-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Friend Request Test</h2>

        <form method="POST" action="/api/friend-request">
            <input name="username" placeholder="Your Username" required>
            <br><br>

            <input name="friend_username" placeholder="Friend Username" required>
            <br><br>

            <button type="submit">Send Friend Request</button>
        </form>
    `);
});
// Get pending friend requests
app.get("/api/friend-requests/:username", (req, res) => {
    const username = req.params.username;

    const requests = db.prepare(`
        SELECT id, username, friend_username, created_at
        FROM friends
        WHERE friend_username = ? AND status = 'pending'
        ORDER BY id DESC
    `).all(username);

    res.json({
        success: true,
        requests: requests
    });
});

// Accept friend request
app.post("/api/friend-requests/:id/accept", (req, res) => {
    const requestId = Number(req.params.id);

    const request = db.prepare(`
        SELECT id, username, friend_username, status
        FROM friends
        WHERE id = ? AND status = 'pending'
    `).get(requestId);

    if (!request) {
        return res.status(404).json({
            success: false,
            message: "Friend request not found"
        });
    }

    db.prepare(`
        UPDATE friends
        SET status = 'accepted'
        WHERE id = ?
    `).run(requestId);

    // Create the reverse friendship
    const reverse = db.prepare(`
        SELECT id
        FROM friends
        WHERE username = ? AND friend_username = ?
    `).get(request.friend_username, request.username);

    if (!reverse) {
        db.prepare(`
            INSERT INTO friends
            (username, friend_username, status, created_at)
            VALUES (?, ?, 'accepted', ?)
        `).run(
            request.friend_username,
            request.username,
            new Date().toISOString()
        );
    } else {
        db.prepare(`
            UPDATE friends
            SET status = 'accepted'
            WHERE id = ?
        `).run(reverse.id);
    }

    res.json({
        success: true,
        message: "Friend request accepted"
    });
});

// Update profile
app.post("/api/profile/update", (req, res) => {
    const { username, profileName, photo } = req.body;

    if (!username) {
        return res.status(400).json({
            success: false,
            message: "Username is required"
        });
    }

    const user = db.prepare(`
        SELECT id, username, profile_name, photo, status, last_seen
        FROM users
        WHERE username = ?
    `).get(username);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        });
    }

    const newName =
        profileName !== undefined && profileName !== ""
            ? profileName
            : user.profile_name;

    const newPhoto =
        photo !== undefined
            ? photo
            : user.photo;

    db.prepare(`
        UPDATE users
        SET profile_name = ?,
            photo = ?
        WHERE username = ?
    `).run(
        newName,
        newPhoto,
        username
    );

    const updatedUser = db.prepare(`
        SELECT
            id,
            username,
            profile_name AS profileName,
            photo,
            status,
            last_seen AS lastSeen
        FROM users
        WHERE username = ?
    `).get(username);

    res.json({
        success: true,
        message: "Profile updated successfully",
        user: updatedUser
    });
});

// Get friends list with profile information
app.get("/api/friends/:username", (req, res) => {
    const username = req.params.username;

    const friends = db.prepare(`
        SELECT
            f.friend_username AS username,
            u.profile_name AS profileName,
            u.photo AS photo,
            u.status AS status,
            u.last_seen AS lastSeen
        FROM friends f
        LEFT JOIN users u
            ON u.username = f.friend_username
        WHERE f.username = ?
          AND f.status = 'accepted'
        ORDER BY f.friend_username
    `).all(username);

    res.json({
        success: true,
        friends: friends
    });
});
// Friend request accept test page
app.get("/accept-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Accept Friend Request</h2>

        <form method="POST" action="/api/friend-requests/1/accept">
            <button type="submit">
                Accept Rajesh's Friend Request
            </button>
        </form>
    `);
});
// 🔔 Save browser Push Subscription
app.post("/api/push/subscribe", (req, res) => {

    try {

        const { username, subscription } = req.body;

        if (
            !username ||
            !subscription ||
            !subscription.endpoint ||
            !subscription.keys ||
            !subscription.keys.p256dh ||
            !subscription.keys.auth
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid push subscription"
            });
        }

        db.prepare(`
            INSERT INTO push_subscriptions
            (username, endpoint, p256dh, auth)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(username)
            DO UPDATE SET
                endpoint = excluded.endpoint,
                p256dh = excluded.p256dh,
                auth = excluded.auth,
                created_at = CURRENT_TIMESTAMP
        `).run(
            username,
            subscription.endpoint,
            subscription.keys.p256dh,
            subscription.keys.auth
        );

        console.log(
            "🔔 Push subscription saved:",
            username
        );

        res.json({
            success: true,
            message: "Push subscription saved"
        });

    } catch (error) {

        console.error(
            "Push subscription error:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to save push subscription"
        });
    }
});

// Send message
app.post("/api/messages", async (req, res) => {
    const { sender, receiver, message, reply_to } = req.body;

    if (!sender || !receiver || !message) {
        return res.status(400).json({
            success: false,
            message: "Sender, receiver and message are required"
        });
    }

    const senderUser = db.prepare(`
        SELECT id FROM users WHERE username = ?
    `).get(sender);

    const receiverUser = db.prepare(`
        SELECT id FROM users WHERE username = ?
    `).get(receiver);

    if (!senderUser || !receiverUser) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        });
    }

    const friendship = db.prepare(`
        SELECT id
        FROM friends
        WHERE username = ?
          AND friend_username = ?
          AND status = 'accepted'
    `).get(sender, receiver);

    if (!friendship) {
        return res.status(403).json({
            success: false,
            message: "Users are not friends"
        });
    }

    const time = new Date().toISOString();

    let replyTo = null;

    if(reply_to !== null && reply_to !== undefined && reply_to !== ""){
        const originalMessage = db.prepare(`
            SELECT id
            FROM messages
            WHERE id = ?
        `).get(Number(reply_to));

        if(!originalMessage){
            return res.status(404).json({
                success: false,
                message: "Original message not found"
            });
        }

        replyTo = Number(reply_to);
    }

    const result = db.prepare(`
        INSERT INTO messages
        (sender, receiver, message, time, delivered, reply_to)
        VALUES (?, ?, ?, ?, 1, ?)
    `).run(
        sender,
        receiver,
        message,
        time,
        replyTo
    );

    // 🔔 Send Web Push notification to receiver
    try {

        const subscriptions = db.prepare(`
            SELECT endpoint, p256dh, auth
            FROM push_subscriptions
            WHERE username = ?
        `).all(receiver);

        for(const sub of subscriptions){

            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };

            await webpush.sendNotification(
                pushSubscription,
                JSON.stringify({
                    title: "Rky Chat",
                    body: message || "📩 New message",
                    sender: sender
                })
            );
        }

        console.log(
            "🔔 Push notification sent to:",
            receiver
        );

    } catch(error) {

        console.error(
            "Push notification error:",
            error.message
        );
    }

    res.json({
        success: true,
        message: "Message sent",
        messageId: Number(result.lastInsertRowid),
        replyTo: replyTo,
        time: time
    });
});
// Get reaction details
app.get("/api/messages/:id/reactions", (req, res) => {

    const messageId = Number(req.params.id);

    if (!messageId) {
        return res.status(400).json({
            success: false,
            message: "Invalid message id"
        });
    }

    const message = db.prepare(`
        SELECT id, sender, receiver
        FROM messages
        WHERE id = ?
    `).get(messageId);

    if (!message) {
        return res.status(404).json({
            success: false,
            message: "Message not found"
        });
    }

    const users = db.prepare(`
        SELECT username, reaction
        FROM message_reactions
        WHERE message_id = ?
        ORDER BY id ASC
    `).all(messageId);

    const counts = db.prepare(`
        SELECT reaction, COUNT(*) AS count
        FROM message_reactions
        WHERE message_id = ?
        GROUP BY reaction
        ORDER BY count DESC
    `).all(messageId);

    res.json({
        success: true,
        messageId: messageId,
        counts: counts,
        users: users
    });
});


// Get chat messages
app.get("/api/messages/:username/:friend", (req, res) => {
    const { username, friend } = req.params;

    const messages = db.prepare(`
        SELECT
            id,
            sender,
            receiver,
            message,
            photo,
            video,
            voice,
            time,
            seen,
            delivered,
            reply_to,
            reaction,
            pinned,
            starred,
            edited,
            deleted
        FROM messages
        WHERE
            (
                (sender = ? AND receiver = ?)
                OR
                (sender = ? AND receiver = ?)
            )
            AND NOT EXISTS (
                SELECT 1
                FROM deleted_for
                WHERE deleted_for.message_id = messages.id
                  AND deleted_for.username = ?
            )
        ORDER BY id ASC
    `).all(username, friend, friend, username, username);

    // Add individual reactions for every message
    for (const msg of messages) {
        msg.reactions = db.prepare(`
            SELECT username, reaction
            FROM message_reactions
            WHERE message_id = ?
            ORDER BY id ASC
        `).all(msg.id);
    }

    // Add individual reactions for every message
    for (const msg of messages) {
        msg.reactions = db.prepare(`
            SELECT username, reaction
            FROM message_reactions
            WHERE message_id = ?
            ORDER BY id ASC
        `).all(msg.id);
    }

    res.json({
        success: true,
        messages: messages
    });
});
// Message test page
app.get("/message-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Message Test</h2>

        <form method="POST" action="/api/messages">

            <input
                name="sender"
                placeholder="Sender"
                value="Rajesh"
                required
            >
            <br><br>

            <input
                name="receiver"
                placeholder="Receiver"
                value="Shivam"
                required
            >
            <br><br>

            <input
                name="message"
                placeholder="Message"
                required
            >
            <br><br>

            <button type="submit">Send Message</button>

        </form>
    `);
});
// Mark messages as seen
app.post("/api/messages/seen", (req, res) => {
    const { username, friend } = req.body;

    if (!username || !friend) {
        return res.status(400).json({
            success: false,
            message: "Username and friend are required"
        });
    }

    const result = db.prepare(`
        UPDATE messages
        SET seen = 1
        WHERE sender = ?
          AND receiver = ?
          AND seen = 0
    `).run(friend, username);

    res.json({
        success: true,
        message: "Messages marked as seen",
        updated: result.changes
    });
});
// Seen test page
app.get("/seen-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Seen Test</h2>

        <form method="POST" action="/api/messages/seen">
            <input
                name="username"
                value="Shivam"
                placeholder="Your Username"
                required
            >
            <br><br>

            <input
                name="friend"
                value="Rajesh"
                placeholder="Friend Username"
                required
            >
            <br><br>

            <button type="submit">Mark Messages as Seen</button>
        </form>
    `);
});
// Reply to a message
app.post("/api/messages/reply", (req, res) => {
    const { sender, receiver, message, reply_to } = req.body;

    if (!sender || !receiver || !message || !reply_to) {
        return res.status(400).json({
            success: false,
            message: "Sender, receiver, message and reply_to are required"
        });
    }

    const originalMessage = db.prepare(`
        SELECT id, sender, receiver, message
        FROM messages
        WHERE id = ?
    `).get(reply_to);

    if (!originalMessage) {
        return res.status(404).json({
            success: false,
            message: "Original message not found"
        });
    }

    const friendship = db.prepare(`
        SELECT id
        FROM friends
        WHERE username = ?
          AND friend_username = ?
          AND status = 'accepted'
    `).get(sender, receiver);

    if (!friendship) {
        return res.status(403).json({
            success: false,
            message: "Users are not friends"
        });
    }

    const time = new Date().toISOString();

    const result = db.prepare(`
        INSERT INTO messages
        (sender, receiver, message, time, delivered, reply_to)
        VALUES (?, ?, ?, ?, 1, ?)
    `).run(
        sender,
        receiver,
        message,
        time,
        reply_to
    );

    res.json({
        success: true,
        message: "Reply sent",
        messageId: Number(result.lastInsertRowid),
        replyTo: Number(reply_to),
        time: time
    });
});
// Reply test page
app.get("/reply-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Reply Test</h2>

        <p>Original Message:</p>
        <div style="padding:10px;border:1px solid #ccc;">
            Hlo
        </div>

        <br>

        <form method="POST" action="/api/messages/reply">

            <input
                name="sender"
                value="Shivam"
                required
            >

            <br><br>

            <input
                name="receiver"
                value="Rajesh"
                required
            >

            <br><br>

            <input
                name="message"
                value="Yes"
                placeholder="Your reply"
                required
            >

            <br><br>

            <input
                name="reply_to"
                value="1"
                type="number"
                required
            >

            <br><br>

            <button type="submit">
                Send Reply
            </button>

        </form>
    `);
});
// Star / Unstar message
app.post("/api/messages/star", (req, res) => {
    const { message_id, username } = req.body;

    if (!message_id || !username) {
        return res.status(400).json({
            success: false,
            message: "message_id and username are required"
        });
    }

    const message = db.prepare(`
        SELECT id, sender, receiver, starred
        FROM messages
        WHERE id = ?
    `).get(message_id);

    if (!message) {
        return res.status(404).json({
            success: false,
            message: "Message not found"
        });
    }

    if (message.sender !== username && message.receiver !== username) {
        return res.status(403).json({
            success: false,
            message: "You cannot star this message"
        });
    }

    const newStatus = message.starred === 1 ? 0 : 1;

    db.prepare(`
        UPDATE messages
        SET starred = ?
        WHERE id = ?
    `).run(newStatus, message_id);

    res.json({
        success: true,
        message: newStatus === 1 ? "Message starred" : "Message unstarred",
        messageId: Number(message_id),
        starred: newStatus
    });
});
// Star test page
app.get("/star-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Star Test ⭐</h2>

        <p>Message:</p>
        <div style="padding:10px;border:1px solid #ccc;">
            Hlo
        </div>

        <br>

        <form method="POST" action="/api/messages/star">

            <input
                name="message_id"
                value="1"
                type="number"
                required
            >

            <br><br>

            <input
                name="username"
                value="Rajesh"
                required
            >

            <br><br>

            <button type="submit">
                ⭐ Star / Unstar
            </button>

        </form>
    `);
});
// Message Reaction
app.post("/api/messages/reaction", (req, res) => {
    const { message_id, username, reaction } = req.body;

    if (!message_id || !username || !reaction) {
        return res.status(400).json({
            success: false,
            message: "message_id, username and reaction are required"
        });
    }

    const allowedReactions = ["❤️", "👍", "😂", "😮", "😢", "😡", "👎"];

    if (!allowedReactions.includes(reaction)) {
        return res.status(400).json({
            success: false,
            message: "Invalid reaction"
        });
    }

    const message = db.prepare(`
        SELECT id, sender, receiver, reaction
        FROM messages
        WHERE id = ?
    `).get(message_id);

    if (!message) {
        return res.status(404).json({
            success: false,
            message: "Message not found"
        });
    }

    if (message.sender !== username && message.receiver !== username) {
        return res.status(403).json({
            success: false,
            message: "You cannot react to this message"
        });
    }

    // Keep the old reaction field for backward compatibility
    db.prepare(`
        UPDATE messages
        SET reaction = ?
        WHERE id = ?
    `).run(reaction, message_id);

    // Save / update this user's reaction in the new reaction table
    db.prepare(`
        INSERT INTO message_reactions
        (message_id, username, reaction, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(message_id, username)
        DO UPDATE SET
            reaction = excluded.reaction,
            created_at = excluded.created_at
    `).run(
        message_id,
        username,
        reaction,
        new Date().toISOString()
    );

    // Get reaction counts
    const counts = db.prepare(`
        SELECT reaction, COUNT(*) AS count
        FROM message_reactions
        WHERE message_id = ?
        GROUP BY reaction
        ORDER BY count DESC
    `).all(message_id);

    // Get individual users and their reactions
    const users = db.prepare(`
        SELECT username, reaction
        FROM message_reactions
        WHERE message_id = ?
        ORDER BY id ASC
    `).all(message_id);

    res.json({
        success: true,
        message: "Reaction added",
        messageId: Number(message_id),
        reaction: reaction,
        counts: counts,
        users: users
    });
});
// Remove this user's reaction
app.post("/api/messages/reaction/remove", (req, res) => {
    const { message_id, username } = req.body;

    if (!message_id || !username) {
        return res.status(400).json({
            success: false,
            message: "message_id and username are required"
        });
    }

    const message = db.prepare(`
        SELECT id, sender, receiver
        FROM messages
        WHERE id = ?
    `).get(message_id);

    if (!message) {
        return res.status(404).json({
            success: false,
            message: "Message not found"
        });
    }

    if (message.sender !== username && message.receiver !== username) {
        return res.status(403).json({
            success: false,
            message: "You cannot remove reaction from this message"
        });
    }

    db.prepare(`
        DELETE FROM message_reactions
        WHERE message_id = ? AND username = ?
    `).run(message_id, username);

    const latestReaction = db.prepare(`
        SELECT reaction
        FROM message_reactions
        WHERE message_id = ?
        ORDER BY id DESC
        LIMIT 1
    `).get(message_id);

    db.prepare(`
        UPDATE messages
        SET reaction = ?
        WHERE id = ?
    `).run(
        latestReaction ? latestReaction.reaction : null,
        message_id
    );

    const counts = db.prepare(`
        SELECT reaction, COUNT(*) AS count
        FROM message_reactions
        WHERE message_id = ?
        GROUP BY reaction
        ORDER BY count DESC
    `).all(message_id);

    const users = db.prepare(`
        SELECT username, reaction
        FROM message_reactions
        WHERE message_id = ?
        ORDER BY id ASC
    `).all(message_id);

    res.json({
        success: true,
        message: "Reaction removed",
        messageId: Number(message_id),
        counts: counts,
        users: users
    });
});

// Reaction test page
app.get("/reaction-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Reaction Test ❤️</h2>

        <p>Message:</p>

        <div style="padding:10px;border:1px solid #ccc;">
            Hlo
        </div>

        <br>

        <form method="POST" action="/api/messages/reaction">

            <input
                name="message_id"
                value="1"
                type="number"
                required
            >

            <br><br>

            <input
                name="username"
                value="Rajesh"
                required
            >

            <br><br>

            <select name="reaction">
                <option value="❤️">❤️ Like</option>
                <option value="👍">👍 Like</option>
                <option value="😂">😂 Laugh</option>
                <option value="😮">😮 Wow</option>
                <option value="😢">😢 Sad</option>
                <option value="😡">😡 Angry</option>
            </select>

            <br><br>

            <button type="submit">
                Add Reaction
            </button>

        </form>
    `);
});
// Pin / Unpin message
app.post("/api/messages/pin", (req, res) => {
    const { message_id, username } = req.body;

    if (!message_id || !username) {
        return res.status(400).json({
            success: false,
            message: "message_id and username are required"
        });
    }

    const message = db.prepare(`
        SELECT id, sender, receiver, pinned
        FROM messages
        WHERE id = ?
    `).get(message_id);

    if (!message) {
        return res.status(404).json({
            success: false,
            message: "Message not found"
        });
    }

    if (message.sender !== username && message.receiver !== username) {
        return res.status(403).json({
            success: false,
            message: "You cannot pin this message"
        });
    }

    const newStatus = message.pinned === 1 ? 0 : 1;

    db.prepare(`
        UPDATE messages
        SET pinned = ?
        WHERE id = ?
    `).run(newStatus, message_id);

    res.json({
        success: true,
        message: newStatus === 1
            ? "Message pinned"
            : "Message unpinned",
        messageId: Number(message_id),
        pinned: newStatus
    });
});
// Pin test page
app.get("/pin-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Pin Test 📌</h2>

        <p>Message:</p>

        <div style="padding:10px;border:1px solid #ccc;">
            Hlo
        </div>

        <br>

        <form method="POST" action="/api/messages/pin">

            <input
                name="message_id"
                value="1"
                type="number"
                required
            >

            <br><br>

            <input
                name="username"
                value="Rajesh"
                required
            >

            <br><br>

            <button type="submit">
                📌 Pin / Unpin
            </button>

        </form>
    `);
});
// Delete message
app.post("/api/messages/delete", (req, res) => {
    const { message_id, username } = req.body;

    if (!message_id || !username) {
        return res.status(400).json({
            success: false,
            message: "message_id and username are required"
        });
    }

    const message = db.prepare(`
        SELECT id, sender
        FROM messages
        WHERE id = ?
    `).get(message_id);

    if (!message) {
        return res.status(404).json({
            success: false,
            message: "Message not found"
        });
    }

    // Only the sender can delete the message
    if (message.sender !== username) {
        return res.status(403).json({
            success: false,
            message: "You can only delete your own message"
        });
    }

    db.prepare(`
        UPDATE messages
        SET deleted = 1
        WHERE id = ?
    `).run(message_id);

    res.json({
        success: true,
        message: "Message deleted",
        messageId: Number(message_id)
    });
});
// Delete test page
app.get("/delete-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Delete Test 🗑️</h2>

        <p>Message:</p>

        <div style="padding:10px;border:1px solid #ccc;">
            Hlo
        </div>

        <br>

        <form method="POST" action="/api/messages/delete">

            <input
                name="message_id"
                value="1"
                type="number"
                required
            >

            <br><br>

            <input
                name="username"
                value="Rajesh"
                required
            >

            <br><br>

            <button type="submit">
                🗑️ Delete Message
            </button>

        </form>
    `);
});
// Delete message for me
app.post("/api/messages/delete-for-me", (req, res) => {
    const { message_id, username } = req.body;

    if (!message_id || !username) {
        return res.status(400).json({
            success: false,
            message: "message_id and username are required"
        });
    }

    const message = db.prepare(`
        SELECT id, sender, receiver
        FROM messages
        WHERE id = ?
    `).get(message_id);

    if (!message) {
        return res.status(404).json({
            success: false,
            message: "Message not found"
        });
    }

    if (message.sender !== username && message.receiver !== username) {
        return res.status(403).json({
            success: false,
            message: "You cannot delete this message"
        });
    }

    db.prepare(`
        INSERT OR IGNORE INTO deleted_for
        (message_id, username)
        VALUES (?, ?)
    `).run(message_id, username);

    res.json({
        success: true,
        message: "Message deleted for you",
        messageId: Number(message_id)
    });
});

// Edit message
app.post("/api/messages/edit", (req, res) => {
    const { message_id, username, message } = req.body;

    if (!message_id || !username || !message) {
        return res.status(400).json({
            success: false,
            message: "message_id, username and message are required"
        });
    }

    const oldMessage = db.prepare(`
        SELECT id, sender
        FROM messages
        WHERE id = ?
    `).get(message_id);

    if (!oldMessage) {
        return res.status(404).json({
            success: false,
            message: "Message not found"
        });
    }

    // Only sender can edit
    if (oldMessage.sender !== username) {
        return res.status(403).json({
            success: false,
            message: "You can only edit your own message"
        });
    }

    db.prepare(`
        UPDATE messages
        SET message = ?, edited = 1
        WHERE id = ?
    `).run(message, message_id);

    res.json({
        success: true,
        message: "Message edited",
        messageId: Number(message_id),
        newMessage: message
    });
});
// Edit test page
app.get("/edit-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Edit Test ✏️</h2>

        <p>Message ID:</p>

        <input
            id="message_id"
            value="2"
            type="number"
        >

        <br><br>

        <p>Username:</p>

        <input
            id="username"
            value="Shivam"
        >

        <br><br>

        <p>New Message:</p>

        <input
            id="message"
            value="Yes 👍 Edited"
        >

        <br><br>

        <button onclick="editMessage()">
            ✏️ Edit Message
        </button>

        <pre id="result"></pre>

        <script>
        async function editMessage() {

            const response = await fetch("/api/messages/edit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message_id: Number(
                        document.getElementById("message_id").value
                    ),
                    username:
                        document.getElementById("username").value,
                    message:
                        document.getElementById("message").value
                })
            });

            const data = await response.json();

            document.getElementById("result").textContent =
                JSON.stringify(data, null, 2);
        }
        </script>
    `);
});
// Forward message
app.post("/api/messages/forward", (req, res) => {
    const { message_id, sender, receiver } = req.body;

    if (!message_id || !sender || !receiver) {
        return res.status(400).json({
            success: false,
            message: "message_id, sender and receiver are required"
        });
    }

    const original = db.prepare(`
        SELECT id, message
        FROM messages
        WHERE id = ?
    `).get(message_id);

    if (!original) {
        return res.status(404).json({
            success: false,
            message: "Original message not found"
        });
    }

    const result = db.prepare(`
        INSERT INTO messages
        (sender, receiver, message, delivered, seen, pinned, starred)
        VALUES (?, ?, ?, 1, 0, 0, 0)
    `).run(
        sender,
        receiver,
        original.message
    );

    res.json({
        success: true,
        message: "Message forwarded",
        messageId: Number(result.lastInsertRowid),
        forwardedFrom: Number(message_id),
        time: new Date().toISOString()
    });
});
// Forward test page
app.get("/forward-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Forward Test ➡️</h2>

        <p>Original Message ID:</p>

        <input
            id="message_id"
            value="2"
            type="number"
        >

        <br><br>

        <p>Sender:</p>

        <input
            id="sender"
            value="Shivam"
        >

        <br><br>

        <p>Receiver:</p>

        <input
            id="receiver"
            value="Rajesh"
        >

        <br><br>

        <button onclick="forwardMessage()">
            ➡️ Forward Message
        </button>

        <pre id="result"></pre>

        <script>
        async function forwardMessage() {

            const response = await fetch(
                "/api/messages/forward",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        message_id: Number(
                            document.getElementById("message_id").value
                        ),
                        sender:
                            document.getElementById("sender").value,
                        receiver:
                            document.getElementById("receiver").value
                    })
                }
            );

            const data = await response.json();

            document.getElementById("result").textContent =
                JSON.stringify(data, null, 2);
        }
        </script>
    `);
});
// Search messages
app.get("/api/messages/search", (req, res) => {
    const { username, friend, q } = req.query;

    if (!username || !friend || !q) {
        return res.status(400).json({
            success: false,
            message: "username, friend and q are required"
        });
    }

    const searchText = `%${q}%`;

    const messages = db.prepare(`
        SELECT
            id,
            sender,
            receiver,
            message,
            photo,
            video,
            time,
            seen,
            delivered,
            reply_to,
            reaction,
            pinned,
            starred
        FROM messages
        WHERE
            (
                (sender = ? AND receiver = ?)
                OR
                (sender = ? AND receiver = ?)
            )
            AND message LIKE ?
        ORDER BY id ASC
    `).all(
        username,
        friend,
        friend,
        username,
        searchText
    );

    res.json({
        success: true,
        count: messages.length,
        messages
    });
});
// Search test page
app.get("/search-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Message Search 🔍</h2>

        <p>Username:</p>
        <input id="username" value="Rajesh">

        <br><br>

        <p>Friend:</p>
        <input id="friend" value="Shivam">

        <br><br>

        <p>Search:</p>
        <input id="q" value="Yes">

        <br><br>

        <button onclick="searchMessages()">
            🔍 Search
        </button>

        <pre id="result"></pre>

        <script>
        async function searchMessages() {

            const username =
                document.getElementById("username").value;

            const friend =
                document.getElementById("friend").value;

            const q =
                document.getElementById("q").value;

            const response = await fetch(
                "/api/messages/search?username=" +
                encodeURIComponent(username) +
                "&friend=" +
                encodeURIComponent(friend) +
                "&q=" +
                encodeURIComponent(q)
            );

            const data = await response.json();

            document.getElementById("result").textContent =
                JSON.stringify(data, null, 2);
        }
        </script>
    `);
});
// Unread message count
app.get("/api/messages/unread", (req, res) => {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({
            success: false,
            message: "username is required"
        });
    }

    const rows = db.prepare(`
        SELECT
            sender,
            COUNT(*) AS unread
        FROM messages
        WHERE receiver = ?
          AND seen = 0
        GROUP BY sender
        ORDER BY sender ASC
    `).all(username);

    const total = rows.reduce(
        (sum, row) => sum + row.unread,
        0
    );

    res.json({
        success: true,
        totalUnread: total,
        unread: rows
    });
});
// Unread test page
app.get("/unread-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Unread Test 🔴</h2>

        <p>Username:</p>

        <input
            id="username"
            value="Rajesh"
        >

        <br><br>

        <button onclick="checkUnread()">
            🔴 Check Unread
        </button>

        <pre id="result"></pre>

        <script>
        async function checkUnread() {

            const username =
                document.getElementById("username").value;

            const response = await fetch(
                "/api/messages/unread?username=" +
                encodeURIComponent(username)
            );

            const data = await response.json();

            document.getElementById("result").textContent =
                JSON.stringify(data, null, 2);
        }
        </script>
    `);
});
// Update user online/offline status
app.post("/api/status", (req, res) => {
    const { username, status } = req.body;

    if (!username || !status) {
        return res.status(400).json({
            success: false,
            message: "username and status are required"
        });
    }

    if (!["Online", "Offline"].includes(status)) {
        return res.status(400).json({
            success: false,
            message: "Status must be Online or Offline"
        });
    }

    const user = db.prepare(`
        SELECT id, username
        FROM users
        WHERE username = ?
    `).get(username);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        });
    }

    db.prepare(`
        UPDATE users
        SET status = ?
        WHERE username = ?
    `).run(status, username);

    res.json({
        success: true,
        username,
        status
    });
});
// Get user status
app.get("/api/status/:username", (req, res) => {
    const { username } = req.params;

    const user = db.prepare(`
        SELECT username, status
        FROM users
        WHERE username = ?
    `).get(username);

    if (!user) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        });
    }

    res.json({
        success: true,
        username: user.username,
        status: user.status
    });
});
// Status test page
app.get("/status-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Status Test 🟢</h2>

        <p>Username:</p>
        <input id="username" value="Rajesh">

        <br><br>

        <button onclick="setStatus('Online')">
            🟢 Online
        </button>

        <button onclick="setStatus('Offline')">
            🔴 Offline
        </button>

        <br><br>

        <button onclick="getStatus()">
            🔍 Check Status
        </button>

        <pre id="result"></pre>

        <script>
        async function setStatus(status) {

            const username =
                document.getElementById("username").value;

            const response = await fetch("/api/status", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: username,
                    status: status
                })
            });

            const data = await response.json();

            document.getElementById("result").textContent =
                JSON.stringify(data, null, 2);
        }

        async function getStatus() {

            const username =
                document.getElementById("username").value;

            const response = await fetch(
                "/api/status/" +
                encodeURIComponent(username)
            );

            const data = await response.json();

            document.getElementById("result").textContent =
                JSON.stringify(data, null, 2);
        }
        </script>
    `);
});
// Typing status
const typingUsers = {};

app.post("/api/typing", (req, res) => {
    const { username, friend, typing } = req.body;

    if (!username || !friend || typeof typing !== "boolean") {
        return res.status(400).json({
            success: false,
            message: "username, friend and typing are required"
        });
    }

    if (!typingUsers[friend]) {
        typingUsers[friend] = {};
    }

    typingUsers[friend][username] = typing;

    res.json({
        success: true,
        username,
        friend,
        typing
    });
});
app.get("/api/typing/:username/:friend", (req, res) => {
    const { username, friend } = req.params;

    const typing =
        typingUsers[username]?.[friend] || false;

    res.json({
        success: true,
        username,
        friend,
        typing
    });
});
// Typing test page
app.get("/typing-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Typing Test ⌨️</h2>

        <p>Username:</p>
        <input id="username" value="Rajesh">

        <br><br>

        <p>Friend:</p>
        <input id="friend" value="Shivam">

        <br><br>

        <button onclick="setTyping(true)">
            ⌨️ Start Typing
        </button>

        <button onclick="setTyping(false)">
            ⏹️ Stop Typing
        </button>

        <br><br>

        <button onclick="checkTyping()">
            🔍 Check Typing
        </button>

        <pre id="result"></pre>

        <script>
        async function setTyping(value) {

            const username =
                document.getElementById("username").value;

            const friend =
                document.getElementById("friend").value;

            const response = await fetch("/api/typing", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: username,
                    friend: friend,
                    typing: value
                })
            });

            const data = await response.json();

            document.getElementById("result").textContent =
                JSON.stringify(data, null, 2);
        }

        async function checkTyping() {

            const username =
                document.getElementById("username").value;

            const friend =
                document.getElementById("friend").value;

            const response = await fetch(
                "/api/typing/" +
                encodeURIComponent(username) +
                "/" +
                encodeURIComponent(friend)
            );

            const data = await response.json();

            document.getElementById("result").textContent =
                JSON.stringify(data, null, 2);
        }
        </script>
    `);
});

// Photo / Video file upload
const mediaStorage = multer.diskStorage({
    destination: function(req, file, cb){
        if(file.mimetype.startsWith("image/")){
            cb(null, photoUploadDir);
        }
        else if(file.mimetype.startsWith("video/")){
            cb(null, videoUploadDir);
        }
        else{
            cb(new Error("Only image and video files are allowed"));
        }
    },
    filename: function(req, file, cb){
        const safeName = file.originalname
            .replace(/[^a-zA-Z0-9._-]/g, "_");

        cb(null, Date.now() + "-" + safeName);
    }
});

const mediaUpload = multer({
    storage: mediaStorage,
    limits: {
        fileSize: 500 * 1024 * 1024
    },
    fileFilter: function(req, file, cb){
        if(
            file.mimetype.startsWith("image/") ||
            file.mimetype.startsWith("video/")
        ){
            cb(null, true);
        }
        else{
            cb(new Error("Only image and video files are allowed"));
        }
    }
});

app.use("/uploads/photo", express.static(photoUploadDir));
app.use("/uploads/video", express.static(videoUploadDir));

app.post(
    "/api/messages/media-upload",
    mediaUpload.single("media"),
    (req, res) => {

        const { sender, receiver, message } = req.body;

        if(!sender || !receiver || !req.file){
            return res.status(400).json({
                success: false,
                message: "Sender, receiver and media file are required"
            });
        }

        const senderUser = db.prepare(
            "SELECT id FROM users WHERE username = ?"
        ).get(sender);

        const receiverUser = db.prepare(
            "SELECT id FROM users WHERE username = ?"
        ).get(receiver);

        if(!senderUser || !receiverUser){
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const isPhoto = req.file.mimetype.startsWith("image/");
        const mediaUrl =
            (isPhoto ? "/uploads/photo/" : "/uploads/video/") +
            req.file.filename;

        const time = new Date().toISOString();

        const result = db.prepare(`
            INSERT INTO messages
            (sender, receiver, message, photo, video, time, delivered, seen)
            VALUES (?, ?, ?, ?, ?, ?, 1, 0)
        `).run(
            sender,
            receiver,
            message || "",
            isPhoto ? mediaUrl : null,
            isPhoto ? null : mediaUrl,
            time
        );

        res.json({
            success: true,
            message: "Media uploaded successfully",
            messageId: Number(result.lastInsertRowid),
            sender: sender,
            receiver: receiver,
            photo: isPhoto ? mediaUrl : null,
            video: isPhoto ? null : mediaUrl,
            time: time
        });
    }
);

// Photo / Video message
app.post("/api/messages/media", (req, res) => {
    const {
        sender,
        receiver,
        message,
        photo,
        video
    } = req.body;

    if (!sender || !receiver) {
        return res.status(400).json({
            success: false,
            message: "sender and receiver are required"
        });
    }

    if (!photo && !video) {
        return res.status(400).json({
            success: false,
            message: "photo or video is required"
        });
    }

    const result = db.prepare(`
        INSERT INTO messages
        (sender, receiver, message, photo, video, delivered, seen)
        VALUES (?, ?, ?, ?, ?, 1, 0)
    `).run(
        sender,
        receiver,
        message || null,
        photo || null,
        video || null
    );

    res.json({
        success: true,
        message: "Media message sent",
        messageId: Number(result.lastInsertRowid),
        sender,
        receiver,
        photo: photo || null,
        video: video || null,
        time: new Date().toISOString()
    });
});
// Media test page
app.get("/media-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Photo / Video Test 📷🎥</h2>

        <p>Sender:</p>
        <input id="sender" value="Rajesh">

        <br><br>

        <p>Receiver:</p>
        <input id="receiver" value="Shivam">

        <br><br>

        <p>Photo URL:</p>
        <input
            id="photo"
            placeholder="https://example.com/photo.jpg"
        >

        <br><br>

        <p>Video URL:</p>
        <input
            id="video"
            placeholder="https://example.com/video.mp4"
        >

        <br><br>

        <p>Message:</p>
        <input id="message" value="Photo test 📷">

        <br><br>

        <button onclick="sendMedia()">
            📤 Send Media
        </button>

        <pre id="result"></pre>

        <script>
        async function sendMedia() {

            const sender =
                document.getElementById("sender").value;

            const receiver =
                document.getElementById("receiver").value;

            const photo =
                document.getElementById("photo").value;

            const video =
                document.getElementById("video").value;

            const message =
                document.getElementById("message").value;

            const response = await fetch(
                "/api/messages/media",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        sender: sender,
                        receiver: receiver,
                        message: message,
                        photo: photo || null,
                        video: video || null
                    })
                }
            );

            const data = await response.json();

            document.getElementById("result").textContent =
                JSON.stringify(data, null, 2);
        }
        </script>
    `);
});
// Register test page
app.get("/register-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Register Test</h2>

        <form method="POST" action="/api/register">
            <input name="username" placeholder="Username" required>
            <br><br>
            <input name="password" placeholder="Password" type="password" required>
            <br><br>
            <button type="submit">Register</button>
        </form>
    `);
});

// Login test page
app.get("/login-test", (req, res) => {
    res.send(`
        <h2>Rky Chat Login Test</h2>

        <form method="POST" action="/api/login">
            <input name="username" placeholder="Username" required>
            <br><br>
            <input name="password" placeholder="Password" type="password" required>
            <br><br>
            <button type="submit">Login</button>
        </form>
    `);
});

// Server status
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Rky Chat Server is working",
        version: "1.0.0"
    });
});
// Voice upload
app.post("/api/voice", voiceUpload.single("voice"), (req, res) => {
    const { sender, receiver } = req.body;

    if (!sender || !receiver || !req.file) {
        return res.status(400).json({
            success: false,
            message: "Sender, receiver and voice file are required"
        });
    }

    const senderUser = db.prepare(
        "SELECT id FROM users WHERE username = ?"
    ).get(sender);

    const receiverUser = db.prepare(
        "SELECT id FROM users WHERE username = ?"
    ).get(receiver);

    if (!senderUser || !receiverUser) {
        return res.status(404).json({
            success: false,
            message: "User not found"
        });
    }

    const friendship = db.prepare(`
        SELECT id
        FROM friends
        WHERE username = ?
        AND friend_username = ?
        AND status = 'accepted'
    `).get(sender, receiver);

    if (!friendship) {
        return res.status(403).json({
            success: false,
            message: "Users are not friends"
        });
    }

    const time = new Date().toISOString();
    const voiceUrl = "/uploads/voice/" + req.file.filename;

    const result = db.prepare(`
        INSERT INTO messages
        (sender, receiver, message, voice, time, delivered)
        VALUES (?, ?, ?, ?, ?, 1)
    `).run(
        sender,
        receiver,
        "",
        voiceUrl,
        time
    );

    res.json({
        success: true,
        message: "Voice sent",
        messageId: Number(result.lastInsertRowid),
        voice: voiceUrl,
        time: time
    });
});
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: "*"
    }
});

// 📞 Rky Chat Voice Call Signaling
const onlineCallUsers = new Map();

io.on("connection", socket => {

    console.log("📞 Call socket connected:", socket.id);

    socket.on("register-call-user", username => {

        if(!username){
            return;
        }

        onlineCallUsers.set(username, socket.id);

        socket.data.username = username;

        console.log(
            "📞 Call user registered:",
            username
        );
    });

    socket.on("call-user", data => {

        const {
            from,
            to,
            offer
        } = data || {};

        const receiverSocket =
            onlineCallUsers.get(to);

        if(!receiverSocket){
            socket.emit("call-user-error", {
                message: "User is offline"
            });
            return;
        }

        io.to(receiverSocket).emit(
            "incoming-call",
            {
                from: from,
                offer: offer
            }
        );
    });

    socket.on("answer-call", data => {

        const {
            from,
            to,
            answer
        } = data || {};

        const receiverSocket =
            onlineCallUsers.get(to);

        if(receiverSocket){

            io.to(receiverSocket).emit(
                "call-answered",
                {
                    from: from,
                    answer: answer
                }
            );
        }
    });

    socket.on("ice-candidate", data => {

        const {
            from,
            to,
            candidate
        } = data || {};

        const receiverSocket =
            onlineCallUsers.get(to);

        if(receiverSocket){

            io.to(receiverSocket).emit(
                "ice-candidate",
                {
                    from: from,
                    candidate: candidate
                }
            );
        }
    });

    socket.on("reject-call", data => {

        const {
            from,
            to
        } = data || {};

        const receiverSocket =
            onlineCallUsers.get(to);

        if(receiverSocket){

            io.to(receiverSocket).emit(
                "call-rejected",
                {
                    from: from
                }
            );
        }
    });

    socket.on("end-call", data => {

        const {
            from,
            to
        } = data || {};

        const receiverSocket =
            onlineCallUsers.get(to);

        if(receiverSocket){

            io.to(receiverSocket).emit(
                "call-ended",
                {
                    from: from
                }
            );
        }
    });


    // 📹 Rky Chat Video Call Signaling

    socket.on("video-call-user", data => {

        const {
            from,
            to,
            offer
        } = data || {};

        const receiverSocket =
            onlineCallUsers.get(to);

        if(!receiverSocket){

            socket.emit("video-call-error", {
                message: "User is offline"
            });

            return;
        }

        io.to(receiverSocket).emit(
            "incoming-video-call",
            {
                from: from,
                offer: offer
            }
        );

        console.log(
            "📹 Video call:",
            from,
            "->",
            to
        );

    });


    socket.on("video-answer-call", data => {

        const {
            from,
            to,
            answer
        } = data || {};

        const receiverSocket =
            onlineCallUsers.get(to);

        if(receiverSocket){

            io.to(receiverSocket).emit(
                "video-call-answered",
                {
                    from: from,
                    answer: answer
                }
            );

        }

    });


    socket.on("video-ice-candidate", data => {

        const {
            from,
            to,
            candidate
        } = data || {};

        const receiverSocket =
            onlineCallUsers.get(to);

        if(receiverSocket){

            io.to(receiverSocket).emit(
                "video-ice-candidate",
                {
                    from: from,
                    candidate: candidate
                }
            );

        }

    });


    socket.on("video-reject-call", data => {

        const {
            from,
            to
        } = data || {};

        const receiverSocket =
            onlineCallUsers.get(to);

        if(receiverSocket){

            io.to(receiverSocket).emit(
                "video-call-rejected",
                {
                    from: from
                }
            );

        }

    });


    socket.on("video-end-call", data => {

        const {
            from,
            to
        } = data || {};

        const receiverSocket =
            onlineCallUsers.get(to);

        if(receiverSocket){

            io.to(receiverSocket).emit(
                "video-call-ended",
                {
                    from: from
                }
            );

        }

    });


    socket.on("disconnect", () => {

        const username =
            socket.data.username;

        if(
            username &&
            onlineCallUsers.get(username) === socket.id
        ){

            onlineCallUsers.delete(username);

        }

        console.log(
            "📞 Call socket disconnected:",
            socket.id
        );
    });

});

httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Rky Chat Server running on port ${PORT}`);
});

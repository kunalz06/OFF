const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- File Upload Setup ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
// Multer setup for image uploads in memory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit
app.use('/uploads', express.static(uploadsDir));

// --- MongoDB Connection ---
const mongoUrl = process.env.MONGO_URI;
const client = new MongoClient(mongoUrl);
let usersCollection, statusesCollection;

async function connectMongo() {
    try {
        await client.connect();
        console.log("MongoDB connected!");
        const db = client.db("off_chat_app_v4");
        usersCollection = db.collection("users");
        statusesCollection = db.collection("statuses");
        await usersCollection.createIndex({ username: 1 }, { unique: true });
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        process.exit(1);
    }
}
connectMongo();

let onlineUsers = {};
app.use(express.static('.'));

// --- API Endpoint for Status Upload ---
app.post('/upload-status', upload.single('statusImage'), async (req, res) => {
    const username = req.body.username;
    if (!username || !req.file) {
        return res.status(400).json({ success: false, message: 'Missing username or file.' });
    }
    
    try {
        const fileName = `${Date.now()}-${username}.jpeg`;
        const filePath = path.join(uploadsDir, fileName);

        // Compress image with Sharp to be under 20KB
        await sharp(req.file.buffer)
            .resize(800) // Resize to a max width of 800px to help reduce size
            .jpeg({ quality: 70, progressive: true, force: true })
            .toFile(filePath);
        
        const fileUrl = `/uploads/${fileName}`;

        // Save status to DB
        const statusData = { username, imageUrl: fileUrl, timestamp: new Date() };
        await statusesCollection.insertOne(statusData);

        // Notify clients in real-time
        io.emit('new-status-posted', statusData);

        res.json({ success: true, fileUrl });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, message: 'Error processing image.' });
    }
});

// Helper function to get a user's full data
const getUserData = async (username) => {
    const user = await usersCollection.findOne({ username });
    if (!user) return null;
    const friends = await usersCollection.find({ _id: { $in: user.friends || [] } }).project({ username: 1 }).toArray();
    const friendRequests = await usersCollection.find({ _id: { $in: user.friendRequests || [] } }).project({ username: 1 }).toArray();
    return {
        username: user.username,
        friends: friends.map(f => f.username),
        friendRequests: friendRequests.map(fr => fr.username)
    };
};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // User Login/Registration
    socket.on('join', async (username, callback) => {
        try {
            let user = await usersCollection.findOne({ username });
            if (!user) {
                await usersCollection.insertOne({ username, friends: [], friendRequests: [] });
            }
            socket.username = username;
            onlineUsers[username] = socket.id;
            const userData = await getUserData(username);
            callback({ success: true, userData });
            userData.friends.forEach(friend => {
                if (onlineUsers[friend]) io.to(onlineUsers[friend]).emit('friend-online', username);
            });
        } catch (error) {
            callback({ success: false, message: "Username might be taken or DB error." });
        }
    });

    // Friend Request System
    socket.on('send-friend-request', async ({ recipientUsername }, callback) => { /* ... (Logic from previous step) ... */ });
    socket.on('accept-friend-request', async (senderUsername, callback) => { /* ... (Logic from previous step) ... */ });

    // Private Messaging
    socket.on('private-message', async ({ recipient, text }) => { /* ... (Logic from previous step) ... */ });

    // WebRTC Signaling
    socket.on('call-user', (data) => { /* ... (Logic from previous step) ... */ });
    socket.on('make-answer', (data) => { /* ... (Logic from previous step) ... */ });
    socket.on('ice-candidate', (data) => { /* ... (Logic from previous step) ... */ });

    // Status Feature
    socket.on('get-statuses', async (callback) => {
        try {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const statuses = await statusesCollection.find({ timestamp: { $gte: twentyFourHoursAgo } }).sort({ timestamp: -1 }).toArray();
            callback(statuses);
        } catch (error) {
            callback([]);
        }
    });

    // Disconnect
    socket.on('disconnect', () => { /* ... (Logic from previous step) ... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
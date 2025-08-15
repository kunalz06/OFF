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
// Create an 'uploads' directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer setup for handling image uploads in memory for processing
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB file size limit
});

// Serve the uploaded static files from the 'uploads' directory
app.use('/uploads', express.static(uploadsDir));

// --- MongoDB Connection ---
const mongoUrl = process.env.MONGO_URI; // Your MongoDB Atlas connection string (set in Render)
const client = new MongoClient(mongoUrl);
let usersCollection, statusesCollection;

async function connectMongo() {
    try {
        await client.connect();
        console.log("MongoDB connected successfully!");
        const db = client.db("off_chat_app_v4"); // Using a new DB for this version
        usersCollection = db.collection("users");
        statusesCollection = db.collection("statuses");
        // Ensure usernames are unique to prevent duplicates
        await usersCollection.createIndex({ username: 1 }, { unique: true });
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        process.exit(1);
    }
}
connectMongo();

// In-memory store for quick lookups of online users: { username: socketId }
let onlineUsers = {};

// Serve the main frontend files (index.html, style.css, script.js)
app.use(express.static('.'));

// --- API Endpoint for Status Image Upload ---
app.post('/upload-status', upload.single('statusImage'), async (req, res) => {
    const username = req.body.username;
    if (!username || !req.file) {
        return res.status(400).json({ success: false, message: 'Missing username or file.' });
    }
    
    try {
        const fileName = `${Date.now()}-${username}.jpeg`;
        const filePath = path.join(uploadsDir, fileName);

        // Use Sharp to resize and compress the image to be lightweight (~20KB)
        await sharp(req.file.buffer)
            .resize(800) // Resize to a max width of 800px
            .jpeg({ quality: 70, progressive: true, force: true }) // Adjust quality for size
            .toFile(filePath);
        
        const fileUrl = `/uploads/${fileName}`;

        // Save status metadata to the database
        const statusData = { username, imageUrl: fileUrl, timestamp: new Date() };
        await statusesCollection.insertOne(statusData);

        // Notify all connected clients about the new status in real-time
        io.emit('new-status-posted', statusData);

        res.json({ success: true, fileUrl });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, message: 'Error processing image.' });
    }
});

// Helper function to get a user's full data, including populated friends and requests
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

    // 1. User Login/Registration
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
            // Notify friends that this user is now online
            userData.friends.forEach(friend => {
                if (onlineUsers[friend]) io.to(onlineUsers[friend]).emit('friend-online', username);
            });
        } catch (error) {
            callback({ success: false, message: "Username might be taken or a database error occurred." });
        }
    });

    // 2. Friend Request System
    socket.on('send-friend-request', async ({ recipientUsername }, callback) => {
        const senderUsername = socket.username;
        if (senderUsername === recipientUsername) return callback({ success: false, message: "You can't add yourself." });
        const recipient = await usersCollection.findOne({ username: recipientUsername });
        const sender = await usersCollection.findOne({ username: senderUsername });
        if (!recipient) return callback({ success: false, message: "User not found." });
        if (recipient.friendRequests?.some(id => id.equals(sender._id)) || recipient.friends?.some(id => id.equals(sender._id))) {
             return callback({ success: false, message: "Request already sent or you are already friends." });
        }
        await usersCollection.updateOne({ _id: recipient._id }, { $addToSet: { friendRequests: sender._id } });
        if (onlineUsers[recipientUsername]) {
            io.to(onlineUsers[recipientUsername]).emit('new-friend-request', senderUsername);
        }
        callback({ success: true, message: "Friend request sent!" });
    });

    socket.on('accept-friend-request', async (senderUsername, callback) => {
        const recipientUsername = socket.username;
        const recipient = await usersCollection.findOne({ username: recipientUsername });
        const sender = await usersCollection.findOne({ username: senderUsername });
        if (!sender) return callback({ success: false, message: "Sender not found." });
        await usersCollection.updateOne({ _id: recipient._id }, { $addToSet: { friends: sender._id }, $pull: { friendRequests: sender._id } });
        await usersCollection.updateOne({ _id: sender._id }, { $addToSet: { friends: recipient._id } });
        const updatedRecipientData = await getUserData(recipientUsername);
        callback({ success: true, userData: updatedRecipientData });
        if (onlineUsers[senderUsername]) {
            const updatedSenderData = await getUserData(senderUsername);
            io.to(onlineUsers[senderUsername]).emit('request-accepted', updatedSenderData);
        }
    });

    // 3. Private Messaging
    socket.on('private-message', ({ recipient, text }) => {
        const messageData = { sender: socket.username, recipient, text, timestamp: new Date() };
        const recipientSocketId = onlineUsers[recipient];
        if (recipientSocketId) {
            io.to(recipientSocketId).to(socket.id).emit('private-message', messageData);
        }
    });

    // 4. WebRTC Signaling
    socket.on('call-user', (data) => {
        if (onlineUsers[data.recipient]) io.to(onlineUsers[data.recipient]).emit('call-made', { offer: data.offer, sender: socket.username });
    });
    socket.on('make-answer', (data) => {
        if (onlineUsers[data.sender]) io.to(onlineUsers[data.sender]).emit('answer-made', { answer: data.answer });
    });
    socket.on('ice-candidate', (data) => {
        if (onlineUsers[data.recipient]) io.to(onlineUsers[data.recipient]).emit('ice-candidate', { candidate: data.candidate, sender: socket.username });
    });

    // 5. Status Feature
    socket.on('get-statuses', async (callback) => {
        try {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const statuses = await statusesCollection.find({ timestamp: { $gte: twentyFourHoursAgo } }).sort({ timestamp: -1 }).toArray();
            callback(statuses);
        } catch (error) {
            console.error('Error fetching statuses:', error);
            callback([]);
        }
    });

    // 6. Disconnect
    socket.on('disconnect', async () => {
        if (socket.username) {
            const username = socket.username;
            delete onlineUsers[username];
            const userData = await getUserData(username);
            if (userData) {
                userData.friends.forEach(friend => {
                    if (onlineUsers[friend]) io.to(onlineUsers[friend]).emit('friend-offline', username);
                });
            }
            console.log(`${username} disconnected.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
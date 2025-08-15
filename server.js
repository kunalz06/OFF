const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { MongoClient, ObjectId } = require('mongodb');
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
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 5 * 1024 * 1024 } 
});
app.use('/uploads', express.static(uploadsDir));

// --- MongoDB Connection ---
const mongoUrl = process.env.MONGO_URI;
const client = new MongoClient(mongoUrl);
let usersCollection, statusesCollection;

async function connectMongo() {
    try {
        await client.connect();
        console.log("MongoDB connected successfully!");
        const db = client.db("off_chat_app_v5");
        usersCollection = db.collection("users");
        statusesCollection = db.collection("statuses");
        
        // Ensure usernames are unique
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        
        // **FIXED LOGIC**: Directly create the TTL index.
        // This command is idempotent and will create the collection if it's missing.
        await statusesCollection.createIndex(
            { "timestamp": 1 },
            { expireAfterSeconds: 43200 } // 12 hours
        );
        console.log("TTL index on statuses collection ensured.");

    } catch (err) {
        console.error("Error during MongoDB setup:", err);
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
        await sharp(req.file.buffer)
            .resize(800)
            .jpeg({ quality: 70, progressive: true, force: true })
            .toFile(filePath);
        const fileUrl = `/uploads/${fileName}`;
        const statusData = { username, imageUrl: fileUrl, timestamp: new Date() };
        const result = await statusesCollection.insertOne(statusData);
        io.emit('new-status-posted', { ...statusData, _id: result.insertedId });
        res.json({ success: true, fileUrl });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, message: 'Error processing image.' });
    }
});

// Helper function to get user data
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
        if (!sender) return callback({ success: false, message: "Could not identify sender." });
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
        if (!sender || !recipient) return callback({ success: false, message: "User not found." });
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

    // 5. Status Feature Socket Logic
    socket.on('get-statuses', async (callback) => {
        try {
            const statuses = await statusesCollection.find().sort({ timestamp: -1 }).toArray();
            callback(statuses);
        } catch (error) {
            console.error('Error fetching statuses:', error);
            callback([]);
        }
    });

    socket.on('delete-status', async (statusId, callback) => {
        if (!socket.username) return callback({ success: false, message: 'Authentication error.' });
        try {
            const status = await statusesCollection.findOne({ _id: new ObjectId(statusId) });
            if (!status || status.username !== socket.username) return callback({ success: false, message: 'Unauthorized.' });
            await statusesCollection.deleteOne({ _id: new ObjectId(statusId) });
            const imagePath = path.join(__dirname, status.imageUrl);
            fs.unlink(imagePath, (err) => {
                if (err) console.error("Error deleting status image file:", err);
            });
            io.emit('status-deleted', statusId);
            callback({ success: true });
        } catch (error) {
            console.error("Error deleting status:", error);
            callback({ success: false, message: 'Server error.' });
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
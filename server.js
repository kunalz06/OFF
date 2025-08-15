const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- MongoDB Connection ---
const mongoUrl = process.env.MONGO_URI;
const client = new MongoClient(mongoUrl);
let messagesCollection, statusesCollection;

async function connectMongo() {
    try {
        await client.connect();
        console.log("MongoDB connected successfully!");
        const db = client.db("off_chat_app_v2");
        messagesCollection = db.collection("messages");
        statusesCollection = db.collection("statuses");
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        process.exit(1);
    }
}
connectMongo();

// In-memory user store for simplicity: { username: socketId }
let onlineUsers = {};

app.use(express.static('.'));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. User Joins
    socket.on('join', (username) => {
        socket.username = username;
        onlineUsers[username] = socket.id;
        socket.join(username); // Join a room with their own username

        // Inform others of the new user
        io.emit('user-list', Object.keys(onlineUsers));
        console.log(onlineUsers);
    });

    // 2. Private Messaging
    socket.on('private-message', async (data) => {
        const { recipient, text } = data;
        const recipientSocketId = onlineUsers[recipient];

        const messageData = {
            sender: socket.username,
            recipient: recipient,
            text: text,
            timestamp: new Date()
        };

        await messagesCollection.insertOne(messageData);

        if (recipientSocketId) {
            // Send to recipient and sender
            io.to(recipientSocketId).to(socket.id).emit('private-message', messageData);
        }
    });

    // 3. Status Updates (Feature like X/Instagram Stories)
    socket.on('post-status', async (statusText) => {
        const statusData = {
            username: socket.username,
            text: statusText,
            timestamp: new Date()
        };
        await statusesCollection.insertOne(statusData);
        // Announce new status so clients can refetch
        io.emit('new-status-posted', statusData);
    });

    socket.on('get-statuses', async (callback) => {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const statuses = await statusesCollection.find({ timestamp: { $gte: twentyFourHoursAgo } }).sort({ timestamp: -1 }).toArray();
        callback(statuses);
    });

    // 4. WebRTC Signaling for Private Calls
    socket.on('call-user', (data) => {
        const recipientSocketId = onlineUsers[data.recipient];
        io.to(recipientSocketId).emit('call-made', {
            offer: data.offer,
            sender: socket.username
        });
    });

    socket.on('make-answer', (data) => {
        const senderSocketId = onlineUsers[data.sender];
        io.to(senderSocketId).emit('answer-made', {
            answer: data.answer
        });
    });

    socket.on('ice-candidate', (data) => {
        const recipientSocketId = onlineUsers[data.recipient];
        io.to(recipientSocketId).emit('ice-candidate', {
            candidate: data.candidate
        });
    });


    // 5. User Disconnects
    socket.on('disconnect', () => {
        if (socket.username) {
            delete onlineUsers[socket.username];
            io.emit('user-list', Object.keys(onlineUsers));
            console.log(`${socket.username} disconnected.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
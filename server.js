const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- MongoDB Connection ---
const mongoUrl = process.env.MONGO_URI; // Get URI from Render environment variables
const client = new MongoClient(mongoUrl);
let messagesCollection;

async function connectMongo() {
    try {
        await client.connect();
        console.log("MongoDB connected successfully!");
        const db = client.db("off_chat_app");
        messagesCollection = db.collection("messages");
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        process.exit(1);
    }
}
connectMongo();

// Serve static files from the root directory
app.use(express.static('.'));

// --- Socket.IO Logic ---
io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    // Load message history on connection
    try {
        const messages = await messagesCollection.find().sort({ timestamp: 1 }).toArray();
        socket.emit('history', messages);
    } catch (err) {
        console.error('Error fetching message history:', err);
    }

    // Handle incoming chat messages
    socket.on('chat message', async (msg) => {
        const messageData = { ...msg, timestamp: new Date() };
        
        try {
            await messagesCollection.insertOne(messageData);
            io.emit('chat message', messageData); // Broadcast to all clients
        } catch (err) {
            console.error('Error saving message:', err);
        }
    });

    // --- WebRTC Signaling ---
    socket.on('webrtc-offer', (data) => {
        socket.broadcast.emit('webrtc-offer', data);
    });

    socket.on('webrtc-answer', (data) => {
        socket.broadcast.emit('webrtc-answer', data);
    });
    
    socket.on('webrtc-ice-candidate', (data) => {
        socket.broadcast.emit('webrtc-ice-candidate', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
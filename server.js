const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- MongoDB Connection ---
const mongoUrl = process.env.MONGO_URI; // Make sure to set this in your Render environment
const client = new MongoClient(mongoUrl);
let usersCollection, messagesCollection;

async function connectMongo() {
    try {
        await client.connect();
        console.log("MongoDB connected successfully!");
        const db = client.db("off_chat_app_v3");
        usersCollection = db.collection("users");
        messagesCollection = db.collection("messages");
        // Create a unique index on the username field to prevent duplicates
        await usersCollection.createIndex({ username: 1 }, { unique: true });
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        process.exit(1);
    }
}
connectMongo();

// In-memory store for quick lookups of online users: { username: socketId }
let onlineUsers = {};

app.use(express.static('.'));

// Helper function to get a user's full data, including friends and requests
const getUserData = async (username) => {
    const user = await usersCollection.findOne({ username });
    if (!user) return null;

    // Populate friends and friendRequests arrays with usernames
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
                // If user doesn't exist, create a new one
                const newUser = { username, friends: [], friendRequests: [] };
                await usersCollection.insertOne(newUser);
            }
            
            socket.username = username;
            onlineUsers[username] = socket.id;

            const userData = await getUserData(username);
            callback({ success: true, userData });

            // Notify friends that this user is online
            userData.friends.forEach(friendUsername => {
                const friendSocketId = onlineUsers[friendUsername];
                if (friendSocketId) {
                    io.to(friendSocketId).emit('friend-online', username);
                }
            });

            console.log(`${username} has joined.`);
        } catch (error) {
            console.error("Join error:", error);
            callback({ success: false, message: "Username might be taken or a database error occurred." });
        }
    });
    
    // 2. Friend Request System
    socket.on('send-friend-request', async ({ recipientUsername }, callback) => {
        const senderUsername = socket.username;
        if (senderUsername === recipientUsername) {
            return callback({ success: false, message: "You can't add yourself." });
        }

        const recipient = await usersCollection.findOne({ username: recipientUsername });
        const sender = await usersCollection.findOne({ username: senderUsername });

        if (!recipient) {
            return callback({ success: false, message: "User not found." });
        }
        
        // Check if already friends or a request is already pending
        if (recipient.friendRequests?.some(id => id.equals(sender._id)) || recipient.friends?.some(id => id.equals(sender._id))) {
             return callback({ success: false, message: "Request already sent or you are already friends." });
        }

        await usersCollection.updateOne({ _id: recipient._id }, { $addToSet: { friendRequests: sender._id } });

        // Notify the recipient in real-time if they are online
        const recipientSocketId = onlineUsers[recipientUsername];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('new-friend-request', senderUsername);
        }
        callback({ success: true, message: "Friend request sent!" });
    });

    socket.on('accept-friend-request', async (senderUsername, callback) => {
        const recipientUsername = socket.username;
        const recipient = await usersCollection.findOne({ username: recipientUsername });
        const sender = await usersCollection.findOne({ username: senderUsername });

        if (!sender) return callback({ success: false, message: "Sender not found." });

        // Add each other to friends lists and remove the pending request
        await usersCollection.updateOne({ _id: recipient._id }, { $addToSet: { friends: sender._id }, $pull: { friendRequests: sender._id } });
        await usersCollection.updateOne({ _id: sender._id }, { $addToSet: { friends: recipient._id } });
        
        const updatedRecipientData = await getUserData(recipientUsername);
        callback({ success: true, userData: updatedRecipientData });

        // Notify the original sender that their request was accepted
        const senderSocketId = onlineUsers[senderUsername];
        if (senderSocketId) {
            const updatedSenderData = await getUserData(senderUsername);
            io.to(senderSocketId).emit('request-accepted', updatedSenderData);
        }
    });

    // 3. Private Messaging
    socket.on('private-message', async ({ recipient, text }) => {
        const messageData = { sender: socket.username, recipient, text, timestamp: new Date() };
        // You can save messages to DB here if desired
        // await messagesCollection.insertOne(messageData);
        
        const recipientSocketId = onlineUsers[recipient];
        if (recipientSocketId) {
            io.to(recipientSocketId).to(socket.id).emit('private-message', messageData);
        }
    });

    // 4. WebRTC Signaling for private calls
    socket.on('call-user', (data) => {
        const recipientSocketId = onlineUsers[data.recipient];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('call-made', { offer: data.offer, sender: socket.username });
        }
    });

    socket.on('make-answer', (data) => {
        const senderSocketId = onlineUsers[data.sender];
        if (senderSocketId) {
            io.to(senderSocketId).emit('answer-made', { answer: data.answer });
        }
    });

    socket.on('ice-candidate', (data) => {
        const targetSocketId = onlineUsers[data.recipient];
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', { candidate: data.candidate, sender: socket.username });
        }
    });

    // 5. User Disconnect
    socket.on('disconnect', () => {
        if (socket.username) {
            const username = socket.username;
            delete onlineUsers[username];
            // Notify friends that this user has gone offline
            getUserData(username).then(userData => {
                if (userData) {
                    userData.friends.forEach(friendUsername => {
                        const friendSocketId = onlineUsers[friendUsername];
                        if (friendSocketId) {
                            io.to(friendSocketId).emit('friend-offline', username);
                        }
                    });
                }
            });
            console.log(`${username} disconnected.`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
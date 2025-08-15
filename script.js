document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- Global State ---
    let username = '';
    let activeChat = '';
    let peerConnection;
    let localStream;
    let screenStream;

    // --- DOM Elements ---
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const usernameInput = document.getElementById('username-input');
    const joinBtn = document.getElementById('join-btn');
    const userList = document.getElementById('user-list');
    const chatWindow = document.getElementById('chat-window');
    const statusWindow = document.getElementById('status-window');
    const welcomeScreen = document.getElementById('welcome-screen');
    const messagesContainer = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHeader = document.getElementById('chat-header');
    const statusBtn = document.getElementById('status-btn');
    const statusInput = document.getElementById('status-input');
    const postStatusBtn = document.getElementById('post-status-btn');
    const statusesFeed = document.getElementById('statuses-feed');
    
    // Call Modal Elements
    const callModal = document.getElementById('call-modal');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const screenShareBtn = document.getElementById('screen-share-btn');
    const endCallBtn = document.getElementById('end-call-btn');

    const stunServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // --- 1. Login Logic ---
    joinBtn.addEventListener('click', () => {
        const name = usernameInput.value.trim();
        if (name) {
            username = name;
            socket.emit('join', username);
            loginScreen.classList.add('hidden');
            mainApp.classList.remove('hidden');
            initializeMedia();
        }
    });

    // --- 2. User & Chat Management ---
    socket.on('user-list', (users) => {
        userList.innerHTML = '';
        users.filter(u => u !== username).forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerText = user;
            userItem.onclick = () => openChat(user);
            userList.appendChild(userItem);
        });
    });

    function openChat(user) {
        activeChat = user;
        chatWindow.classList.remove('hidden');
        statusWindow.classList.add('hidden');
        welcomeScreen.classList.add('hidden');
        
        chatHeader.innerHTML = `<span>${user}</span> <button id="call-btn">📞</button>`;
        document.getElementById('call-btn').onclick = () => startCall(user);
        
        messagesContainer.innerHTML = ''; // Clear previous messages
        // Here you would fetch message history from the server
    }
    
    // --- 3. Private Messaging ---
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => (e.key === 'Enter') && sendMessage());

    function sendMessage() {
        const text = messageInput.value.trim();
        if (text && activeChat) {
            socket.emit('private-message', { recipient: activeChat, text });
            messageInput.value = '';
        }
    }

    socket.on('private-message', (msg) => {
        if (msg.sender === activeChat || msg.sender === username) {
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble ' + (msg.sender === username ? 'sent' : 'received');
            bubble.innerText = msg.text;
            messagesContainer.appendChild(bubble);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    });

    // --- 4. Status Feature Logic ---
    statusBtn.addEventListener('click', () => {
        chatWindow.classList.add('hidden');
        welcomeScreen.classList.add('hidden');
        statusWindow.classList.remove('hidden');
        fetchStatuses();
    });

    postStatusBtn.addEventListener('click', () => {
        const text = statusInput.value.trim();
        if (text) {
            socket.emit('post-status', text);
            statusInput.value = '';
        }
    });

    socket.on('new-status-posted', (status) => {
        // Only refresh if the status window is active
        if(!statusWindow.classList.contains('hidden')) {
            prependStatus(status);
        }
    });

    function fetchStatuses() {
        socket.emit('get-statuses', (statuses) => {
            statusesFeed.innerHTML = '';
            statuses.forEach(status => prependStatus(status));
        });
    }

    function prependStatus(status) {
        const post = document.createElement('div');
        post.className = 'status-post';
        post.innerHTML = `<strong>${status.username}</strong><p>${status.text}</p><small>${new Date(status.timestamp).toLocaleTimeString()}</small>`;
        statusesFeed.prepend(post);
    }
    
    // --- 5. Calling and Screen Sharing Logic ---
    async function initializeMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
        } catch (error) { console.error("Error accessing media devices.", error); }
    }

    async function startCall(recipient) {
        callModal.classList.remove('hidden');
        createPeerConnection(recipient);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('call-user', { recipient, offer });
    }
    
    socket.on('call-made', async (data) => {
        const confirmed = confirm(`${data.sender} is calling you. Do you want to accept?`);
        if (!confirmed) return;
        
        callModal.classList.remove('hidden');
        createPeerConnection(data.sender);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('make-answer', { sender: data.sender, answer });
    });

    socket.on('answer-made', async (data) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    });

    socket.on('ice-candidate', (data) => {
        if (peerConnection) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });

    screenShareBtn.addEventListener('click', toggleScreenShare);

    async function toggleScreenShare() {
        if (!screenStream) {
            // Start screen sharing
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(screenTrack);
            screenShareBtn.style.backgroundColor = '#e74c3c'; // Change color to indicate active
            
            screenTrack.onended = () => { // When user stops it from browser UI
                toggleScreenShare();
            };
        } else {
            // Stop screen sharing
            const cameraTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(cameraTrack);
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
            screenShareBtn.style.backgroundColor = '#3498db';
        }
    }

    function createPeerConnection(recipient) {
        peerConnection = new RTCPeerConnection(stunServers);
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { recipient, candidate: event.candidate });
            }
        };
        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    
    endCallBtn.addEventListener('click', () => {
        if(peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        callModal.classList.add('hidden');
    });
});
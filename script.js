document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Screen elements
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    
    // Login
    const usernameInput = document.getElementById('username-input');
    const joinBtn = document.getElementById('join-btn');
    let username = '';

    // Chat elements
    const messagesContainer = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    // Video elements
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const callBtn = document.getElementById('call-btn');

    let localStream;
    let peerConnection;
    const stunServers = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    // --- Login Logic ---
    joinBtn.addEventListener('click', () => {
        const name = usernameInput.value.trim();
        if (name) {
            username = name;
            loginScreen.classList.add('hidden');
            mainApp.classList.remove('hidden');
            initializeMedia();
        }
    });

    // --- Chat Logic ---
    function addMessage(msg) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.innerHTML = `<strong>${msg.username}:</strong> ${msg.text}`;
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    function sendMessage() {
        const text = messageInput.value.trim();
        if (text) {
            socket.emit('chat message', { username, text });
            messageInput.value = '';
        }
    }

    socket.on('history', (messages) => {
        messages.forEach(msg => addMessage(msg));
    });

    socket.on('chat message', (msg) => {
        addMessage(msg);
    });

    // --- WebRTC Logic ---
    async function initializeMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
        } catch (error) {
            console.error("Error accessing media devices.", error);
        }
    }

    callBtn.addEventListener('click', () => {
        if (peerConnection) {
            alert('Call already in progress.');
        } else {
            createPeerConnection();
            peerConnection.createOffer()
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => {
                    socket.emit('webrtc-offer', { sdp: peerConnection.localDescription });
                });
        }
    });

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection(stunServers);
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('webrtc-ice-candidate', { candidate: event.candidate });
            }
        };
        peerConnection.ontrack = event => {
            remoteVideo.srcObject = event.streams[0];
        };
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    
    socket.on('webrtc-offer', (data) => {
        if (!peerConnection) createPeerConnection();
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp))
            .then(() => peerConnection.createAnswer())
            .then(answer => peerConnection.setLocalDescription(answer))
            .then(() => {
                socket.emit('webrtc-answer', { sdp: peerConnection.localDescription });
            });
    });

    socket.on('webrtc-answer', (data) => {
        peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    });

    socket.on('webrtc-ice-candidate', (data) => {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    });
});
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- Global State ---
    let currentUser = { username: '', friends: [], friendRequests: [] };
    let activeChat = '';
    let activeTab = 'chats';
    let peerConnection;
    let localStream;
    let screenStream;
    let incomingCallData = null;

    // --- DOM Elements ---
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const usernameInput = document.getElementById('username-input');
    const joinBtn = document.getElementById('join-btn');
    const contactList = document.getElementById('contact-list');
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const chatWindow = document.getElementById('chat-window');
    const welcomeScreen = document.getElementById('welcome-screen');
    const messagesContainer = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHeader = document.getElementById('chat-header');
    const profileUsername = document.getElementById('profile-username');
    const addUsernameInput = document.getElementById('add-username-input');
    const sendRequestBtn = document.getElementById('send-request-btn');
    const friendRequestsList = document.getElementById('friend-requests-list');
    const statusImageInput = document.getElementById('status-image-input');
    const statusesFeed = document.getElementById('statuses-feed');
    const callModal = document.getElementById('call-modal');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const toggleAudioBtn = document.getElementById('toggle-audio-btn');
    const toggleVideoBtn = document.getElementById('toggle-video-btn');
    const screenShareBtn = document.getElementById('screen-share-btn');
    const endCallBtn = document.getElementById('end-call-btn');
    const callStatus = document.getElementById('call-status');
    const incomingCallToast = document.getElementById('incoming-call-toast');
    const callerUsernameEl = document.getElementById('caller-username');
    const acceptCallBtn = document.getElementById('accept-call-btn');
    const rejectCallBtn = document.getElementById('reject-call-btn');

    const stunServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    // --- 1. Initialization & Login ---
    joinBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        if (username) {
            socket.emit('join', username, (response) => {
                if (response.success) {
                    currentUser = response.userData;
                    loginScreen.classList.add('hidden');
                    mainApp.classList.remove('hidden');
                    initializeMedia();
                    updateUI();
                } else {
                    alert(response.message);
                }
            });
        }
    });

    async function initializeMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
        } catch (error) { console.error("Error accessing media devices.", error); }
    }

    // --- 2. UI Management ---
    function updateUI() {
        profileUsername.textContent = `Welcome, ${currentUser.username}`;
        friendRequestsList.innerHTML = '';
        if (currentUser.friendRequests && currentUser.friendRequests.length > 0) {
            currentUser.friendRequests.forEach(username => {
                const item = document.createElement('div');
                item.className = 'request-item';
                item.innerHTML = `<span>${username}</span><button data-username="${username}">Accept</button>`;
                friendRequestsList.appendChild(item);
            });
        } else {
            friendRequestsList.innerHTML = '<p>No new requests.</p>';
        }
        contactList.innerHTML = '';
        if (currentUser.friends) {
            currentUser.friends.forEach(username => {
                const item = document.createElement('div');
                item.className = 'contact-item';
                item.dataset.username = username;
                item.innerHTML = `<span>${username}</span><div class="status-indicator"></div>`;
                item.onclick = () => {
                    if (activeTab === 'chats') openChat(username);
                    if (activeTab === 'calls') startCall(username);
                };
                contactList.appendChild(item);
            });
        }
    }

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            activeTab = link.dataset.tab;
            tabLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            tabContents.forEach(c => c.classList.add('hidden'));
            document.getElementById(`${activeTab}-tab`).classList.remove('hidden');
            const showContacts = (activeTab === 'chats' || activeTab === 'calls');
            contactList.style.display = showContacts ? 'block' : 'none';
            if (showContacts) updateUI();
            if (activeTab === 'status') fetchStatuses();
        });
    });

    // --- 3. Status Feature Logic ---
    statusImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('username', currentUser.username);
        formData.append('statusImage', file);
        fetch('/upload-status', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                if (!data.success) alert('Upload failed!');
                statusImageInput.value = '';
            })
            .catch(err => console.error('Upload error:', err));
    });

    function fetchStatuses() {
        socket.emit('get-statuses', (statuses) => {
            statusesFeed.innerHTML = '';
            statuses.forEach(status => renderStatus(status));
        });
    }

    function renderStatus(status) {
        const card = document.createElement('div');
        card.className = 'status-card';
        card.innerHTML = `<img src="${status.imageUrl}" alt="Status by ${status.username}"><p><strong>${status.username}</strong></p>`;
        statusesFeed.prepend(card);
    }

    // --- 4. Friend & Chat Logic ---
    sendRequestBtn.addEventListener('click', () => {
        const recipientUsername = addUsernameInput.value.trim();
        if (recipientUsername) {
            socket.emit('send-friend-request', { recipientUsername }, (response) => {
                alert(response.message);
                if (response.success) addUsernameInput.value = '';
            });
        }
    });

    friendRequestsList.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const senderUsername = e.target.dataset.username;
            socket.emit('accept-friend-request', senderUsername, (response) => {
                if (response.success) {
                    currentUser = response.userData;
                    updateUI();
                }
            });
        }
    });

    function openChat(username) {
        activeChat = username;
        chatWindow.classList.remove('hidden');
        welcomeScreen.classList.add('hidden');
        chatHeader.textContent = username;
        messagesContainer.innerHTML = '';
    }

    function sendMessage() {
        const text = messageInput.value.trim();
        if (text && activeChat) {
            socket.emit('private-message', { recipient: activeChat, text });
            messageInput.value = '';
        }
    }
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => (e.key === 'Enter') && sendMessage());

    // --- 5. Real-time Socket Event Handlers ---
    socket.on('private-message', (msg) => {
        if (msg.sender === activeChat || msg.sender === currentUser.username) {
            const bubble = document.createElement('div');
            bubble.className = `message-bubble ${msg.sender === currentUser.username ? 'sent' : 'received'}`;
            bubble.innerText = msg.text;
            messagesContainer.appendChild(bubble);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    });
    socket.on('new-friend-request', (senderUsername) => {
        if (!currentUser.friendRequests.includes(senderUsername)) {
            currentUser.friendRequests.push(senderUsername);
        }
        updateUI();
        alert(`New friend request from ${senderUsername}!`);
    });
    socket.on('request-accepted', (updatedUserData) => {
        currentUser = updatedUserData;
        updateUI();
        alert(`${updatedUserData.username} accepted your friend request!`);
    });
    socket.on('friend-online', (username) => {
        const indicator = document.querySelector(`.contact-item[data-username="${username}"] .status-indicator`);
        if (indicator) indicator.classList.add('online');
    });
    socket.on('friend-offline', (username) => {
        const indicator = document.querySelector(`.contact-item[data-username="${username}"] .status-indicator`);
        if (indicator) indicator.classList.remove('online');
    });
    socket.on('new-status-posted', (status) => {
        if (activeTab === 'status') renderStatus(status);
    });

    // --- 6. WebRTC Calling Logic ---
    function createPeerConnection(recipient) {
        peerConnection = new RTCPeerConnection(stunServers);
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) socket.emit('ice-candidate', { recipient, candidate: event.candidate });
        };
        peerConnection.ontrack = (event) => { remoteVideo.srcObject = event.streams[0]; };
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }
    async function startCall(recipient) {
        callModal.classList.remove('hidden');
        callStatus.textContent = `Calling ${recipient}...`;
        createPeerConnection(recipient);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('call-user', { recipient, offer });
    }
    socket.on('call-made', async (data) => {
        incomingCallData = data;
        callerUsernameEl.textContent = data.sender;
        incomingCallToast.classList.remove('hidden');
    });
    acceptCallBtn.addEventListener('click', async () => {
        incomingCallToast.classList.add('hidden');
        callModal.classList.remove('hidden');
        callStatus.textContent = `In call with ${incomingCallData.sender}`;
        createPeerConnection(incomingCallData.sender);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('make-answer', { sender: incomingCallData.sender, answer });
        incomingCallData = null;
    });
    rejectCallBtn.addEventListener('click', () => {
        incomingCallToast.classList.add('hidden');
        incomingCallData = null;
    });
    socket.on('answer-made', async (data) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    });
    socket.on('ice-candidate', (data) => {
        if (peerConnection) peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    });
    toggleAudioBtn.addEventListener('click', () => {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            toggleAudioBtn.classList.toggle('muted', !audioTrack.enabled);
            toggleAudioBtn.textContent = audioTrack.enabled ? '🎤' : '🔇';
        }
    });
    toggleVideoBtn.addEventListener('click', () => {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            toggleVideoBtn.classList.toggle('off', !videoTrack.enabled);
            toggleVideoBtn.textContent = videoTrack.enabled ? '📹' : '📸';
        }
    });
    screenShareBtn.addEventListener('click', async () => {
        if (screenStream && screenStream.active) {
            const cameraTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(cameraTrack);
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
            screenShareBtn.style.backgroundColor = '#3498db';
        } else {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(screenTrack);
            screenShareBtn.style.backgroundColor = 'var(--error-color)';
            screenTrack.onended = () => {
                if (peerConnection.connectionState === 'connected') {
                    const cameraTrack = localStream.getVideoTracks()[0];
                    sender.replaceTrack(cameraTrack);
                    screenStream = null;
                    screenShareBtn.style.backgroundColor = '#3498db';
                }
            };
        }
    });
    endCallBtn.addEventListener('click', () => {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        callModal.classList.add('hidden');
        remoteVideo.srcObject = null;
    });
});
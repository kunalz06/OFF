document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- Global State ---
    let currentUser = {
        username: '',
        friends: [],
        friendRequests: []
    };
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
    
    // Tabs & Content
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const chatWindow = document.getElementById('chat-window');
    const welcomeScreen = document.getElementById('welcome-screen');
    const messagesContainer = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHeader = document.getElementById('chat-header');
    
    // Profile Tab
    const profileUsername = document.getElementById('profile-username');
    const addUsernameInput = document.getElementById('add-username-input');
    const sendRequestBtn = document.getElementById('send-request-btn');
    const friendRequestsList = document.getElementById('friend-requests-list');
    
    // Status Tab
    const statusImageInput = document.getElementById('status-image-input');
    const statusesFeed = document.getElementById('statuses-feed');

    // Call Modal & Toast
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
        // Update profile tab
        profileUsername.textContent = `Welcome, ${currentUser.username}`;
        
        // Update friend requests
        friendRequestsList.innerHTML = '';
        if (currentUser.friendRequests && currentUser.friendRequests.length > 0) {
            currentUser.friendRequests.forEach(username => {
                const requestItem = document.createElement('div');
                requestItem.className = 'request-item';
                requestItem.innerHTML = `<span>${username}</span><button data-username="${username}">Accept</button>`;
                friendRequestsList.appendChild(requestItem);
            });
        } else {
            friendRequestsList.innerHTML = '<p>No new requests.</p>';
        }

        // Update contact list based on active tab
        contactList.innerHTML = '';
        if(currentUser.friends) {
            currentUser.friends.forEach(username => {
                const contactItem = document.createElement('div');
                contactItem.className = 'contact-item';
                contactItem.dataset.username = username;
                contactItem.innerHTML = `<span>${username}</span><div class="status-indicator"></div>`;
                contactItem.onclick = () => {
                    if (activeTab === 'chats') openChat(username);
                    if (activeTab === 'calls') startCall(username);
                };
                contactList.appendChild(contactItem);
            });
        }
    }

    // Tab switching
    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabName = link.dataset.tab;
            activeTab = tabName;
            
            tabLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            tabContents.forEach(c => c.classList.add('hidden'));
            document.getElementById(`${tabName}-tab`).classList.remove('hidden');
            
            const showContacts = (tabName === 'chats' || tabName === 'calls');
            contactList.style.display = showContacts ? 'block' : 'none';
            
            if (showContacts) updateUI();
            if (tabName === 'status') fetchStatuses();
        });
    });

    // --- 3. Status Feature Logic ---
    statusImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('username', currentUser.username);
        formData.append('statusImage', file);

        fetch('/upload-status', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) alert('Upload failed!');
            statusImageInput.value = ''; // Reset input
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
        card.innerHTML = `
            <img src="${status.imageUrl}" alt="Status by ${status.username}">
            <p><strong>${status.username}</strong></p>
        `;
        statusesFeed.prepend(card);
    }
    
    socket.on('new-status-posted', (status) => {
        if (activeTab === 'status') {
            renderStatus(status);
        }
    });

    // --- 4. Friend & Chat Logic ---
    sendRequestBtn.addEventListener('click', () => { /* ... (Unchanged logic) ... */ });
    friendRequestsList.addEventListener('click', (e) => { /* ... (Unchanged logic) ... */ });
    function openChat(username) { /* ... (Unchanged logic) ... */ }
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => (e.key === 'Enter') && sendMessage());
    function sendMessage() { /* ... (Unchanged logic) ... */ }

    // --- 5. Real-time Socket Event Handlers ---
    socket.on('private-message', (msg) => { /* ... (Unchanged logic) ... */ });
    socket.on('new-friend-request', (senderUsername) => { /* ... (Unchanged logic) ... */ });
    socket.on('request-accepted', (updatedUserData) => { /* ... (Unchanged logic) ... */ });
    socket.on('friend-online', (username) => { /* ... (Unchanged logic) ... */ });
    socket.on('friend-offline', (username) => { /* ... (Unchanged logic) ... */ });

    // --- 6. WebRTC Calling Logic ---
    async function startCall(recipient) { /* ... (Unchanged logic) ... */ }
    socket.on('call-made', async (data) => { /* ... (Unchanged logic) ... */ });
    acceptCallBtn.addEventListener('click', async () => { /* ... (Unchanged logic) ... */ });
    rejectCallBtn.addEventListener('click', () => { /* ... (Unchanged logic) ... */ });
    socket.on('answer-made', async (data) => { /* ... (Unchanged logic) ... */ });
    socket.on('ice-candidate', (data) => { /* ... (Unchanged logic) ... */ });

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
        if (!screenStream) {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(screenTrack);
            screenShareBtn.style.backgroundColor = 'var(--error-color)';
            screenTrack.onended = () => {
                const cameraTrack = localStream.getVideoTracks()[0];
                sender.replaceTrack(cameraTrack);
                screenStream = null;
                screenShareBtn.style.backgroundColor = '#3498db';
            };
        } else {
            const cameraTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(cameraTrack);
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
            screenShareBtn.style.backgroundColor = '#3498db';
        }
    });

    function createPeerConnection(recipient) { /* ... (Unchanged logic) ... */ }
    endCallBtn.addEventListener('click', () => { /* ... (Unchanged logic) ... */ });
});
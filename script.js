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
    
    // Call Modal & Toast
    const callModal = document.getElementById('call-modal');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
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
                const requestItem = document.createElement('div');
                requestItem.className = 'request-item';
                requestItem.innerHTML = `<span>${username}</span><button data-username="${username}">Accept</button>`;
                friendRequestsList.appendChild(requestItem);
            });
        } else {
            friendRequestsList.innerHTML = '<p>No new requests.</p>';
        }

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

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabName = link.dataset.tab;
            activeTab = tabName;
            
            tabLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            tabContents.forEach(c => c.classList.add('hidden'));
            document.getElementById(`${tabName}-tab`).classList.remove('hidden');
            
            contactList.style.display = (tabName === 'chats' || tabName === 'calls') ? 'block' : 'none';
            updateUI();
        });
    });

    // --- 3. Friend & Chat Logic ---
    sendRequestBtn.addEventListener('click', () => {
        const recipientUsername = addUsernameInput.value.trim();
        if (recipientUsername) {
            socket.emit('send-friend-request', { recipientUsername }, (response) => {
                alert(response.message);
                if(response.success) addUsernameInput.value = '';
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

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => (e.key === 'Enter') && sendMessage());

    function sendMessage() {
        const text = messageInput.value.trim();
        if (text && activeChat) {
            socket.emit('private-message', { recipient: activeChat, text });
            messageInput.value = '';
        }
    }

    // --- 4. Real-time Socket Event Handlers ---
    socket.on('private-message', (msg) => {
        if (msg.sender === activeChat || msg.sender === currentUser.username) {
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble ' + (msg.sender === currentUser.username ? 'sent' : 'received');
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
        alert(`Your friend request was accepted!`);
    });
    
    socket.on('friend-online', (username) => {
        const contact = document.querySelector(`.contact-item[data-username="${username}"] .status-indicator`);
        if(contact) contact.classList.add('online');
    });
    
    socket.on('friend-offline', (username) => {
        const contact = document.querySelector(`.contact-item[data-username="${username}"] .status-indicator`);
        if(contact) contact.classList.remove('online');
    });

    // --- 5. WebRTC Calling Logic ---
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
        if (peerConnection) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });

    async function toggleScreenShare() {
        if (!screenStream) {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(screenTrack);
            screenShareBtn.style.backgroundColor = 'var(--error-color)';
            screenTrack.onended = () => toggleScreenShare();
        } else {
            const cameraTrack = localStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(cameraTrack);
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
            screenShareBtn.style.backgroundColor = '#3498db';
        }
    }
    
    screenShareBtn.addEventListener('click', toggleScreenShare);

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
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        callModal.classList.add('hidden');
        remoteVideo.srcObject = null;
    });
});
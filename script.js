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
    let isBusy = false;
    let iceCandidateQueue = [];

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
    const statusViewer = document.getElementById('status-viewer');
    const viewerImage = document.getElementById('viewer-image');
    const closeViewerBtn = document.getElementById('close-viewer-btn');
    const preCallAudioBtn = document.getElementById('pre-call-audio-btn');
    const preCallVideoBtn = document.getElementById('pre-call-video-btn');

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
                    requestNotificationPermission();
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
        } catch (error) { 
            console.error("Error accessing media devices.", error);
            alert("Camera/mic permissions are needed for calling. You can still use chat and status features.");
            localStream = new MediaStream();
        }
    }

    // --- 2. Notification Logic ---
    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    function showNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(title, { body });
        }
    }

    // --- 3. UI, Status, Friend, and Chat Logic (Complete) ---
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
        card.dataset.statusId = status._id;
        card.dataset.imageUrl = status.imageUrl;
        let deleteButtonHTML = '';
        if (currentUser.username === status.username) {
            deleteButtonHTML = `<button class="delete-status-btn" data-status-id="${status._id}">&times;</button>`;
        }
        card.innerHTML = `<img src="${status.imageUrl}" alt="Status by ${status.username}"><p><strong>${status.username}</strong></p>${deleteButtonHTML}`;
        statusesFeed.prepend(card);
    }

    statusesFeed.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('delete-status-btn')) {
            e.stopPropagation();
            const statusId = target.dataset.statusId;
            if (confirm('Are you sure you want to delete this status?')) {
                socket.emit('delete-status', statusId, (response) => {
                    if (!response.success) alert(`Error: ${response.message}`);
                });
            }
        } else {
            const card = target.closest('.status-card');
            if (card) {
                viewerImage.src = card.dataset.imageUrl;
                statusViewer.classList.remove('hidden');
            }
        }
    });

    closeViewerBtn.addEventListener('click', () => {
        statusViewer.classList.add('hidden');
        viewerImage.src = '';
    });

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
                if (response.success) currentUser = response.userData;
                updateUI();
            });
        }
    });

    function openChat(username) {
        activeChat = username;
        chatWindow.classList.remove('hidden');
        welcomeScreen.classList.add('hidden');
        chatHeader.textContent = username;
        messagesContainer.innerHTML = '';
        socket.emit('get-chat-history', { friendUsername: username }, (history) => {
            history.forEach(msg => renderMessage(msg));
        });
    }

    function renderMessage(msg) {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${msg.sender === currentUser.username ? 'sent' : 'received'}`;
        bubble.innerText = msg.text;
        messagesContainer.appendChild(bubble);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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

    // --- 4. Real-time Socket Event Handlers ---
    socket.on('private-message', (msg) => {
        if (msg.sender === activeChat || msg.sender === currentUser.username) {
            renderMessage(msg);
        }
        if (msg.sender !== currentUser.username && msg.sender !== activeChat) {
            showNotification(`New Message from ${msg.sender}`, msg.text);
        }
    });
    socket.on('new-friend-request', (senderUsername) => {
        if (!currentUser.friendRequests.includes(senderUsername)) currentUser.friendRequests.push(senderUsername);
        updateUI();
        showNotification('New Friend Request', `From ${senderUsername}`);
    });
    socket.on('request-accepted', (updatedUserData) => {
        currentUser = updatedUserData;
        updateUI();
        showNotification('Friend Request Accepted', `${updatedUserData.friends.find(f => f !== currentUser.username)} is now your friend.`);
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
    socket.on('status-deleted', (statusId) => {
        const cardToRemove = document.querySelector(`.status-card[data-status-id="${statusId}"]`);
        if (cardToRemove) cardToRemove.remove();
    });

    // --- 5. WebRTC Calling Logic (Final Robust Version) ---
    function createPeerConnection(recipient) {
        iceCandidateQueue = [];
        peerConnection = new RTCPeerConnection(stunServers);

        peerConnection.ontrack = (event) => {
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { recipient, candidate: event.candidate });
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        }
    }

    async function startCall(recipient) {
        if (!localStream || localStream.getTracks().length === 0) {
            alert("Cannot start call. Check camera/microphone permissions.");
            return;
        }
        isBusy = true;
        callModal.classList.remove('hidden');
        callStatus.textContent = `Calling ${recipient}...`;
        createPeerConnection(recipient);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('call-user', { recipient, offer });
    }

    socket.on('call-made', async (data) => {
        if (isBusy) {
            socket.emit('reject-call', { recipient: currentUser.username, caller: data.sender });
            return;
        }
        
        isBusy = true;
        incomingCallData = data;
        callerUsernameEl.textContent = data.sender;
        incomingCallToast.classList.remove('hidden');
        showNotification(`Incoming call from ${data.sender}`, 'Click to answer.');
    });

    preCallAudioBtn.addEventListener('click', () => {
        preCallAudioBtn.classList.toggle('active');
        preCallAudioBtn.textContent = preCallAudioBtn.classList.contains('active') ? '🎤 Audio ON' : '🔇 Audio OFF';
    });
    preCallVideoBtn.addEventListener('click', () => {
        preCallVideoBtn.classList.toggle('active');
        preCallVideoBtn.textContent = preCallVideoBtn.classList.contains('active') ? '📹 Video ON' : '📸 Video OFF';
    });

    acceptCallBtn.addEventListener('click', async () => {
        const isAudioEnabled = preCallAudioBtn.classList.contains('active');
        const isVideoEnabled = preCallVideoBtn.classList.contains('active');

        if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = isAudioEnabled);
            localStream.getVideoTracks().forEach(track => track.enabled = isVideoEnabled);
        }
        
        toggleAudioBtn.classList.toggle('muted', !isAudioEnabled);
        toggleAudioBtn.textContent = isAudioEnabled ? '🎤' : '🔇';
        toggleVideoBtn.classList.toggle('off', !isVideoEnabled);
        toggleVideoBtn.textContent = isVideoEnabled ? '📹' : '📸';

        incomingCallToast.classList.add('hidden');
        callModal.classList.remove('hidden');
        callStatus.textContent = `In call with ${incomingCallData.sender}`;
        
        createPeerConnection(incomingCallData.sender);
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
        
        // Process any candidates that arrived early
        for (const candidate of iceCandidateQueue) {
            await peerConnection.addIceCandidate(candidate);
        }
        iceCandidateQueue = [];
        
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('make-answer', { sender: incomingCallData.sender, answer });
        incomingCallData = null;
    });

    rejectCallBtn.addEventListener('click', () => {
        isBusy = false;
        incomingCallToast.classList.add('hidden');
        socket.emit('reject-call', { recipient: currentUser.username, caller: incomingCallData.sender });
        incomingCallData = null;
    });

    socket.on('answer-made', async (data) => {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            // Process any candidates that arrived early
            for (const candidate of iceCandidateQueue) {
                await peerConnection.addIceCandidate(candidate);
            }
            iceCandidateQueue = [];
        }
    });

    socket.on('ice-candidate', async (data) => {
        const candidate = new RTCIceCandidate(data.candidate);
        if (peerConnection && peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(candidate);
        } else {
            // Queue the candidate if the remote description isn't set yet
            iceCandidateQueue.push(candidate);
        }
    });
    
    socket.on('call-rejected', (data) => {
        alert(data.reason || `${data.recipient} rejected the call.`);
        endCall();
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
            if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
            screenShareBtn.style.backgroundColor = '#3498db';
        } else {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
            screenShareBtn.style.backgroundColor = 'var(--error-color)';
            screenTrack.onended = () => {
                if (peerConnection && peerConnection.connectionState === 'connected') {
                    const cameraTrack = localStream.getVideoTracks()[0];
                    if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
                    screenStream = null;
                    screenShareBtn.style.backgroundColor = '#3498db';
                }
            };
        }
    });

    function endCall() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        isBusy = false;
        callModal.classList.add('hidden');
        remoteVideo.srcObject = null;
    }
    
    endCallBtn.addEventListener('click', endCall);
});
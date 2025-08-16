document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- Global State ---
    let currentUser = { username: '', friends: [], friendRequests: [], groups: [] };
    let activeChat = { id: null, type: null, name: '' };
    let localStream;
    let isBusy = false;
    let peerConnections = {}; // Unified object for all peer connections {userId: pc}
    let currentCallRoomId = null;
    let screenStream;

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
    const videoGrid = document.getElementById('video-grid');
    const toggleAudioBtn = document.getElementById('toggle-audio-btn');
    const toggleVideoBtn = document.getElementById('toggle-video-btn');
    const screenShareBtn = document.getElementById('screen-share-btn');
    const endCallBtn = document.getElementById('end-call-btn');
    const callStatus = document.getElementById('call-status');
    const incomingCallToast = document.getElementById('incoming-call-toast'); // This is no longer used but kept for structure
    const statusViewer = document.getElementById('status-viewer');
    const viewerImage = document.getElementById('viewer-image');
    const closeViewerBtn = document.getElementById('close-viewer-btn');
    const newGroupBtn = document.getElementById('new-group-btn');
    const createGroupModal = document.getElementById('create-group-modal');
    const groupNameInput = document.getElementById('group-name-input');
    const groupMembersList = document.getElementById('group-members-list');
    const confirmCreateGroupBtn = document.getElementById('confirm-create-group-btn');
    const cancelCreateGroupBtn = document.getElementById('cancel-create-group-btn');
    const chatTitle = document.getElementById('chat-title');
    const callBtn = document.getElementById('call-btn');
    const groupCallBtn = document.getElementById('group-call-btn');
    
    // Create and append the chat image upload button and input
    const chatImageInput = document.createElement('input');
    chatImageInput.type = 'file';
    chatImageInput.accept = 'image/*';
    chatImageInput.style.display = 'none';
    const uploadImageBtn = document.createElement('button');
    uploadImageBtn.textContent = '🖼️';
    uploadImageBtn.id = 'upload-image-btn';
    const inputArea = document.querySelector('.input-area');
    inputArea.prepend(uploadImageBtn);
    inputArea.appendChild(chatImageInput);


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
            alert("Camera/mic permissions are needed for calling features.");
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

    // --- 3. UI, Status, Friend, and Chat Logic ---
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
        if (currentUser.groups && currentUser.groups.length > 0) {
            const groupHeader = document.createElement('div');
            groupHeader.className = 'contact-list-section-header';
            groupHeader.textContent = 'Groups';
            contactList.appendChild(groupHeader);
            currentUser.groups.forEach(group => {
                const item = document.createElement('div');
                item.className = 'contact-item';
                item.onclick = () => openChat(group._id, 'group', group.name);
                item.innerHTML = `<span>${group.name}</span>`;
                contactList.appendChild(item);
            });
        }

        const friendHeader = document.createElement('div');
        friendHeader.className = 'contact-list-section-header';
        friendHeader.textContent = 'Friends';
        contactList.appendChild(friendHeader);
        if (currentUser.friends) {
            currentUser.friends.forEach(username => {
                const item = document.createElement('div');
                item.className = 'contact-item';
                item.onclick = () => openChat(username, 'dm', username);
                item.innerHTML = `<span>${username}</span><div class="status-indicator"></div>`;
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

    function openChat(id, type, name) {
        activeChat = { id, type, name };
        chatWindow.classList.remove('hidden');
        welcomeScreen.classList.add('hidden');
        chatTitle.textContent = name;
        messagesContainer.innerHTML = '';

        if (type === 'dm') {
            groupCallBtn.classList.add('hidden');
            callBtn.classList.remove('hidden');
            socket.emit('get-chat-history', { friendUsername: id }, (history) => {
                history.forEach(msg => renderMessage(msg));
            });
        } else if (type === 'group') {
            callBtn.classList.add('hidden');
            groupCallBtn.classList.remove('hidden');
            socket.emit('get-group-chat-history', { groupId: id }, (history) => {
                history.forEach(msg => renderMessage(msg));
            });
        }
    }
    function renderMessage(msg) {
        const bubble = document.createElement('div');
        bubble.className = `message-bubble ${msg.sender === currentUser.username ? 'sent' : 'received'}`;
        
        if (msg.type === 'image') {
            bubble.innerHTML = `<img src="${msg.content}" alt="Sent image" class="chat-image">`;
        } else {
            bubble.innerText = msg.content;
        }
        
        messagesContainer.appendChild(bubble);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    function sendMessage() {
        const text = messageInput.value.trim();
        if (text && activeChat.id) {
            const messageData = { type: 'text', content: text };
            if (activeChat.type === 'dm') {
                socket.emit('private-message', { ...messageData, recipient: activeChat.id });
            } else if (activeChat.type === 'group') {
                socket.emit('group-message', { ...messageData, groupId: activeChat.id });
            }
            messageInput.value = '';
        }
    }
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => (e.key === 'Enter') && sendMessage());

    uploadImageBtn.addEventListener('click', () => chatImageInput.click());
    chatImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !activeChat.id) return;
        const formData = new FormData();
        formData.append('chatImage', file);
        fetch('/upload-chat-image', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const messageData = { type: 'image', content: data.url };
                    if (activeChat.type === 'dm') {
                        socket.emit('private-message', { ...messageData, recipient: activeChat.id });
                    } else if (activeChat.type === 'group') {
                        socket.emit('group-message', { ...messageData, groupId: activeChat.id });
                    }
                } else {
                    alert('Image upload failed!');
                }
            })
            .catch(err => console.error('Upload error:', err))
            .finally(() => {
                chatImageInput.value = '';
            });
    });

    newGroupBtn.addEventListener('click', () => {
        groupMembersList.innerHTML = '';
        currentUser.friends.forEach(friend => {
            const item = document.createElement('div');
            item.className = 'member-selection-item';
            item.innerHTML = `<input type="checkbox" id="member-${friend}" value="${friend}"> <label for="member-${friend}">${friend}</label>`;
            groupMembersList.appendChild(item);
        });
        createGroupModal.classList.remove('hidden');
    });
    cancelCreateGroupBtn.addEventListener('click', () => createGroupModal.classList.add('hidden'));
    confirmCreateGroupBtn.addEventListener('click', () => {
        const groupName = groupNameInput.value.trim();
        const selectedMembers = Array.from(groupMembersList.querySelectorAll('input:checked')).map(input => input.value);
        if (groupName && selectedMembers.length > 0) {
            socket.emit('create-group', { groupName, members: selectedMembers }, (response) => {
                if (response.success) {
                    currentUser.groups.push(response.group);
                    updateUI();
                    createGroupModal.classList.add('hidden');
                } else {
                    alert(response.message);
                }
            });
        }
    });

    // --- 4. Real-time Socket Event Handlers ---
    socket.on('private-message', (msg) => {
        if (activeChat.type === 'dm' && (msg.sender === activeChat.id || msg.sender === currentUser.username)) {
            renderMessage(msg);
        }
        if (msg.sender !== currentUser.username && (activeChat.type !== 'dm' || activeChat.id !== msg.sender)) {
            showNotification(`New Message from ${msg.sender}`, msg.type === 'image' ? 'Sent an image' : msg.content);
        }
    });
    socket.on('group-message', (msg) => {
        if (activeChat.type === 'group' && activeChat.id === msg.groupId) {
            renderMessage(msg);
        } else {
            const group = currentUser.groups.find(g => g._id === msg.groupId);
            if (group && msg.sender !== currentUser.username) {
                showNotification(`New message in ${group.name}`, `${msg.sender}: ${msg.type === 'image' ? 'Sent an image' : msg.content}`);
            }
        }
    });
    socket.on('added-to-group', (group) => {
        currentUser.groups.push(group);
        updateUI();
        showNotification(`Added to new group: ${group.name}`, `By ${group.createdBy}`);
    });
    socket.on('new-friend-request', (senderUsername) => {
        if (!currentUser.friendRequests.includes(senderUsername)) currentUser.friendRequests.push(senderUsername);
        updateUI();
        showNotification('New Friend Request', `From ${senderUsername}`);
    });
    socket.on('request-accepted', (updatedUserData) => {
        currentUser = updatedUserData;
        updateUI();
        showNotification('Friend Request Accepted', `You are now friends.`);
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
    callBtn.addEventListener('click', () => startCall(activeChat.id, false));
    groupCallBtn.addEventListener('click', () => startCall(activeChat.id, true));

    function createPeerConnection(targetUserId) {
        const pc = new RTCPeerConnection(stunServers);
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc-ice-candidate', { targetUserId, candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            let videoEl = document.getElementById(`video-${targetUserId}`);
            if (!videoEl) {
                videoEl = document.createElement('video');
                videoEl.id = `video-${targetUserId}`;
                videoEl.autoplay = true;
                videoEl.playsInline = true;
                videoGrid.appendChild(videoEl);
            }
            if (videoEl.srcObject !== event.streams[0]) {
                videoEl.srcObject = event.streams[0];
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }
        
        peerConnections[targetUserId] = pc;
    }

    function startCall(roomId) {
        if (!localStream || localStream.getTracks().length === 0) return alert("Cannot start call. Check media permissions.");
        isBusy = true;
        currentCallRoomId = roomId;
        callModal.classList.remove('hidden');
        callStatus.textContent = `Call: ${activeChat.name}`;
        socket.emit('join-call-room', roomId);
    }

    socket.on('user-joined-call', async ({ userId }) => {
        createPeerConnection(userId);
        const pc = peerConnections[userId];
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { targetUserId: userId, offer });
    });

    socket.on('webrtc-offer', async ({ fromUserId, offer }) => {
        createPeerConnection(fromUserId);
        const pc = peerConnections[fromUserId];
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { targetUserId: fromUserId, answer });
    });

    socket.on('webrtc-answer', async ({ fromUserId, answer }) => {
        const pc = peerConnections[fromUserId];
        if (pc && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    });

    socket.on('webrtc-ice-candidate', ({ fromUserId, candidate }) => {
        const pc = peerConnections[fromUserId];
        if (pc) {
            pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
    
    socket.on('user-left-call', ({ userId }) => {
        if (peerConnections[userId]) {
            peerConnections[userId].close();
            delete peerConnections[userId];
        }
        const videoEl = document.getElementById(`video-${userId}`);
        if (videoEl) {
            videoEl.remove();
        }
    });

    function endCall() {
        isBusy = false;
        if (currentCallRoomId) {
            socket.emit('leave-call-room', currentCallRoomId);
        }
        for (const userId in peerConnections) {
            peerConnections[userId].close();
            const videoEl = document.getElementById(`video-${userId}`);
            if (videoEl) videoEl.remove();
        }
        peerConnections = {};
        currentCallRoomId = null;
        callModal.classList.add('hidden');
    }
    endCallBtn.addEventListener('click', endCall);

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
            for (const pc of Object.values(peerConnections)) {
                const sender = pc.getSenders().find(s => s.track.kind === 'video');
                if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
            }
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
            screenShareBtn.style.backgroundColor = '#3498db';
        } else {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            for (const pc of Object.values(peerConnections)) {
                const sender = pc.getSenders().find(s => s.track.kind === 'video');
                if (sender) await sender.replaceTrack(screenTrack);
            }
            screenShareBtn.style.backgroundColor = 'var(--error-color)';
            screenTrack.onended = () => {
                if (Object.keys(peerConnections).length > 0) {
                    const cameraTrack = localStream.getVideoTracks()[0];
                    for (const pc of Object.values(peerConnections)) {
                        const sender = pc.getSenders().find(s => s.track.kind === 'video');
                        if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
                    }
                    screenStream = null;
                    screenShareBtn.style.backgroundColor = '#3498db';
                }
            };
        }
    });
});
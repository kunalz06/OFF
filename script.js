document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- Global State ---
    let currentUser = { username: '', friends: [], friendRequests: [], groups: [] };
    let activeChat = { id: null, type: null, name: '' };
    let localStream;
    let isBusy = false;
    let groupCallPeerConnections = {}; // Stores peer connections for a group call
    let directCallPeerConnection; // For one-on-one calls
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
    const videoGrid = document.getElementById('video-grid');
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
    const newGroupBtn = document.getElementById('new-group-btn');
    const createGroupModal = document.getElementById('create-group-modal');
    const groupNameInput = document.getElementById('group-name-input');
    const groupMembersList = document.getElementById('group-members-list');
    const confirmCreateGroupBtn = document.getElementById('confirm-create-group-btn');
    const cancelCreateGroupBtn = document.getElementById('cancel-create-group-btn');
    const chatTitle = document.getElementById('chat-title');
    const callBtn = document.getElementById('call-btn');
    const groupCallBtn = document.getElementById('group-call-btn');

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

    statusImageInput.addEventListener('change', (e) => { /* ... Unchanged ... */ });
    function fetchStatuses() { /* ... Unchanged ... */ }
    function renderStatus(status) { /* ... Unchanged ... */ }
    statusesFeed.addEventListener('click', (e) => { /* ... Unchanged ... */ });
    closeViewerBtn.addEventListener('click', () => { /* ... Unchanged ... */ });
    sendRequestBtn.addEventListener('click', () => { /* ... Unchanged ... */ });
    friendRequestsList.addEventListener('click', (e) => { /* ... Unchanged ... */ });

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
        bubble.innerText = msg.text;
        messagesContainer.appendChild(bubble);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function sendMessage() {
        const text = messageInput.value.trim();
        if (text && activeChat.id) {
            if (activeChat.type === 'dm') {
                socket.emit('private-message', { recipient: activeChat.id, text });
            } else if (activeChat.type === 'group') {
                socket.emit('group-message', { groupId: activeChat.id, text });
            }
            messageInput.value = '';
        }
    }
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => (e.key === 'Enter') && sendMessage());

    // --- Group Creation ---
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

    // --- Socket Event Handlers ---
    socket.on('private-message', (msg) => { /* ... Unchanged ... */ });
    socket.on('group-message', (msg) => {
        if (activeChat.type === 'group' && activeChat.id === msg.groupId) {
            renderMessage(msg);
        } else {
            const group = currentUser.groups.find(g => g._id === msg.groupId);
            if (group) {
                showNotification(`New message in ${group.name}`, `${msg.sender}: ${msg.text}`);
            }
        }
    });
    socket.on('added-to-group', (group) => {
        currentUser.groups.push(group);
        updateUI();
        showNotification(`Added to new group: ${group.name}`, `By ${group.createdBy}`);
    });
    socket.on('new-friend-request', (senderUsername) => { /* ... Unchanged ... */ });
    socket.on('request-accepted', (updatedUserData) => { /* ... Unchanged ... */ });
    socket.on('friend-online', (username) => { /* ... Unchanged ... */ });
    socket.on('friend-offline', (username) => { /* ... Unchanged ... */ });
    socket.on('new-status-posted', (status) => { /* ... Unchanged ... */ });
    socket.on('status-deleted', (statusId) => { /* ... Unchanged ... */ });

    // --- WebRTC Calling Logic (Direct & Group) ---
    callBtn.addEventListener('click', () => startCall(activeChat.id));
    groupCallBtn.addEventListener('click', () => startGroupCall(activeChat.id));

    function createPeerConnection(recipient, isGroupCall = false) {
        const pc = new RTCPeerConnection(stunServers);

        pc.ontrack = (event) => {
            let videoElId = isGroupCall ? `video-${recipient}` : 'remote-video';
            let videoEl = document.getElementById(videoElId);
            if (isGroupCall && !videoEl) {
                videoEl = document.createElement('video');
                videoEl.id = videoElId;
                videoEl.autoplay = true;
                videoGrid.appendChild(videoEl);
            }
            if (videoEl) {
                videoEl.srcObject = event.streams[0];
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                if (isGroupCall) {
                    const group = currentUser.groups.find(g => g._id === activeChat.id);
                    socket.emit('group-ice-candidate', { group, candidate: event.candidate });
                } else {
                    socket.emit('ice-candidate', { recipient, candidate: event.candidate });
                }
            }
        };

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }
        return pc;
    }

    async function startCall(recipient) {
        if (!localStream || localStream.getTracks().length === 0) return alert("Cannot start call. Check media permissions.");
        isBusy = true;
        callModal.classList.remove('hidden');
        callStatus.textContent = `Calling ${recipient}...`;
        directCallPeerConnection = createPeerConnection(recipient);
        const offer = await directCallPeerConnection.createOffer();
        await directCallPeerConnection.setLocalDescription(offer);
        socket.emit('call-user', { recipient, offer });
    }

    async function startGroupCall(groupId) {
        isBusy = true;
        callModal.classList.remove('hidden');
        const group = currentUser.groups.find(g => g._id === groupId);
        callStatus.textContent = `Group Call: ${group.name}`;
        
        for (const member of group.members) {
            if (member !== currentUser.username) {
                const pc = createPeerConnection(member, true);
                groupCallPeerConnections[member] = pc;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('group-offer', { target: member, offer });
            }
        }
        socket.emit('start-group-call', groupId);
    }

    socket.on('call-made', (data) => {
        if (isBusy) return socket.emit('reject-call', { recipient: currentUser.username, caller: data.sender });
        isBusy = true;
        incomingCallData = { ...data, type: 'dm' };
        callerUsernameEl.textContent = data.sender;
        incomingCallToast.classList.remove('hidden');
        showNotification(`Incoming call from ${data.sender}`, 'Click to answer.');
    });

    socket.on('group-call-started', ({ groupId, groupName, caller }) => {
        if (isBusy) return;
        if (confirm(`${caller} started a call in ${groupName}. Join?`)) {
            isBusy = true;
            callModal.classList.remove('hidden');
            callStatus.textContent = `Group Call: ${groupName}`;
            const group = currentUser.groups.find(g => g._id === groupId);
            group.members.forEach(member => {
                if (member !== currentUser.username) {
                    groupCallPeerConnections[member] = createPeerConnection(member, true);
                }
            });
        }
    });

    acceptCallBtn.addEventListener('click', async () => {
        isBusy = true;
        incomingCallToast.classList.add('hidden');
        callModal.classList.remove('hidden');
        callStatus.textContent = `In call with ${incomingCallData.sender}`;
        
        directCallPeerConnection = createPeerConnection(incomingCallData.sender);
        await directCallPeerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
        const answer = await directCallPeerConnection.createAnswer();
        await directCallPeerConnection.setLocalDescription(answer);
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
        if (directCallPeerConnection) await directCallPeerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    });
    socket.on('ice-candidate', (data) => {
        if (directCallPeerConnection) directCallPeerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    });
    socket.on('call-rejected', (data) => {
        alert(data.reason || `${data.recipient} rejected the call.`);
        endCall();
    });

    socket.on('group-offer', async ({ from, offer }) => {
        const pc = createPeerConnection(from, true);
        groupCallPeerConnections[from] = pc;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('group-answer', { target: from, answer });
    });
    socket.on('group-answer', async ({ from, answer }) => {
        const pc = groupCallPeerConnections[from];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });
    socket.on('group-ice-candidate', ({ from, candidate }) => {
        const pc = groupCallPeerConnections[from];
        if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    function endCall() {
        isBusy = false;
        if (directCallPeerConnection) {
            directCallPeerConnection.close();
            directCallPeerConnection = null;
        }
        Object.values(groupCallPeerConnections).forEach(pc => pc.close());
        groupCallPeerConnections = {};
        videoGrid.innerHTML = '';
        videoGrid.appendChild(localVideo);
        callModal.classList.add('hidden');
    }
    endCallBtn.addEventListener('click', endCall);

    toggleAudioBtn.addEventListener('click', () => { /* ... Unchanged ... */ });
    toggleVideoBtn.addEventListener('click', () => { /* ... Unchanged ... */ });
    screenShareBtn.addEventListener('click', async () => { /* ... Unchanged ... */ });
});
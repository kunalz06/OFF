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
    
    // **FIX: Perfect Negotiation State Variables**
    let isMakingOffer = false;
    let isIgnoringOffer = false;
    let isPolite = false; // Will be determined when a call starts

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

    // --- 3. UI, Status, Friend, and Chat Logic (Unchanged) ---
    function updateUI() { /* ... */ }
    tabLinks.forEach(link => { /* ... */ });
    statusImageInput.addEventListener('change', (e) => { /* ... */ });
    function fetchStatuses() { /* ... */ }
    function renderStatus(status) { /* ... */ }
    statusesFeed.addEventListener('click', (e) => { /* ... */ });
    closeViewerBtn.addEventListener('click', () => { /* ... */ });
    sendRequestBtn.addEventListener('click', () => { /* ... */ });
    friendRequestsList.addEventListener('click', (e) => { /* ... */ });
    function openChat(username) { /* ... */ }
    function renderMessage(msg) { /* ... */ }
    function sendMessage() { /* ... */ }
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => (e.key === 'Enter') && sendMessage());
    socket.on('private-message', (msg) => { /* ... */ });
    socket.on('new-friend-request', (senderUsername) => { /* ... */ });
    socket.on('request-accepted', (updatedUserData) => { /* ... */ });
    socket.on('friend-online', (username) => { /* ... */ });
    socket.on('friend-offline', (username) => { /* ... */ });
    socket.on('new-status-posted', (status) => { /* ... */ });
    socket.on('status-deleted', (statusId) => { /* ... */ });

    // --- 4. WebRTC Calling Logic (Corrected with Perfect Negotiation) ---
    function createPeerConnection(recipient) {
        peerConnection = new RTCPeerConnection(stunServers);

        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { recipient, candidate: event.candidate });
            }
        };

        // **FIX: Implement the Perfect Negotiation Pattern**
        peerConnection.onnegotiationneeded = async () => {
            try {
                isMakingOffer = true;
                await peerConnection.setLocalDescription();
                socket.emit('call-user', { recipient, offer: peerConnection.localDescription });
            } catch (err) {
                console.error("Error during negotiation:", err);
            } finally {
                isMakingOffer = false;
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
        isPolite = true; // The caller is designated as "polite"
        callModal.classList.remove('hidden');
        callStatus.textContent = `Calling ${recipient}...`;
        createPeerConnection(recipient);
    }

    socket.on('call-made', async (data) => {
        try {
            const offer = data.offer;
            // **FIX: Glare handling**
            const offerCollision = (isMakingOffer || peerConnection?.signalingState !== "stable");
            isIgnoringOffer = !isPolite && offerCollision;
            if (isIgnoringOffer) {
                return; // The polite peer will retry, so the impolite one can ignore.
            }

            // Show incoming call notification
            incomingCallData = data;
            callerUsernameEl.textContent = data.sender;
            incomingCallToast.classList.remove('hidden');
            showNotification(`Incoming call from ${data.sender}`, 'Click to answer.');

        } catch (err) {
            console.error("Error handling incoming call:", err);
        }
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
        
        isPolite = false; // The receiver is impolite
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
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    });

    socket.on('ice-candidate', (data) => {
        if (peerConnection) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                .catch(err => {
                    if (!isIgnoringOffer) {
                        console.error("Error adding received ICE candidate:", err);
                    }
                });
        }
    });

    // In-call media toggles
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

    endCallBtn.addEventListener('click', () => {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        callModal.classList.add('hidden');
        remoteVideo.srcObject = null;
    });
});
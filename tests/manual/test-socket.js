const io = require('socket.io-client');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiVGVzdFVzZXIxMjMiLCJpYXQiOjE3NjY3ODM3MjQsImV4cCI6MTc2Njg3MDEyNH0.Sr6bkZraFmAxRxCq0mhCF3bX9KDcpMD_w4hmjlYAWIw';

console.log('Connecting to Socket.IO with valid token...');

const socket = io('http://localhost:3001', {
    auth: { token },
    autoConnect: true
});

socket.on('connect', () => {
    console.log('✅ Socket.IO connected successfully!');
    console.log('Socket ID:', socket.id);
});

socket.on('disconnect', (reason) => {
    console.log('❌ Socket.IO disconnected:', reason);
});

socket.on('authenticated', (data) => {
    console.log('🔐 Socket.IO authenticated successfully:', data);
});

socket.on('authentication_error', (error) => {
    console.log('🚨 Socket.IO authentication failed:', error);
});

socket.on('connect_error', (error) => {
    console.log('💥 Socket.IO connection error:', error.message);
});

// Keep process alive for a few seconds
setTimeout(() => {
    console.log('Closing connection...');
    socket.disconnect();
    process.exit(0);
}, 5000);
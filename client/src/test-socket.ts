import { io } from "socket.io-client"

const BACKEND_URL = "https://edit-me-backend.onrender.com"

console.log('Testing WebSocket connection to:', BACKEND_URL)

const socket = io(BACKEND_URL, {
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 5000,
    withCredentials: true
})

// Connection event handlers
socket.on('connect', () => {
    console.log('✅ Successfully connected to WebSocket server')
    console.log('Socket ID:', socket.id)
    // Test a simple emit
    socket.emit('test-connection', { message: 'Testing connection' })
})

socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message)
})

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason)
})

// Cleanup after 10 seconds
setTimeout(() => {
    console.log('Closing test connection...')
    socket.close()
    process.exit(0)
}, 10000) 
/* eslint-disable react-refresh/only-export-components */
import React, { ReactNode, createContext, useContext, useEffect, useState, useRef, ErrorInfo, useCallback } from "react"
import { io, Socket } from "socket.io-client"
import toast from "react-hot-toast"

// Ensure we're using the correct backend URL
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://edit-me-backend.onrender.com"

// Add a global flag to track if we're in development
const isDevelopment = process.env.NODE_ENV === 'development'

// Add a global ref to track if we've ever initialized
const hasEverInitialized = { current: false }

interface SocketContext {
	socket: Socket | null
	isConnected: boolean
	emit: (event: string, data: unknown) => void
	status: 'connected' | 'disconnected' | 'error' | 'connecting'
}

const SocketContext = createContext<SocketContext | null>(null)

// Error boundary component to prevent app crashes
class SocketErrorBoundary extends React.Component<{ children: ReactNode }, { hasError: boolean }> {
	constructor(props: { children: ReactNode }) {
		super(props)
		this.state = { hasError: false }
	}

	static getDerivedStateFromError(_: Error) {
		return { hasError: true }
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error('Socket Error Boundary caught an error:', error, errorInfo)
	}

	render() {
		if (this.state.hasError) {
			return (
				<div style={{ padding: '20px', textAlign: 'center' }}>
					<h2>Connection Error</h2>
					<p>There was a problem connecting to the server. Please try refreshing the page.</p>
					<button onClick={() => window.location.reload()}>Refresh Page</button>
				</div>
			)
		}

		return this.props.children
	}
}

const useSocket = () => {
    const context = useContext(SocketContext)
    if (!context) {
		console.warn('useSocket used outside of SocketProvider, returning safe default')
		return {
			socket: null,
			isConnected: false,
			emit: () => console.warn('Socket not available'),
			status: 'disconnected' as const
		}
    }
    return context
}

const SocketProvider = ({ children }: { children: ReactNode }) => {
	const [socket, setSocket] = useState<Socket | null>(null)
	const [isConnected, setIsConnected] = useState(false)
	const [status, setStatus] = useState<'connected' | 'disconnected' | 'error' | 'connecting'>('disconnected')
	const socketRef = useRef<Socket | null>(null)
	const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
	const initializationTimeoutRef = useRef<NodeJS.Timeout>()
	const lastMongoTestRef = useRef<number>(0)
	const isInitializedRef = useRef(false)
	const isMountedRef = useRef(true)
	const shouldTestMongoRef = useRef(true) // Enable MongoDB testing by default

	// Cleanup function
	const cleanup = useCallback(() => {
		if (!isDevelopment) { // Only log in production
			console.log('🧹 Cleaning up socket resources...')
		}
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current)
			reconnectTimeoutRef.current = undefined
		}
		if (initializationTimeoutRef.current) {
			clearTimeout(initializationTimeoutRef.current)
			initializationTimeoutRef.current = undefined
		}
		if (socketRef.current) {
			try {
				socketRef.current.removeAllListeners()
				socketRef.current.close()
			} catch (e) {
				if (!isDevelopment) {
					console.warn('⚠️ Error during socket cleanup:', e)
				}
			}
			socketRef.current = null
		}
	}, [])

	// Initialize socket
	const initializeSocket = useCallback(() => {
		if (!isMountedRef.current || isInitializedRef.current) {
			if (!isDevelopment) {
				console.log('🛑 Socket initialization skipped - already initialized or unmounted')
			}
			return
		}

		const startTime = Date.now()
		if (!isDevelopment) {
			console.log('🔄 Socket initialization started:', {
				timestamp: new Date().toISOString(),
				url: BACKEND_URL,
				isInitialized: isInitializedRef.current
			})
		}

		try {
			cleanup()

			console.log('🔌 Creating new socket connection...')
			setStatus('connecting')
			toast.loading('Connecting to server...', { id: 'connection-status' })

			// Create new socket instance with more resilient settings
			const newSocket = io(BACKEND_URL, {
				path: '/socket.io',
				transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
				reconnectionAttempts: 10, // Increased attempts
				reconnectionDelay: 1000,
				timeout: 30000, // Increased timeout
				forceNew: true,
				autoConnect: false,
				withCredentials: true,
				host: new URL(BACKEND_URL).host,
				hostname: new URL(BACKEND_URL).hostname,
				port: new URL(BACKEND_URL).port || (BACKEND_URL.startsWith('https') ? '443' : '80'),
				secure: BACKEND_URL.startsWith('https'),
				rejectUnauthorized: false,
				upgrade: true,
				rememberUpgrade: true,
				perMessageDeflate: {
					threshold: 1024
				},
				// Add query parameters for better connection tracking
				query: {
					clientTimestamp: Date.now(),
					clientVersion: '1.0.0'
				}
			})

			// Add MongoDB test response handler with timeout
			const handleMongoDBTest = (socket: Socket) => {
				console.log('📊 Testing MongoDB connection...')
				
				// Create a promise that rejects after timeout
				const timeoutPromise = new Promise((_, reject) => {
					setTimeout(() => {
						reject(new Error('MongoDB test timeout after 3 seconds'))
					}, 3000)
				})

				// Create a promise that resolves when we get the response
				const testPromise = new Promise((resolve) => {
					const handler = (data: any) => {
						if (!socketRef.current) return
						
						const now = Date.now()
						lastMongoTestRef.current = now

						console.log('✅ MongoDB connection successful:', {
							...data,
							clientReceiveTime: now,
							roundTripTime: now - data.timestamp
						})
						socket.off('mongodb-test-response', handler)
						resolve(data)
					}
					socket.on('mongodb-test-response', handler)
					socket.emit('test-mongodb', { 
						timestamp: Date.now(),
						test: 'quick-connection-test'
					})
				})

				// Race the promises
				Promise.race([testPromise, timeoutPromise])
					.catch((error) => {
						if (!socketRef.current) return
						
						console.error('❌ MongoDB test failed:', error)
						lastMongoTestRef.current = Date.now()
					})
			}

			// Set up event handlers before connecting
			const handleConnect = () => {
				if (!isMountedRef.current || !socketRef.current) return
				const connectionTime = Date.now() - startTime
				console.log('✅ Socket connected successfully', {
					socketId: newSocket.id,
					timestamp: new Date().toISOString(),
					transport: newSocket.io.engine.transport.name,
					connectionTime: `${connectionTime}ms`
				})
				setIsConnected(true)
				setStatus('connected')
				setSocket(newSocket)
				toast.success('Connected to server!', { 
					id: 'connection-status',
					duration: 2000,
					icon: '✅'
				})

				// Test MongoDB in the background without blocking
				if (shouldTestMongoRef.current) {
					setTimeout(() => handleMongoDBTest(newSocket), 1000)
				}
			}

			const handleDisconnect = (reason: string) => {
				if (!isMountedRef.current) return
				console.log('❌ Socket disconnected:', {
					reason,
					timestamp: new Date().toISOString(),
					uptime: Date.now() - startTime
				})
				setIsConnected(false)
				setStatus('disconnected')
				setSocket(null)
				toast.error('Disconnected from server', { 
					id: 'connection-status',
					duration: 3000,
					icon: '❌'
				})

				// Only attempt reconnect for certain disconnect reasons
				if (reason === 'io server disconnect' || 
					reason === 'transport close' || 
					reason === 'ping timeout' ||
					reason === 'transport error') {
					console.log('🔄 Scheduling reconnect attempt...')
					toast.loading('Attempting to reconnect...', { id: 'connection-status' })
					reconnectTimeoutRef.current = setTimeout(() => {
						if (isMountedRef.current) {
							console.log('🔄 Attempting to reconnect...')
							initializeSocket()
						}
					}, 2000)
				}
			}

			const handleError = (error: Error) => {
				if (!isMountedRef.current) return
				console.error('❌ Socket error:', {
					message: error.message,
					type: error.name,
					stack: error.stack,
					timestamp: new Date().toISOString(),
					uptime: Date.now() - startTime
				})
				setStatus('error')
				setIsConnected(false)
				setSocket(null)
				toast.error('Connection error: ' + error.message, { 
					id: 'connection-status',
					duration: 5000,
					icon: '❌'
				})

				// Retry connection on error
				if (isMountedRef.current) {
					setTimeout(() => {
						if (isMountedRef.current) {
							console.log('🔄 Retrying connection after error...')
							initializeSocket()
						}
					}, 2000)
				}
			}

			const handleConnectError = (error: Error) => {
				if (!isMountedRef.current) return
				console.error('❌ Socket connection error:', {
					message: error.message,
					type: error.name,
					stack: error.stack,
					timestamp: new Date().toISOString(),
					uptime: Date.now() - startTime
				})
				setStatus('error')
				setIsConnected(false)
				setSocket(null)

				// Add more detailed error handling
				if (error.message.includes('timeout')) {
					toast.error('Connection timeout - server might be spinning up. Will retry...', { 
						id: 'connection-status',
						duration: 5000
					})
					// Retry with polling transport
					if (newSocket.io.engine.transport.name === 'websocket') {
						console.log('🔄 Retrying with polling transport...')
						newSocket.io.opts.transports = ['polling']
						setTimeout(() => {
							if (isMountedRef.current) {
								initializeSocket()
							}
						}, 2000)
					}
				} else if (error.message.includes('xhr poll error')) {
					toast.error('Polling error - server might be starting. Will retry...', { 
						id: 'connection-status',
						duration: 5000
					})
				} else {
					toast.error('Failed to connect: ' + error.message, { 
						id: 'connection-status',
						duration: 5000,
						icon: '❌'
					})
				}
			}

			// Add event listeners
			newSocket.on('connect', handleConnect)
			newSocket.on('disconnect', handleDisconnect)
			newSocket.on('error', handleError)
			newSocket.on('connect_error', handleConnectError)

			// Store socket reference and mark as initialized
			socketRef.current = newSocket
			setSocket(newSocket)
			isInitializedRef.current = true
			hasEverInitialized.current = true

			// Connect with retry
			const connectWithRetry = () => {
				try {
					// Start with polling transport
					newSocket.io.opts.transports = ['polling']
					newSocket.connect()
				} catch (error) {
					console.error('Failed to connect:', error)
					if (isMountedRef.current) {
						setStatus('error')
						setIsConnected(false)
						setSocket(null)
						isInitializedRef.current = false
						toast.error('Failed to initialize connection: ' + (error instanceof Error ? error.message : 'Unknown error'), { 
							id: 'connection-status',
							duration: 5000,
							icon: '❌'
						})
						// Retry initialization after delay
						setTimeout(() => {
							if (isMountedRef.current) {
								initializeSocket()
							}
						}, 5000)
					}
				}
			}
			connectWithRetry()

		} catch (error) {
			console.error('❌ Failed to initialize socket:', error)
			if (isMountedRef.current) {
				setStatus('error')
				setIsConnected(false)
				setSocket(null)
				isInitializedRef.current = false
				toast.error('Failed to initialize connection: ' + (error instanceof Error ? error.message : 'Unknown error'), { 
					id: 'connection-status',
					duration: 5000,
					icon: '❌'
				})
				// Retry initialization after delay
				setTimeout(() => {
					if (isMountedRef.current) {
						initializeSocket()
					}
				}, 5000)
			}
		}
	}, [cleanup])

    useEffect(() => {
		if (!isDevelopment) {
			console.log('SocketProvider mounted, checking initialization...')
		}
		isMountedRef.current = true

		// Only initialize if not already initialized
		if (!isInitializedRef.current) {
			if (!isDevelopment) {
				console.log('Socket not initialized, scheduling initialization...')
			}
			// Delay socket initialization slightly to ensure all providers are ready
			initializationTimeoutRef.current = setTimeout(() => {
				initializeSocket()
			}, 100)
		} else if (!isDevelopment) {
			console.log('Socket already initialized, skipping initialization')
		}

        return () => {
			if (!isDevelopment) {
				console.log('SocketProvider unmounting, cleaning up...')
			}
			isMountedRef.current = false
			cleanup()
			// Don't reset isInitializedRef in development to prevent reconnection loops
			if (!isDevelopment) {
				isInitializedRef.current = false
			}
		}
	}, [initializeSocket, cleanup])

	const emit = (event: string, data: unknown) => {
		const currentSocket = socketRef.current
		if (currentSocket?.connected) {
			try {
				console.log('Emitting event:', event, data)
				currentSocket.emit(event, data)
			} catch (error) {
				console.error('Error emitting event:', error)
			}
		} else {
			console.warn('Socket not connected, cannot emit event:', event)
		}
	}

	const value = {
		socket: socketRef.current,
		isConnected,
		emit,
		status
	}

    return (
		<SocketErrorBoundary>
			<SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
		</SocketErrorBoundary>
    )
}

// Single export statement at the end
export { SocketContext, SocketProvider, useSocket } 
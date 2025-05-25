/* eslint-disable react-refresh/only-export-components */
import React, { ReactNode, createContext, useContext, useEffect, useState, useRef, ErrorInfo } from "react"
import { io, Socket } from "socket.io-client"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"

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

export const useSocket = () => {
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

interface SocketProviderProps {
	children: ReactNode
}

export const SocketProvider = ({ children }: SocketProviderProps) => {
	const [socket, setSocket] = useState<Socket | null>(null)
	const [isConnected, setIsConnected] = useState(false)
	const [status, setStatus] = useState<'connected' | 'disconnected' | 'error' | 'connecting'>('disconnected')
	const socketRef = useRef<Socket | null>(null)
	const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
	const isInitializedRef = useRef(false)
	const isMountedRef = useRef(true)

	// Initialize socket
	const initializeSocket = () => {
		if (!isMountedRef.current) return

		try {
			// Clean up existing socket
			if (socketRef.current) {
				try {
					socketRef.current.removeAllListeners()
					socketRef.current.close()
				} catch (e) {
					console.warn('Error cleaning up socket:', e)
				}
				socketRef.current = null
			}

			// Clear any existing reconnect timeout
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current)
				reconnectTimeoutRef.current = undefined
			}

			console.log('Creating new socket connection to:', BACKEND_URL)
			setStatus('connecting')

			// Create new socket instance
			const newSocket = io(BACKEND_URL, {
				path: '/socket.io',
				transports: ['websocket'],
				reconnectionAttempts: 5,
				reconnectionDelay: 1000,
				timeout: 20000,
				forceNew: true,
				autoConnect: false, // Don't connect automatically
				withCredentials: true
			})

			// Set up event handlers before connecting
			const handleConnect = () => {
				if (!isMountedRef.current) return
				console.log('Socket connected successfully')
				setIsConnected(true)
				setStatus('connected')
				setSocket(newSocket)
			}

			const handleDisconnect = (reason: string) => {
				if (!isMountedRef.current) return
				console.log('Socket disconnected. Reason:', reason)
				setIsConnected(false)
				setStatus('disconnected')
				setSocket(null)

				if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
					console.log('Scheduling reconnect attempt...')
					reconnectTimeoutRef.current = setTimeout(() => {
						if (isMountedRef.current) {
							console.log('Attempting to reconnect...')
							initializeSocket()
						}
					}, 5000)
				}
			}

			const handleError = (error: Error) => {
				if (!isMountedRef.current) return
				console.error('Socket error:', error)
				setStatus('error')
				setIsConnected(false)
				setSocket(null)
			}

			const handleConnectError = (error: Error) => {
				if (!isMountedRef.current) return
				console.error('Socket connection error:', error)
				setStatus('error')
				setIsConnected(false)
				setSocket(null)
			}

			// Add event listeners
			newSocket.on('connect', handleConnect)
			newSocket.on('disconnect', handleDisconnect)
			newSocket.on('error', handleError)
			newSocket.on('connect_error', handleConnectError)

			// Store socket reference
			socketRef.current = newSocket
			setSocket(newSocket)

			// Connect after setting up all handlers
			newSocket.connect()

		} catch (error) {
			console.error('Failed to initialize socket:', error)
			if (isMountedRef.current) {
				setStatus('error')
				setIsConnected(false)
				setSocket(null)
			}
		}
	}

	useEffect(() => {
		isMountedRef.current = true
		isInitializedRef.current = false

		if (!isInitializedRef.current) {
			isInitializedRef.current = true
			console.log('SocketProvider mounted, initializing socket...')
			initializeSocket()
		}

		return () => {
			console.log('SocketProvider unmounting, cleaning up...')
			isMountedRef.current = false
			isInitializedRef.current = false

			try {
				if (reconnectTimeoutRef.current) {
					clearTimeout(reconnectTimeoutRef.current)
				}
				if (socketRef.current) {
					socketRef.current.removeAllListeners()
					socketRef.current.close()
					socketRef.current = null
				}
			} catch (e) {
				console.warn('Error during socket cleanup:', e)
			}
		}
	}, []) // eslint-disable-line react-hooks/exhaustive-deps

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

export default SocketContext 
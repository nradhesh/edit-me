/* eslint-disable react-refresh/only-export-components */
import { ReactNode, createContext, useContext, useEffect, useState, useRef } from "react"
import { io, Socket } from "socket.io-client"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"

interface SocketContext {
	socket: Socket | null
	isConnected: boolean
	emit: (event: string, data: unknown) => void
	status: 'connected' | 'disconnected' | 'error' | 'connecting'
}

const SocketContext = createContext<SocketContext | null>(null)

export const useSocket = () => {
	const context = useContext(SocketContext)
	if (!context) {
		throw new Error("useSocket must be used within a SocketProvider")
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

	useEffect(() => {
		console.log('SocketProvider mounted, initializing socket...')
		
		const initializeSocket = () => {
			// Clear any existing socket
			if (socketRef.current) {
				console.log('Cleaning up existing socket...')
				socketRef.current.removeAllListeners()
				socketRef.current.close()
				socketRef.current = null
			}

			// Clear any existing reconnect timeout
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current)
				reconnectTimeoutRef.current = undefined
			}

			try {
				console.log('Creating new socket connection to:', BACKEND_URL)
				setStatus('connecting')

				const newSocket = io(BACKEND_URL, {
					path: '/socket.io',
					transports: ['websocket'],
					reconnectionAttempts: 5,
					reconnectionDelay: 1000,
					timeout: 20000,
					forceNew: true,
					autoConnect: true,
					withCredentials: true
				})

				// Store socket in ref for cleanup
				socketRef.current = newSocket

				const handleConnect = () => {
					console.log('Socket connected successfully')
					setIsConnected(true)
					setStatus('connected')
					setSocket(newSocket)
				}

				const handleDisconnect = (reason: string) => {
					console.log('Socket disconnected. Reason:', reason)
					setIsConnected(false)
					setStatus('disconnected')
					setSocket(null)

					// Only attempt reconnect if not explicitly disconnected
					if (reason !== 'io client disconnect' && reason !== 'io server disconnect') {
						console.log('Scheduling reconnect attempt...')
						reconnectTimeoutRef.current = setTimeout(() => {
							console.log('Attempting to reconnect...')
							initializeSocket()
						}, 5000)
					}
				}

				const handleError = (error: Error) => {
					console.error('Socket error:', error)
					setStatus('error')
					setIsConnected(false)
					setSocket(null)
				}

				const handleConnectError = (error: Error) => {
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

				// Set initial socket state
				setSocket(newSocket)
				setIsConnected(newSocket.connected)
				setStatus(newSocket.connected ? 'connected' : 'connecting')

			} catch (error) {
				console.error('Failed to initialize socket:', error)
				setStatus('error')
				setIsConnected(false)
				setSocket(null)
			}
		}

		// Initial connection
		initializeSocket()

		// Cleanup function
		return () => {
			console.log('SocketProvider unmounting, cleaning up...')
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current)
			}
			if (socketRef.current) {
				socketRef.current.removeAllListeners()
				socketRef.current.close()
				socketRef.current = null
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
		<SocketContext.Provider value={value}>
			{children}
		</SocketContext.Provider>
	)
}

export default SocketContext 
/* eslint-disable react-refresh/only-export-components */
import { ReactNode, createContext, useContext, useEffect, useState } from "react"
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

	useEffect(() => {
		let socketInstance: Socket | null = null
		let reconnectTimeout: NodeJS.Timeout

		const initializeSocket = () => {
			try {
				setStatus('connecting')
				socketInstance = io(BACKEND_URL, {
					path: '/socket.io',
					transports: ['websocket'],
					reconnectionAttempts: 5,
					reconnectionDelay: 1000,
					timeout: 20000,
					forceNew: true,
					autoConnect: true
				})

				const handleConnect = () => {
					console.log('Socket connected')
					setIsConnected(true)
					setStatus('connected')
				}

				const handleDisconnect = (reason: string) => {
					console.log('Socket disconnected:', reason)
					setIsConnected(false)
					setStatus('disconnected')
					
					// Attempt to reconnect after a delay if not explicitly disconnected
					if (reason !== 'io client disconnect') {
						reconnectTimeout = setTimeout(() => {
							console.log('Attempting to reconnect...')
							initializeSocket()
						}, 5000)
					}
				}

				const handleError = (error: Error) => {
					console.error('Socket error:', error)
					setStatus('error')
					setIsConnected(false)
				}

				const handleConnectError = (error: Error) => {
					console.error('Socket connection error:', error)
					setStatus('error')
					setIsConnected(false)
				}

				socketInstance.on('connect', handleConnect)
				socketInstance.on('disconnect', handleDisconnect)
				socketInstance.on('error', handleError)
				socketInstance.on('connect_error', handleConnectError)

				setSocket(socketInstance)
			} catch (error) {
				console.error('Failed to initialize socket:', error)
				setStatus('error')
				setIsConnected(false)
			}
		}

		initializeSocket()

		return () => {
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout)
			}
			if (socketInstance) {
				socketInstance.off('connect')
				socketInstance.off('disconnect')
				socketInstance.off('error')
				socketInstance.off('connect_error')
				socketInstance.close()
			}
		}
	}, []) // eslint-disable-line react-hooks/exhaustive-deps

	const emit = (event: string, data: unknown) => {
		if (socket && isConnected) {
			try {
				socket.emit(event, data)
			} catch (error) {
				console.error('Error emitting event:', error)
			}
		} else {
			console.warn('Socket not connected, cannot emit event:', event)
		}
	}

	const value = {
		socket,
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
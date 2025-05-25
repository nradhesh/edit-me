/* eslint-disable react-refresh/only-export-components */
import { ReactNode, createContext, useContext, useEffect, useState } from "react"
import { io, Socket } from "socket.io-client"

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"

interface SocketContext {
	socket: Socket
	isConnected: boolean
	emit: (event: string, data: unknown) => void
	status: 'connected' | 'disconnected' | 'error'
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
	const [status, setStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected')

	useEffect(() => {
		const socketInstance = io(BACKEND_URL, {
			path: '/socket.io',
			transports: ['websocket'],
			reconnectionAttempts: 5,
			reconnectionDelay: 1000,
			timeout: 20000,
		})

		const handleConnect = () => {
			console.log('Socket connected')
			setIsConnected(true)
			setStatus('connected')
		}

		const handleDisconnect = () => {
			console.log('Socket disconnected')
			setIsConnected(false)
			setStatus('disconnected')
		}

		const handleError = (error: Error) => {
			console.error('Socket error:', error)
			setStatus('error')
		}

		socketInstance.on('connect', handleConnect)
		socketInstance.on('disconnect', handleDisconnect)
		socketInstance.on('error', handleError)

		setSocket(socketInstance)

		return () => {
			socketInstance.off('connect', handleConnect)
			socketInstance.off('disconnect', handleDisconnect)
			socketInstance.off('error', handleError)
			socketInstance.close()
		}
	}, []) // eslint-disable-line react-hooks/exhaustive-deps

	const emit = (event: string, data: unknown) => {
		if (socket && isConnected) {
			socket.emit(event, data)
		} else {
			console.warn('Socket not connected, cannot emit event:', event)
		}
	}

	const value = {
		socket: socket as Socket,
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

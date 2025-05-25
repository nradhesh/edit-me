/* eslint-disable react-refresh/only-export-components */
import { DrawingData } from "@/types/app"
import {
    SocketContext as SocketContextType,
    SocketEvent,
    SocketId,
} from "@/types/socket"
import { RemoteUser, USER_STATUS, User } from "@/types/user"
import {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react"
import { toast } from "react-hot-toast"
import { io, Socket } from "socket.io-client"
import { useAppContext } from "./AppContext"

const SocketContext = createContext<SocketContextType | null>(null)

export const useSocket = (): SocketContextType => {
    const context = useContext(SocketContext)
    if (!context) {
        throw new Error("useSocket must be used within a SocketProvider")
    }
    return context
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"

const SocketProvider = ({ children }: { children: ReactNode }) => {
    const {
        users,
        setUsers,
        setStatus,
        setCurrentUser,
        drawingData,
        setDrawingData,
    } = useAppContext()

    const [socket, setSocket] = useState<Socket | null>(null)
    const [isConnected, setIsConnected] = useState(false)

    // Initialize Socket.IO with better error handling
    useEffect(() => {
        console.log('Initializing Socket.IO with:', {
            backendUrl: BACKEND_URL
        });

        const socketClient = io(BACKEND_URL, {
            transports: ['websocket'],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000
        });

        socketClient.on('connect', () => {
            console.log('Socket.IO connected successfully');
            console.log('Connection details:', {
                socketId: socketClient.id,
                connected: socketClient.connected
            });
            setIsConnected(true);
            setStatus(USER_STATUS.INITIAL);
        });

        socketClient.on('connect_error', (err) => {
            console.error('Socket.IO connection error:', err);
            console.log('Connection state at error:', {
                connected: socketClient.connected,
                socketId: socketClient.id,
                error: err.message
            });
            handleError(err);
        });

        socketClient.on('disconnect', () => {
            console.log('Socket.IO disconnected');
            console.log('Connection state at disconnect:', {
                connected: socketClient.connected,
                socketId: socketClient.id
            });
            setIsConnected(false);
            setStatus(USER_STATUS.DISCONNECTED);
        });

        setSocket(socketClient);

        return () => {
            console.log('Cleaning up Socket.IO connection');
            socketClient.disconnect();
        };
    }, []);

    const handleError = useCallback(
        (err: any) => {
            console.error("Connection error:", err);
            setStatus(USER_STATUS.CONNECTION_FAILED);
            toast.dismiss();
            
            let errorMessage = 'Failed to connect to server';
            if (err.message) {
                if (err.message.includes('timeout')) {
                    errorMessage = 'Connection timed out. Please check your internet connection.';
                } else {
                    errorMessage = `Connection error: ${err.message}`;
                }
            }
            
            toast.error(errorMessage);
            
            console.log('Connection details:', {
                backendUrl: BACKEND_URL,
                socketId: socket?.id,
                connected: socket?.connected
            });
        },
        [setStatus, socket],
    )

    const joinRoom = useCallback(async (roomId: string, username: string) => {
        if (!socket) {
            handleError(new Error('Socket not initialized'));
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/join-room`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ roomId, username }),
            });

            if (!response.ok) {
                const data = await response.json();
                if (data.error === 'Username already exists') {
                    toast.error('Username already exists in this room');
                    setStatus(USER_STATUS.INITIAL);
                    return;
                }
                throw new Error(data.error || 'Failed to join room');
            }

            const { userId } = await response.json();
            
            // Join the room
            socket.emit(SocketEvent.JOIN_REQUEST, { roomId, username, userId });

            // Listen for room events
            socket.on(SocketEvent.USER_JOINED, ({ user }: { user: User }) => {
                setUsers(prev => [...prev, user]);
                toast.success(`${user.username} joined the room`);
            });

            socket.on(SocketEvent.USER_DISCONNECTED, ({ user }: { user: User }) => {
                setUsers(prev => prev.filter(u => u.socketId !== user.socketId));
                toast.success(`${user.username} left the room`);
            });

            socket.on(SocketEvent.JOIN_ACCEPTED, ({ user, users }: { user: User; users: RemoteUser[] }) => {
                setCurrentUser(user);
                setUsers(users);
                toast.dismiss();
                setStatus(USER_STATUS.JOINED);

                if (users.length > 1) {
                    toast.loading("Syncing data, please wait...");
                }
            });

        } catch (error) {
            handleError(error);
        }
    }, [socket, handleError, setUsers, setCurrentUser, setStatus]);

    const leaveRoom = useCallback(async () => {
        if (!socket) return;

        try {
            await fetch(`${BACKEND_URL}/api/leave-room`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId: socket.id }),
            });

            socket.off(SocketEvent.USER_JOINED);
            socket.off(SocketEvent.USER_DISCONNECTED);
            socket.off(SocketEvent.JOIN_ACCEPTED);
            setStatus(USER_STATUS.INITIAL);
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    }, [socket, setStatus]);

    return (
        <SocketContext.Provider
            value={{
                socket: socket!,
                isConnected
            }}
        >
            {children}
        </SocketContext.Provider>
    )
}

export { SocketProvider }
export default SocketContext

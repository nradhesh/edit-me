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
} from "react"
import { toast } from "react-hot-toast"
import { Socket, io } from "socket.io-client"
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
    const socket: Socket = useMemo(
        () =>
            io(BACKEND_URL, {
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                autoConnect: true,
                transports: ['polling'],
                path: '/socket.io/',
                forceNew: true,
                withCredentials: true,
                upgrade: false,
                rememberUpgrade: false,
                extraHeaders: {
                    'Access-Control-Allow-Origin': '*'
                }
            }),
        [],
    )

    const handleError = useCallback(
        (err: any) => {
            console.error("Socket connection error:", err);
            setStatus(USER_STATUS.CONNECTION_FAILED);
            toast.dismiss();
            
            // More detailed error message based on error type
            let errorMessage = 'Failed to connect to server';
            if (err.message) {
                if (err.message.includes('timeout')) {
                    errorMessage = 'Connection timed out. Please check your internet connection.';
                } else if (err.message.includes('xhr poll error')) {
                    errorMessage = 'Polling connection failed. Please try again.';
                } else {
                    errorMessage = `Connection error: ${err.message}`;
                }
            }
            
            toast.error(errorMessage);
            
            // Log connection details for debugging
            console.log('Connection details:', {
                backendUrl: BACKEND_URL,
                socketId: socket.id,
                connected: socket.connected,
                disconnected: socket.disconnected,
                transport: socket.io.engine?.transport?.name,
                upgrade: socket.io.engine?.upgrade,
                readyState: socket.io.engine?.readyState,
                polling: socket.io.engine?.transport?.name === 'polling',
                pollingWritable: socket.io.engine?.transport?.writable
            });
        },
        [setStatus, socket],
    )

    const handleUsernameExist = useCallback(() => {
        toast.dismiss()
        setStatus(USER_STATUS.INITIAL)
        toast.error(
            "The username you chose already exists in the room. Please choose a different username.",
        )
    }, [setStatus])

    const handleJoiningAccept = useCallback(
        ({ user, users }: { user: User; users: RemoteUser[] }) => {
            setCurrentUser(user)
            setUsers(users)
            toast.dismiss()
            setStatus(USER_STATUS.JOINED)

            if (users.length > 1) {
                toast.loading("Syncing data, please wait...")
            }
        },
        [setCurrentUser, setStatus, setUsers],
    )

    const handleUserLeft = useCallback(
        ({ user }: { user: User }) => {
            toast.success(`${user.username} left the room`)
            setUsers(users.filter((u: User) => u.username !== user.username))
        },
        [setUsers, users],
    )

    const handleRequestDrawing = useCallback(
        ({ socketId }: { socketId: SocketId }) => {
            socket.emit(SocketEvent.SYNC_DRAWING, { socketId, drawingData })
        },
        [drawingData, socket],
    )

    const handleDrawingSync = useCallback(
        ({ drawingData }: { drawingData: DrawingData }) => {
            setDrawingData(drawingData)
        },
        [setDrawingData],
    )

    useEffect(() => {
        const handleConnect = () => {
            console.log('Socket connected successfully');
            console.log('Transport:', socket.io.engine?.transport?.name);
            toast.dismiss();
            setStatus(USER_STATUS.INITIAL);
        };

        const handleConnectError = (error: Error) => {
            console.error('Socket connection error:', error);
            handleError(error);
        };

        const handleDisconnect = (reason: string) => {
            console.log('Socket disconnected:', reason);
            if (reason === 'io server disconnect') {
                // Server initiated disconnect, try to reconnect
                socket.connect();
            }
            setStatus(USER_STATUS.DISCONNECTED);
        };

        socket.on('connect', handleConnect);
        socket.on('connect_error', handleConnectError);
        socket.on('disconnect', handleDisconnect);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('connect_error', handleConnectError);
            socket.off('disconnect', handleDisconnect);
        };
    }, [socket, handleError, setStatus]);

    return (
        <SocketContext.Provider
            value={{
                socket,
            }}
        >
            {children}
        </SocketContext.Provider>
    )
}

export { SocketProvider }
export default SocketContext

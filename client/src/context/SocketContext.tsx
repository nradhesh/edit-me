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
                transports: ['websocket', 'polling'],
            }),
        [],
    )

    const handleError = useCallback(
        (err: any) => {
            console.error("Socket connection error:", err);
            setStatus(USER_STATUS.CONNECTION_FAILED);
            toast.dismiss();
            toast.error(`Failed to connect to server: ${err.message || 'Unknown error'}`);
            
            // Log connection details for debugging
            console.log('Connection details:', {
                backendUrl: BACKEND_URL,
                socketId: socket.id,
                connected: socket.connected,
                disconnected: socket.disconnected,
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
        socket.on('connect', () => {
            console.log('Socket connected successfully');
            toast.dismiss();
            setStatus(USER_STATUS.INITIAL);
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            handleError(error);
        });

        socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            if (reason === 'io server disconnect') {
                // Server initiated disconnect, try to reconnect
                socket.connect();
            }
            setStatus(USER_STATUS.DISCONNECTED);
        });

        socket.on('reconnect_attempt', (attemptNumber) => {
            console.log(`Attempting to reconnect (${attemptNumber})...`);
            toast.loading(`Reconnecting to server (attempt ${attemptNumber})...`);
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log(`Reconnected after ${attemptNumber} attempts`);
            toast.dismiss();
            toast.success('Reconnected to server');
            setStatus(USER_STATUS.INITIAL);
        });

        socket.on('reconnect_error', (error) => {
            console.error('Reconnection error:', error);
            handleError(error);
        });

        socket.on('reconnect_failed', () => {
            console.error('Failed to reconnect after all attempts');
            toast.error('Failed to reconnect to server. Please refresh the page.');
            setStatus(USER_STATUS.CONNECTION_FAILED);
        });

        socket.on(SocketEvent.USERNAME_EXISTS, handleUsernameExist)
        socket.on(SocketEvent.JOIN_ACCEPTED, handleJoiningAccept)
        socket.on(SocketEvent.USER_DISCONNECTED, handleUserLeft)
        socket.on(SocketEvent.REQUEST_DRAWING, handleRequestDrawing)
        socket.on(SocketEvent.SYNC_DRAWING, handleDrawingSync)

        return () => {
            socket.off('connect');
            socket.off('connect_error');
            socket.off('disconnect');
            socket.off('reconnect_attempt');
            socket.off('reconnect');
            socket.off('reconnect_error');
            socket.off('reconnect_failed');
            socket.off(SocketEvent.USERNAME_EXISTS);
            socket.off(SocketEvent.JOIN_ACCEPTED);
            socket.off(SocketEvent.USER_DISCONNECTED);
            socket.off(SocketEvent.REQUEST_DRAWING);
            socket.off(SocketEvent.SYNC_DRAWING);
        }
    }, [
        handleDrawingSync,
        handleError,
        handleJoiningAccept,
        handleRequestDrawing,
        handleUserLeft,
        handleUsernameExist,
        setUsers,
        socket,
        setStatus,
    ])

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

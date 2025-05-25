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
import Pusher, { Channel, PresenceChannel } from "pusher-js"
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
const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY || ""
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER || ""

const SocketProvider = ({ children }: { children: ReactNode }) => {
    const {
        users,
        setUsers,
        setStatus,
        setCurrentUser,
        drawingData,
        setDrawingData,
    } = useAppContext()

    const [pusher, setPusher] = useState<Pusher | null>(null)
    const [channel, setChannel] = useState<Channel | null>(null)
    const [userId, setUserId] = useState<string | null>(null)

    // Initialize Pusher
    useEffect(() => {
        if (!PUSHER_KEY || !PUSHER_CLUSTER) {
            console.error('Pusher configuration missing');
            setStatus(USER_STATUS.CONNECTION_FAILED);
            return;
        }

        const pusherClient = new Pusher(PUSHER_KEY, {
            cluster: PUSHER_CLUSTER,
            enabledTransports: ['ws', 'wss'],
            authEndpoint: `${BACKEND_URL}/api/pusher/auth`,
            auth: {
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            }
        });

        pusherClient.connection.bind('connected', () => {
            console.log('Pusher connected successfully');
            setStatus(USER_STATUS.INITIAL);
        });

        pusherClient.connection.bind('error', (err: any) => {
            console.error('Pusher connection error:', err);
            handleError(err);
        });

        pusherClient.connection.bind('disconnected', () => {
            console.log('Pusher disconnected');
            setStatus(USER_STATUS.DISCONNECTED);
        });

        setPusher(pusherClient);

        return () => {
            pusherClient.disconnect();
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
                } else if (err.message.includes('pusher')) {
                    errorMessage = 'Real-time connection failed. Please try again.';
                } else {
                    errorMessage = `Connection error: ${err.message}`;
                }
            }
            
            toast.error(errorMessage);
            
            console.log('Connection details:', {
                backendUrl: BACKEND_URL,
                pusherKey: PUSHER_KEY ? 'configured' : 'missing',
                pusherCluster: PUSHER_CLUSTER ? 'configured' : 'missing',
                userId,
                channel: channel?.name,
                connected: pusher?.connection.state === 'connected'
            });
        },
        [setStatus, pusher, channel, userId],
    )

    const joinRoom = useCallback(async (roomId: string, username: string) => {
        if (!pusher) {
            handleError(new Error('Pusher not initialized'));
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

            const { userId: newUserId } = await response.json();
            setUserId(newUserId);

            // Subscribe to room channel
            const roomChannel = pusher.subscribe(`presence-${roomId}`) as PresenceChannel;
            setChannel(roomChannel);

            // Bind to room events
            roomChannel.bind(SocketEvent.USER_JOINED, ({ user }: { user: User }) => {
                setUsers(prev => [...prev, user]);
                toast.success(`${user.username} joined the room`);
            });

            roomChannel.bind(SocketEvent.USER_DISCONNECTED, ({ user }: { user: User }) => {
                setUsers(prev => prev.filter(u => u.socketId !== user.socketId));
                toast.success(`${user.username} left the room`);
            });

            roomChannel.bind(SocketEvent.JOIN_ACCEPTED, ({ user, users }: { user: User; users: RemoteUser[] }) => {
                setCurrentUser(user);
                setUsers(users);
                toast.dismiss();
                setStatus(USER_STATUS.JOINED);

                if (users.length > 1) {
                    toast.loading("Syncing data, please wait...");
                }
            });

            // Bind to other events
            roomChannel.bind(SocketEvent.SYNC_FILE_STRUCTURE, ({ fileStructure, openFiles, activeFile }) => {
                // Handle file structure sync
            });

            roomChannel.bind(SocketEvent.DIRECTORY_CREATED, ({ parentDirId, newDirectory }) => {
                // Handle directory creation
            });

            roomChannel.bind(SocketEvent.FILE_UPDATED, ({ fileId, newContent }) => {
                // Handle file updates
            });

            roomChannel.bind(SocketEvent.DRAWING_UPDATE, ({ snapshot }) => {
                // Handle drawing updates
            });

        } catch (error) {
            handleError(error);
        }
    }, [pusher, handleError, setUsers, setCurrentUser, setStatus]);

    const leaveRoom = useCallback(async () => {
        if (!pusher || !channel || !userId) return;

        try {
            await fetch(`${BACKEND_URL}/api/leave-room`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId }),
            });

            channel.unbind_all();
            pusher.unsubscribe(channel.name);
            setChannel(null);
            setUserId(null);
            setStatus(USER_STATUS.INITIAL);
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    }, [pusher, channel, userId, setStatus]);

    const emit = useCallback((event: string, data: any) => {
        if (!channel) {
            console.error('No channel available for emitting event');
            return;
        }
        channel.trigger(event, data);
    }, [channel]);

    return (
        <SocketContext.Provider
            value={{
                joinRoom,
                leaveRoom,
                emit,
                isConnected: pusher?.connection.state === 'connected',
            }}
        >
            {children}
        </SocketContext.Provider>
    )
}

export { SocketProvider }
export default SocketContext

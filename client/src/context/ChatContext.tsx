/* eslint-disable react-refresh/only-export-components */
import { ChatContext as ChatContextType, ChatMessage } from "@/types/chat"
import { SocketEvent } from "@/types/socket"
import {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useState,
    useRef,
} from "react"
import { useSocket } from "./SocketContext"

const ChatContext = createContext<ChatContextType | null>(null)

const useChatRoom = (): ChatContextType => {
    const context = useContext(ChatContext)
    if (!context) {
        throw new Error("useChatRoom must be used within a ChatContextProvider")
    }
    return context
}

const ChatContextProvider = ({ children }: { children: ReactNode }) => {
    const { socket, isConnected, status } = useSocket()
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [isNewMessage, setIsNewMessage] = useState<boolean>(false)
    const [lastScrollHeight, setLastScrollHeight] = useState<number>(0)
    const isMountedRef = useRef(true)

    const sendMessage = (message: ChatMessage) => {
        if (socket?.connected) {
            socket.emit(SocketEvent.SEND_MESSAGE, { message });
        } else {
            console.warn('Socket not connected, cannot send message');
        }
    };

    useEffect(() => {
        if (!socket || !isConnected) return;

        const handleMessage = ({ message }: { message: ChatMessage }) => {
            if (!isMountedRef.current) return;
            setMessages((messages) => [...messages, message]);
            setIsNewMessage(true);
        };

        socket.on(SocketEvent.RECEIVE_MESSAGE, handleMessage);

        return () => {
            if (socket) {
                socket.off(SocketEvent.RECEIVE_MESSAGE, handleMessage);
            }
        };
    }, [socket, isConnected]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    return (
        <ChatContext.Provider
            value={{
                messages,
                setMessages,
                isNewMessage,
                setIsNewMessage,
                lastScrollHeight,
                setLastScrollHeight,
                sendMessage,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}

export { ChatContext, ChatContextProvider, useChatRoom }

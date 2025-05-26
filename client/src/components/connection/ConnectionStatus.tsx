import { useSocket } from "@/context/SocketContext"
import { useEffect, useState } from "react"

function ConnectionStatus() {
    const { status, isConnected } = useSocket()
    const [showStatus, setShowStatus] = useState(false)

    useEffect(() => {
        if (status === 'error' || status === 'disconnected') {
            setShowStatus(true)
            const timer = setTimeout(() => setShowStatus(false), 5000)
            return () => clearTimeout(timer)
        } else {
            setShowStatus(false)
        }
    }, [status])

    if (!showStatus) return null

    return (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md bg-darkHover px-4 py-2 text-sm">
            <div className={`h-2 w-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-white">
                {status === 'connected' ? 'Connected to server' :
                 status === 'connecting' ? 'Connecting to server...' :
                 status === 'disconnected' ? 'Disconnected from server' :
                 'Connection error'}
            </span>
        </div>
    )
}

export default ConnectionStatus 
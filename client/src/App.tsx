import { BrowserRouter } from "react-router-dom"
import { AppContextProvider } from "./context/AppContext"
import { SocketProvider } from "./context/SocketContext"
import { ViewContextProvider } from "./context/ViewContext"
import { SettingContextProvider } from "./context/SettingContext"
import { FileContextProvider } from "./context/FileContext"
import { ChatContextProvider } from "./context/ChatContext"
import AppRoutes from "./routes"
import Toast from "./components/toast/Toast"
import ConnectionStatus from "./components/connection/ConnectionStatus"

function App() {
    return (
        <BrowserRouter>
            <AppContextProvider>
                <SocketProvider>
                    <ViewContextProvider>
                        <SettingContextProvider>
                            <FileContextProvider>
                                <ChatContextProvider>
                                    <AppRoutes />
                                    <Toast />
                                    <ConnectionStatus />
                                </ChatContextProvider>
                            </FileContextProvider>
                        </SettingContextProvider>
                    </ViewContextProvider>
                </SocketProvider>
            </AppContextProvider>
        </BrowserRouter>
    )
}

export default App

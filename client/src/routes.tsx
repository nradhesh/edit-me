import { Route, Routes } from "react-router-dom"
import EditorPage from "./pages/EditorPage"
import HomePage from "./pages/HomePage"

function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/editor/:roomId" element={<EditorPage />} />
        </Routes>
    )
}

export default AppRoutes 
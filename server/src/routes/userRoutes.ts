import express, { Router, Request, Response } from "express"
import { UserModel } from "../models/User"
import { USER_CONNECTION_STATUS } from "../types/user"

const router: Router = express.Router()

// Get all users in a room
router.get("/room/:roomId", async (req: Request, res: Response) => {
    try {
        const { roomId } = req.params
        const users = await UserModel.find({ roomId, status: USER_CONNECTION_STATUS.ONLINE })
        res.json(users)
    } catch (error) {
        console.error("Error fetching users:", error)
        res.status(500).json({ error: "Failed to fetch users" })
    }
})

// Update user status
router.patch("/:userId/status", async (req: Request, res: Response) => {
    try {
        const { userId } = req.params
        const { status } = req.body

        const user = await UserModel.findOneAndUpdate(
            { socketId: userId },
            { status },
            { new: true }
        )

        if (!user) {
            return res.status(404).json({ error: "User not found" })
        }

        res.json(user)
    } catch (error) {
        console.error("Error updating user status:", error)
        res.status(500).json({ error: "Failed to update user status" })
    }
})

// Update user's current file
router.patch("/:userId/file", async (req: Request, res: Response) => {
    try {
        const { userId } = req.params
        const { currentFile } = req.body

        const user = await UserModel.findOneAndUpdate(
            { socketId: userId },
            { currentFile },
            { new: true }
        )

        if (!user) {
            return res.status(404).json({ error: "User not found" })
        }

        res.json(user)
    } catch (error) {
        console.error("Error updating user's current file:", error)
        res.status(500).json({ error: "Failed to update user's current file" })
    }
})

// Clean up offline users (can be called periodically)
router.delete("/cleanup", async (req: Request, res: Response) => {
    try {
        const result = await UserModel.deleteMany({
            status: USER_CONNECTION_STATUS.OFFLINE,
            updatedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // 24 hours ago
        })
        res.json({ message: `Cleaned up ${result.deletedCount} offline users` })
    } catch (error) {
        console.error("Error cleaning up users:", error)
        res.status(500).json({ error: "Failed to clean up users" })
    }
})

export { router as userRouter } 
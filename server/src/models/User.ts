import mongoose, { Document, Schema } from "mongoose"
import { USER_CONNECTION_STATUS } from "../types/user"

export interface IUser extends Document {
    username: string
    socketId: string
    roomId: string
    status: USER_CONNECTION_STATUS
    cursorPosition: number
    typing: boolean
    currentFile: string | null
    createdAt: Date
    updatedAt: Date
}

const userSchema = new Schema<IUser>(
    {
        username: {
            type: String,
            required: true,
            trim: true
        },
        socketId: {
            type: String,
            required: true,
            unique: true
        },
        roomId: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: Object.values(USER_CONNECTION_STATUS),
            default: USER_CONNECTION_STATUS.OFFLINE
        },
        cursorPosition: {
            type: Number,
            default: 0
        },
        typing: {
            type: Boolean,
            default: false
        },
        currentFile: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
)

// Index for faster queries
userSchema.index({ roomId: 1, status: 1 })
userSchema.index({ socketId: 1 }, { unique: true })
userSchema.index({ updatedAt: 1 })

export const User = mongoose.model<IUser>("User", userSchema)

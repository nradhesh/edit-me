import mongoose from "mongoose"

export enum USER_CONNECTION_STATUS {
  ONLINE = "online",
  OFFLINE = "offline",
  AWAY = "away",
}

interface User {
  username: string
  roomId: string
  status: USER_CONNECTION_STATUS
  cursorPosition: number
  typing: boolean
  currentFile: string | null
  socketId: string
}

const userSchema = new mongoose.Schema<User>({
  username: { type: String, required: true },
  roomId: { type: String, required: true },
  status: {
    type: String,
    enum: Object.values(USER_CONNECTION_STATUS),
    required: true,
  },
  cursorPosition: { type: Number, required: true },
  typing: { type: Boolean, required: true },
  currentFile: { type: String, default: null },
  socketId: { type: String, required: true },
}, { timestamps: true })

const UserModel = mongoose.model<User>("User", userSchema)

export default UserModel

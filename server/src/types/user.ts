import { IUser } from '../models/User';

export enum USER_CONNECTION_STATUS {
	ONLINE = "online",
	OFFLINE = "offline",
	AWAY = "away",
}

export type User = Pick<IUser, 'username' | 'roomId' | 'status' | 'cursorPosition' | 'typing' | 'currentFile' | 'socketId'>;

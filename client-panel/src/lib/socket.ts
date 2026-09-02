import type { Socket } from "socket.io-client";

let socket: Socket | null = null;

const noopSocket = {
  connected: true,
  on: () => noopSocket,
  off: () => noopSocket,
  emit: () => noopSocket,
  disconnect: () => undefined,
} as unknown as Socket;

export function connectSocket(): Socket {
  if (socket) return socket;
  socket = noopSocket;
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

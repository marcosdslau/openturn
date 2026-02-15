import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = (namespace: string) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // URL do backend (ajustar conforme ambiente)
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

        const socketInstance = io(`${backendUrl}${namespace}`, {
            transports: ['websocket'],
            autoConnect: true,
        });

        socketInstance.on('connect', () => {
            console.log(`Connected to socket ${namespace}`);
            setIsConnected(true);
        });

        socketInstance.on('disconnect', () => {
            console.log(`Disconnected from socket ${namespace}`);
            setIsConnected(false);
        });

        socketRef.current = socketInstance;
        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, [namespace]);

    return { socket, isConnected };
};

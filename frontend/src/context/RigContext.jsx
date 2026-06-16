import React, { createContext, useContext, useState, useEffect } from 'react';
import io from 'socket.io-client';

const RigContext = createContext();

export const RIGS = [
    { id: 'digital-twin', name: 'Digital Twin', ip: 'localhost' }
];

export const RigProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [currentRig] = useState(RIGS[0]);
    const [globalRigData, setGlobalRigData] = useState(() => {
        // Initialize from localStorage if available
        const saved = localStorage.getItem('last_rig_data');
        return saved ? JSON.parse(saved) : null;
    });

    const [alarmEnabled, setAlarmEnabled] = useState(() => {
        const saved = localStorage.getItem('romi_global_alarm_enabled');
        return saved !== 'false'; // default to true
    });

    useEffect(() => {
        localStorage.setItem('romi_global_alarm_enabled', String(alarmEnabled));
    }, [alarmEnabled]);

    useEffect(() => {
        console.log('[RigContext] Initializing socket connection...');

        const newSocket = io({
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });

        newSocket.on('connect', () => {
            console.log('[RigContext] Socket connected! ID:', newSocket.id);
        });

        newSocket.on('connect_error', (error) => {
            console.error('[RigContext] Socket connection error:', error);
        });

        newSocket.on('disconnect', (reason) => {
            console.warn('[RigContext] Socket disconnected. Reason:', reason);
        });

        newSocket.on('rig_data', (data) => {
            if (data) {
                // Replace state entirely with fresh data from backend.
                // When PLC is disconnected, backend sends zeros — no merging with old values.
                setGlobalRigData(data);
                localStorage.setItem('last_rig_data', JSON.stringify(data));
            }
        });

        setSocket(newSocket);

        return () => {
            if (newSocket) {
                console.log("[RigContext] Cleaning up socket connection...");
                newSocket.off('rig_data');
                newSocket.off('connect');
                newSocket.off('connect_error');
                newSocket.off('disconnect');
                newSocket.disconnect();
            }
        };
    }, []);

    // Helper to get the correct API Base URL
    const apiBaseUrl = '';

    return (
        <RigContext.Provider value={{
            currentRig,
            setCurrentRig: () => { },
            rigs: RIGS,
            socket,
            apiBaseUrl,
            globalRigData,
            alarmEnabled,
            setAlarmEnabled
        }}>
            {children}
        </RigContext.Provider>
    );
};

export const useRig = () => {
    const context = useContext(RigContext);
    if (!context) {
        throw new Error("useRig must be used within a RigProvider");
    }
    return context;
};

import { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { printerAPI } from '@/services/api';
import toast from 'react-hot-toast';

const PrintAgentContext = createContext();

export function usePrintAgent() {
  const context = useContext(PrintAgentContext);
  if (!context) throw new Error('usePrintAgent must be used within PrintAgentProvider');
  return context;
}

export function PrintAgentProvider({ children }) {
  const [isAgentActive, setIsAgentActive] = useState(() => {
    return localStorage.getItem('printAgentActive') === 'true';
  });
  const [socket, setSocket] = useState(null);
  const [jobsProcessed, setJobsProcessed] = useState(0);
  const [lastJobTime, setLastJobTime] = useState(null);
  const [printerConfig, setPrinterConfig] = useState(null);

  // Charger la config imprimante au démarrage
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { data } = await printerAPI.getStatus();
        if (data.data?.config) setPrinterConfig(data.data.config);
      } catch (err) {
        console.error('Erreur chargement config imprimante:', err);
      }
    };
    loadConfig();
  }, []);

  // Connecter Socket.IO quand l'agent est activé
  useEffect(() => {
    if (!isAgentActive) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || window.location.origin;
    const newSocket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    newSocket.on('connect', () => {
      console.log('🔗 Agent d\'impression connecté au serveur');
      toast.success('Agent d\'impression activé');
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Agent d\'impression déconnecté');
    });

    newSocket.on('print-job', async (job) => {
      console.log('📥 Job d\'impression reçu:', job);
      await handlePrintJob(job);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [isAgentActive]);

  const handlePrintJob = async (job) => {
    try {
      // Utiliser l'API du serveur local pour imprimer
      // Le serveur local a accès direct au réseau WiFi de l'imprimante
      const response = await printerAPI.printTicket({
        ticketData: job.ticketData,
        printerConfig: {
          type: 'network',
          address: job.address,
          port: job.port,
        }
      });

      setJobsProcessed(prev => prev + 1);
      setLastJobTime(new Date().toISOString());
      toast.success(`✅ Ticket imprimé: ${job.ticketData?.ticketNumber || 'N/A'}`);
      console.log('✅ Job imprimé:', job.id);
    } catch (error) {
      console.error('❌ Erreur impression job:', error);
      toast.error(`Échec impression: ${error.message}`);
    }
  };

  const activateAgent = () => {
    localStorage.setItem('printAgentActive', 'true');
    setIsAgentActive(true);
  };

  const deactivateAgent = () => {
    localStorage.setItem('printAgentActive', 'false');
    setIsAgentActive(false);
  };

  const value = {
    isAgentActive,
    activateAgent,
    deactivateAgent,
    jobsProcessed,
    lastJobTime,
    isConnected: socket?.connected || false,
  };

  return <PrintAgentContext.Provider value={value}>{children}</PrintAgentContext.Provider>;
}

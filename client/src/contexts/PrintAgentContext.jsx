import { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

const LOCAL_SERVER_URL = 'http://localhost:5000';

const PrintAgentContext = createContext();

export function usePrintAgent() {
  const context = useContext(PrintAgentContext);
  if (!context) throw new Error('usePrintAgent must be used within PrintAgentProvider');
  return context;
}

export function PrintAgentProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [isAgentActive, setIsAgentActive] = useState(() => {
    return localStorage.getItem('printAgentActive') === 'true';
  });
  const [socket, setSocket] = useState(null);
  const [jobsProcessed, setJobsProcessed] = useState(0);
  const [lastJobTime, setLastJobTime] = useState(null);
  const [printerConfig, setPrinterConfig] = useState(null);
  const [localServerAvailable, setLocalServerAvailable] = useState(false);

  // Vérifier si le serveur local est disponible
  const checkLocalServer = async () => {
    try {
      await axios.get(`${LOCAL_SERVER_URL}/api/health`, { timeout: 3000 });
      setLocalServerAvailable(true);
      return true;
    } catch {
      try {
        // Fallback : tenter n'importe quelle route connue
        await axios.get(`${LOCAL_SERVER_URL}/api/printer/status`, {
          timeout: 3000,
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setLocalServerAvailable(true);
        return true;
      } catch {
        setLocalServerAvailable(false);
        return false;
      }
    }
  };

  // Charger la config imprimante seulement si authentifié
  useEffect(() => {
    if (!isAuthenticated) return;
    checkLocalServer();
  }, [isAuthenticated]);

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
    const token = localStorage.getItem('token');
    // Créer une instance axios pointant vers le SERVEUR LOCAL (seul capable d'atteindre l'imprimante WiFi)
    const localApi = axios.create({
      baseURL: `${LOCAL_SERVER_URL}/api`,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      timeout: 10000,
    });

    try {
      const response = await localApi.post('/printer/print-ticket', {
        ticketData: job.ticketData,
        printerConfig: {
          type: 'network',
          address: job.address,
          port: job.port,
        }
      });

      setLocalServerAvailable(true);
      setJobsProcessed(prev => prev + 1);
      setLastJobTime(new Date().toISOString());
      toast.success(`✅ Ticket imprimé: ${job.ticketData?.ticketNumber || 'N/A'}`);
      console.log('✅ Job imprimé:', job.id);
    } catch (error) {
      console.error('❌ Erreur impression job:', error);
      const isNetworkError = !error.response || error.code === 'ERR_NETWORK' || error.message === 'Network Error';
      if (isNetworkError) {
        setLocalServerAvailable(false);
        toast.error('❌ Serveur local introuvable. Lancez "npm run local" sur cette machine puis réessayez.', { duration: 6000 });
      } else {
        toast.error(`❌ Échec impression: ${error.response?.data?.message || error.message}`);
      }
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
    localServerAvailable,
    checkLocalServer,
  };

  return <PrintAgentContext.Provider value={value}>{children}</PrintAgentContext.Provider>;
}

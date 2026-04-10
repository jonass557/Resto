import { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

function getLocalServerUrl() {
  return localStorage.getItem('localPrintServerUrl') || 'http://localhost:5000';
}

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
      await axios.get(`${getLocalServerUrl()}/api/health`, { timeout: 3000 });
      setLocalServerAvailable(true);
      return true;
    } catch {
      try {
        // Fallback : tenter n'importe quelle route connue
        await axios.get(`${getLocalServerUrl()}/api/printer/status`, {
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
        socket.emit('unregister-print-agent');
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || window.location.origin;
    const newSocket = io(API_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    // Ensemble de déduplication : éviter d'imprimer le même job 2 fois
    const processedJobIds = new Set();

    newSocket.on('connect', async () => {
      // S'enregistrer comme agent SEULEMENT si le serveur local est disponible sur cet appareil
      const available = await checkLocalServer();
      if (available) {
        newSocket.emit('register-print-agent');
        toast.success('🖨️ Agent d\'impression actif');
      } else {
        toast('Agent connecté — serveur local introuvable sur cet appareil', {
          icon: '⚠️',
          duration: 5000,
        });
      }
    });

    newSocket.on('reconnect', async () => {
      const available = await checkLocalServer();
      if (available) newSocket.emit('register-print-agent');
    });

    newSocket.on('disconnect', () => {
      processedJobIds.clear();
    });

    newSocket.on('print-job', async (job) => {
      if (processedJobIds.has(job.id)) {
        console.log('🔁 Job déjà traité, ignoré:', job.id);
        return;
      }
      processedJobIds.add(job.id);
      setTimeout(() => processedJobIds.delete(job.id), 300000);
      console.log('📥 Job d\'impression reçu:', job.id);
      await handlePrintJob(job);
    });

    // Facture supprimée : l'admin a supprimé → le cloud délègue l'impression à l'agent local
    newSocket.on('ticket:deleted-print', async ({ ticketData }) => {
      if (!ticketData?.ticketNumber) return;
      const jobId = `deleted-${ticketData.ticketNumber}`;
      if (processedJobIds.has(jobId)) return;
      processedJobIds.add(jobId);
      setTimeout(() => processedJobIds.delete(jobId), 300000);

      console.log('🗑️ Impression facture supprimée:', ticketData.ticketNumber);
      const token = localStorage.getItem('token');
      const localApi = axios.create({
        baseURL: `${getLocalServerUrl()}/api`,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        timeout: 15000,
      });
      try {
        await localApi.post('/printer/print-ticket', { ticketData });
        setJobsProcessed(prev => prev + 1);
        setLastJobTime(new Date().toISOString());
        toast.success(`✅ Facture supprimée imprimée: ${ticketData.ticketNumber}`);
      } catch (error) {
        console.error('❌ Erreur impression facture supprimée:', error);
        const isNetworkError = !error.response || error.code === 'ERR_NETWORK' || error.message === 'Network Error';
        if (isNetworkError) {
          setLocalServerAvailable(false);
          toast.error('❌ Serveur local introuvable. Vérifiez la connexion dans Paramètres.', { duration: 6000 });
        } else {
          toast.error(`❌ Impression: ${error.response?.data?.message || error.message}`);
        }
      }
    });

    // Impression du rapport global déclenchée depuis le cloud (même schéma que ticket:auto-print)
    newSocket.on('report:print', async ({ date, service }) => {
      const jobId = `report-${date}-${service}`;
      if (processedJobIds.has(jobId)) return;
      processedJobIds.add(jobId);
      setTimeout(() => processedJobIds.delete(jobId), 300000);

      console.log('📊 Impression rapport global reçue:', date, service);
      const token = localStorage.getItem('token');
      const localApi = axios.create({
        baseURL: `${getLocalServerUrl()}/api`,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        timeout: 20000,
      });
      try {
        await localApi.post('/printer/print-global-report', { date, service });
        setJobsProcessed(prev => prev + 1);
        setLastJobTime(new Date().toISOString());
        toast.success('✅ Rapport global imprimé');
      } catch (error) {
        console.error('❌ Erreur impression rapport global:', error);
        const isNetworkError = !error.response || error.code === 'ERR_NETWORK' || error.message === 'Network Error';
        if (isNetworkError) {
          setLocalServerAvailable(false);
          toast.error('❌ Serveur local introuvable. Vérifiez la connexion dans Paramètres.', { duration: 6000 });
        } else {
          toast.error(`❌ Rapport: ${error.response?.data?.message || error.message}`);
        }
      }
    });

    // Impression automatique déclenchée par le serveur lors de la création d'une commande
    newSocket.on('ticket:auto-print', async ({ ticket }) => {
      if (!ticket?._id) return;
      const jobId = `auto-${ticket._id}`;
      if (processedJobIds.has(jobId)) return;
      processedJobIds.add(jobId);
      setTimeout(() => processedJobIds.delete(jobId), 300000);

      console.log('�️ Auto-print ticket:', ticket.ticketNumber);
      const token = localStorage.getItem('token');
      const localApi = axios.create({
        baseURL: `${getLocalServerUrl()}/api`,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        timeout: 10000,
      });
      try {
        await localApi.post('/printer/print-ticket', { ticketId: ticket._id });
        setJobsProcessed(prev => prev + 1);
        setLastJobTime(new Date().toISOString());
        toast.success(`✅ Ticket ${ticket.ticketNumber} imprimé`);
      } catch (error) {
        console.error('❌ Auto-print error:', error);
        const isNetwork = !error.response || error.code === 'ERR_NETWORK' || error.message === 'Network Error';
        if (isNetwork) {
          setLocalServerAvailable(false);
          toast.error('❌ Serveur local introuvable — impression annulée', { duration: 5000 });
        }
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('unregister-print-agent');
      newSocket.disconnect();
    };
  }, [isAgentActive]);

  const handlePrintJob = async (job) => {
    const token = localStorage.getItem('token');
    const localApi = axios.create({
      baseURL: `${getLocalServerUrl()}/api`,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      timeout: 15000,
    });

    try {
      // Si le job contient ticketData → imprimer un ticket normal
      // Si le job contient seulement receiptBuffer → envoyer le buffer brut (rapport global, etc.)
      if (job.ticketData) {
        await localApi.post('/printer/print-ticket', {
          ticketData: job.ticketData,
          printerConfig: { type: 'network', address: job.address, port: job.port }
        });
        toast.success(`✅ Ticket imprimé: ${job.ticketData?.ticketNumber || 'N/A'}`);
      } else if (job.receiptBuffer) {
        await localApi.post('/printer/print-raw', {
          receiptBuffer: job.receiptBuffer,
          printerConfig: { type: 'network', address: job.address, port: job.port }
        });
        toast.success('✅ Rapport imprimé');
      } else {
        console.warn('⚠️ Job sans ticketData ni receiptBuffer, ignoré:', job.id);
        return;
      }

      setLocalServerAvailable(true);
      setJobsProcessed(prev => prev + 1);
      setLastJobTime(new Date().toISOString());
      console.log('✅ Job imprimé:', job.id);
    } catch (error) {
      console.error('❌ Erreur impression job:', error);
      const isNetworkError = !error.response || error.code === 'ERR_NETWORK' || error.message === 'Network Error';
      if (isNetworkError) {
        setLocalServerAvailable(false);
        toast.error('❌ Serveur local introuvable. Vérifiez la connexion dans Paramètres.', { duration: 6000 });
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

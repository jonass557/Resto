import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { settingsAPI, printerAPI, ticketsAPI } from '@/services/api';
import toast from 'react-hot-toast';

const PrinterContext = createContext(null);

// Common Bluetooth printer service/characteristic UUIDs
const BT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];
const BT_CHARACTERISTICS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  '0000ffe1-0000-1000-8000-00805f9b34fb',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
];

// Build ESC/POS receipt buffer (client-side, for Bluetooth direct print)
function buildReceipt(data, cols = 32) {
  const ESC = '\x1B';
  const GS = '\x1D';
  const c = [];

  c.push(`${ESC}@`); // init
  c.push(`${ESC}a\x01${ESC}E\x01${GS}!\x11`); // center + bold + double
  c.push(`${data.restaurantName || 'Restaurant'}\n`);
  c.push(`${GS}!\x00${ESC}E\x00`); // normal

  if (data.address) c.push(`${data.address}\n`);
  if (data.phone) c.push(`Tel: ${data.phone}\n`);
  c.push('-'.repeat(cols) + '\n');

  c.push(`${ESC}a\x00`); // left
  c.push(`Ticket: ${data.ticketNumber}\n`);
  if (data.orderType === 'dine_in' && data.tableName) c.push(`Table: ${data.tableName}\n`);
  else if (data.orderType === 'delivery') {
    c.push(`Livraison: ${data.deliveryClient || ''}\n`);
    if (data.deliveryAddress) c.push(`Adresse: ${data.deliveryAddress}\n`);
  } else if (data.orderType === 'takeaway') c.push(`A emporter\n`);
  c.push(`Serveur: ${data.agentName || ''}\n`);
  c.push(`Date: ${new Date().toLocaleString('fr-FR')}\n`);
  c.push('-'.repeat(cols) + '\n');

  for (const item of data.items || []) {
    const qty = `${item.quantity}x ${item.name}`;
    const price = `${item.totalPrice} ${data.currency || 'FCFA'}`;
    const sp = cols - qty.length - price.length;
    c.push(sp > 0 ? qty + ' '.repeat(sp) + price + '\n' : qty + '\n' + ' '.repeat(Math.max(0, cols - price.length)) + price + '\n');
  }

  c.push('-'.repeat(cols) + '\n');
  const line = (l, v) => {
    const vs = `${v} ${data.currency || 'FCFA'}`;
    const sp = cols - l.length - vs.length;
    c.push(l + (sp > 0 ? ' '.repeat(sp) : ' ') + vs + '\n');
  };
  line('Sous-total', data.subtotal);
  if (data.taxAmount > 0) line('TVA', data.taxAmount);
  if (data.discount > 0) line('Remise', `-${data.discount}`);
  c.push('='.repeat(cols) + '\n');
  c.push(`${ESC}E\x01`);
  line('TOTAL', data.total);
  c.push(`${ESC}E\x00`);
  c.push('='.repeat(cols) + '\n');

  if (data.paymentMethod) c.push(`Paiement: ${data.paymentMethod}\n`);

  if (data.orangeMoneyCode || data.mtnMomoCode) {
    c.push(`\n${ESC}a\x01${ESC}E\x01--- PAIEMENT MOBILE ---\n${ESC}E\x00`);
    if (data.orangeMoneyCode) {
      c.push(`Orange Money: ${data.orangeMoneyCode}\n`);
      if (data.orangeMoneyName) c.push(`Nom: ${data.orangeMoneyName}\n`);
    }
    if (data.mtnMomoCode) {
      c.push(`MTN MoMo: ${data.mtnMomoCode}\n`);
      if (data.mtnMomoName) c.push(`Nom: ${data.mtnMomoName}\n`);
    }
    c.push(`${ESC}a\x00`);
  }

  c.push(`\n${ESC}a\x01${data.footer || 'Merci de votre visite!'}\n\n\n\n`);
  c.push(`${GS}V\x00`); // cut

  const str = c.join('');
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i) & 0xFF;
  return buf;
}

// Send data in chunks (BLE has MTU limits, typically 20-512 bytes)
async function writeInChunks(characteristic, data, chunkSize = 100) {
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, offset + chunkSize);
    await characteristic.writeValueWithoutResponse(chunk);
  }
}

export function PrinterProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [device, setDevice] = useState(null);
  const [characteristic, setCharacteristic] = useState(null);
  const [btConnected, setBtConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [restaurantInfo, setRestaurantInfo] = useState(null);

  // Load restaurant info for receipts (only when authenticated)
  useEffect(() => {
    if (!isAuthenticated) return;
    settingsAPI.get().then(res => {
      const s = res.data.data;
      if (s) {
        const mmc = s.mobileMoneyConfig || {};
        setRestaurantInfo({
          restaurantName: s.restaurantName,
          address: s.address,
          phone: s.phone,
          currency: s.currencySymbol || 'FCFA',
          footer: s.receiptFooter || 'Merci de votre visite!',
          orangeMoneyCode: mmc.orangeMoneyEnabled ? mmc.orangeMoneyCode : null,
          orangeMoneyName: mmc.orangeMoneyEnabled ? mmc.orangeMoneyName : null,
          mtnMomoCode: mmc.mtnMomoEnabled ? mmc.mtnMomoCode : null,
          mtnMomoName: mmc.mtnMomoEnabled ? mmc.mtnMomoName : null,
        });
      }
    }).catch(() => {});
  }, [isAuthenticated]);

  // Try to find the right characteristic from a device
  const findCharacteristic = async (server) => {
    for (const svcUuid of BT_SERVICES) {
      try {
        const service = await server.getPrimaryService(svcUuid);
        for (const charUuid of BT_CHARACTERISTICS) {
          try {
            const ch = await service.getCharacteristic(charUuid);
            return ch;
          } catch { /* try next */ }
        }
        // If specific chars not found, get all and pick writable one
        const chars = await service.getCharacteristics();
        for (const ch of chars) {
          if (ch.properties.writeWithoutResponse || ch.properties.write) return ch;
        }
      } catch { /* try next service */ }
    }
    return null;
  };

  // Connect to a Bluetooth printer
  const connectBluetooth = useCallback(async () => {
    if (!navigator.bluetooth) {
      toast.error('Bluetooth non supporté par ce navigateur');
      return false;
    }
    setConnecting(true);
    try {
      // Use acceptAllDevices so all BT printers appear (most ESC/POS printers
      // don't advertise the specific service UUIDs in their advertisement data).
      // optionalServices grants access once connected.
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BT_SERVICES,
      });

      if (!dev) { setConnecting(false); return false; }

      dev.addEventListener('gattserverdisconnected', () => {
        setBtConnected(false);
        setCharacteristic(null);
        toast.error('Imprimante Bluetooth déconnectée');
      });

      const server = await dev.gatt.connect();
      const ch = await findCharacteristic(server);

      if (!ch) {
        toast.error('Impossible de trouver le service d\'impression sur cet appareil');
        dev.gatt.disconnect();
        setConnecting(false);
        return false;
      }

      setDevice(dev);
      setCharacteristic(ch);
      setBtConnected(true);
      localStorage.setItem('bt_printer_name', dev.name || 'Imprimante BT');
      toast.success(`Imprimante "${dev.name || 'BT'}" connectée`);
      setConnecting(false);
      return true;
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        toast.error('Erreur Bluetooth: ' + (err.message || 'Inconnu'));
      }
      setConnecting(false);
      return false;
    }
  }, []);

  // Disconnect
  const disconnectBluetooth = useCallback(() => {
    if (device?.gatt?.connected) device.gatt.disconnect();
    setDevice(null);
    setCharacteristic(null);
    setBtConnected(false);
    localStorage.removeItem('bt_printer_name');
    toast.success('Imprimante déconnectée');
  }, [device]);

  // Print ticket data via Bluetooth
  const printViaBluetooth = useCallback(async (ticketData) => {
    if (!characteristic || !btConnected) return false;
    try {
      const merged = { ...restaurantInfo, ...ticketData };
      const receipt = buildReceipt(merged);
      await writeInChunks(characteristic, receipt);
      return true;
    } catch (err) {
      console.error('BT print error:', err);
      return false;
    }
  }, [characteristic, btConnected, restaurantInfo]);

  // Smart print: tries Bluetooth first, then backend, then browser fallback
  const printTicket = useCallback(async (ticketData) => {
    // 1. Try Bluetooth direct
    if (btConnected && characteristic) {
      const ok = await printViaBluetooth(ticketData);
      if (ok) {
        toast.success('Ticket imprimé via Bluetooth');
        return true;
      }
      toast.error('Erreur Bluetooth, impression navigateur...');
    }

    // 2. Try backend printer (network/USB)
    try {
      const { data } = await printerAPI.printTicket({ ticketData });
      if (data.data?.printed) {
        toast.success('Ticket imprimé');
        return true;
      }
      if (data.data?.queued) {
        toast.success('🖨️ Ticket envoyé à l\'impression');
        return true;
      }
      // Backend returned fallback data - use browser print
    } catch { /* backend printer failed */ }

    // 3. Browser print fallback
    browserPrint(ticketData);
    return false;
  }, [btConnected, characteristic, printViaBluetooth]);

  // Print ticket by ID (fetches data from backend, then prints)
  const printTicketById = useCallback(async (ticketId) => {
    // If Bluetooth is connected, get ticket data from backend and print locally
    if (btConnected && characteristic) {
      try {
        const { data } = await ticketsAPI.getById(ticketId);
        const ticket = data.data;
        const ticketData = {
          ticketNumber: ticket.ticketNumber,
          type: ticket.type,
          orderType: ticket.orderType,
          tableName: ticket.table ? `${ticket.table.number}${ticket.table.name ? ' - ' + ticket.table.name : ''}` : null,
          agentName: ticket.agent ? `${ticket.agent.firstName} ${ticket.agent.lastName}` : '',
          items: ticket.items || [],
          subtotal: ticket.subtotal,
          taxAmount: ticket.taxAmount,
          discount: ticket.discount,
          total: ticket.total,
          isPaid: ticket.isPaid,
          paymentMethod: ticket.payment?.method || null,
        };
        const ok = await printViaBluetooth(ticketData);
        if (ok) { toast.success('Ticket imprimé via Bluetooth'); return true; }
      } catch { /* fall through */ }
    }

    // Fallback: send to backend printer
    try {
      const { data } = await printerAPI.printTicket({ ticketId });
      if (data.data?.printed) { toast.success('Ticket imprimé'); return true; }
      if (data.data?.queued) { toast.success('🖨️ Ticket envoyé à l\'impression'); return true; }
    } catch { /* fall through */ }

    return false;
  }, [btConnected, characteristic, printViaBluetooth]);

  return (
    <PrinterContext.Provider value={{
      btConnected, connecting, device,
      connectBluetooth, disconnectBluetooth,
      printTicket, printTicketById, printViaBluetooth,
      printerName: device?.name || localStorage.getItem('bt_printer_name') || null,
    }}>
      {children}
    </PrinterContext.Provider>
  );
}

// Browser print fallback — opens a styled print window
function browserPrint(data) {
  const w = window.open('', '_blank', 'width=300,height=600');
  if (!w) return;
  const items = (data.items || []).map(i =>
    `<tr><td>${i.quantity}x ${i.name}</td><td style="text-align:right">${i.totalPrice} ${data.currency || 'FCFA'}</td></tr>`
  ).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>Ticket</title>
    <style>body{font-family:monospace;font-size:12px;width:280px;margin:0 auto;padding:10px}
    h2{text-align:center;margin:0}p{margin:2px 0;font-size:11px}
    table{width:100%;border-collapse:collapse}td{padding:2px 0;font-size:11px}
    .sep{border-top:1px dashed #000;margin:6px 0}.total{font-weight:bold;font-size:13px}
    .center{text-align:center}</style></head><body>
    <h2>${data.restaurantName || 'Restaurant'}</h2>
    <p class="center">${data.address || ''}</p>
    <p class="center">${data.phone ? 'Tel: ' + data.phone : ''}</p>
    <div class="sep"></div>
    <p>Ticket: ${data.ticketNumber || ''}</p>
    ${data.tableName ? `<p>Table: ${data.tableName}</p>` : ''}
    <p>Serveur: ${data.agentName || ''}</p>
    <p>Date: ${new Date().toLocaleString('fr-FR')}</p>
    <div class="sep"></div>
    <table>${items}</table>
    <div class="sep"></div>
    <table><tr class="total"><td>TOTAL</td><td style="text-align:right">${data.total} ${data.currency || 'FCFA'}</td></tr></table>
    <div class="sep"></div>
    <p class="center">${data.footer || 'Merci de votre visite!'}</p>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
  setTimeout(() => w.close(), 1000);
}

export const usePrinter = () => {
  const context = useContext(PrinterContext);
  if (!context) throw new Error('usePrinter must be used within PrinterProvider');
  return context;
};

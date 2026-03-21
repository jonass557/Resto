import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount, currency = 'FCFA') {
  return `${new Intl.NumberFormat('fr-FR').format(amount)} ${currency}`
}

export function formatDate(date, options = {}) {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options
  })
}

export function formatDateTime(date) {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function getStatusColor(status) {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    preparing: 'bg-orange-100 text-orange-800',
    ready: 'bg-green-100 text-green-800',
    served: 'bg-purple-100 text-purple-800',
    paid: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-red-100 text-red-800',
    available: 'bg-green-100 text-green-800',
    occupied: 'bg-red-100 text-red-800',
    reserved: 'bg-blue-100 text-blue-800',
    cleaning: 'bg-yellow-100 text-yellow-800',
    open: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800',
    completed: 'bg-green-100 text-green-800',
    refunded: 'bg-red-100 text-red-800'
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

export function getStatusLabel(status) {
  const labels = {
    pending: 'En attente',
    in_progress: 'En cours',
    preparing: 'En préparation',
    ready: 'Prêt',
    served: 'Servi',
    paid: 'Payé',
    cancelled: 'Annulé',
    available: 'Disponible',
    occupied: 'Occupée',
    reserved: 'Réservée',
    cleaning: 'Nettoyage',
    open: 'Ouverte',
    closed: 'Fermée',
    completed: 'Complété',
    refunded: 'Remboursé'
  }
  return labels[status] || status
}

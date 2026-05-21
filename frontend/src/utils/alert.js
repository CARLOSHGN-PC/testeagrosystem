import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { addNotification } from '../services/notificationService';

const MySwal = withReactContent(Swal);

let lastAlertFingerprint = '';
let lastAlertAt = 0;
const ALERT_DEDUP_MS = 1800;

const shouldSkipDuplicateAlert = (kind, title, text) => {
  const now = Date.now();
  const fingerprint = `${kind}::${title || ''}::${text || ''}`;
  if (fingerprint === lastAlertFingerprint && now - lastAlertAt < ALERT_DEDUP_MS) {
    return true;
  }
  lastAlertFingerprint = fingerprint;
  lastAlertAt = now;
  return false;
};

// Core styling matching AgroSystem Modern
const palette = {
  bg: "#111a2d", // Matching the modals
  gold: "#D4AF37",
  goldLight: "#E6C76B",
  white: "#FFFFFF",
  text2: "#B0BEC5",
  danger: "#f87171",
  success: "#4ade80",
};

export const agroAlert = MySwal.mixin({
  background: palette.bg,
  color: palette.white,
  confirmButtonColor: palette.gold,
  cancelButtonColor: 'rgba(255,255,255,0.06)',
  customClass: {
    container: 'z-[20000]',
    popup: 'rounded-[26px] border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.28)]',
    title: 'text-[22px] font-semibold text-white',
    htmlContainer: 'text-sm text-[#B0BEC5] mt-1',
    confirmButton: 'rounded-xl px-6 py-3 font-semibold transition-transform hover:scale-[1.02] bg-gradient-to-br from-[#f59e0b] to-[#f97316] text-white',
    cancelButton: 'rounded-xl px-6 py-3 font-semibold border border-white/10 hover:bg-white/5 transition-colors text-white',
    actions: 'flex gap-3 px-5 pb-5 justify-end',
  },
  buttonsStyling: false,
});

export const showSuccess = (title, text) => {
  if (shouldSkipDuplicateAlert('success', title, text)) {
    return Promise.resolve({ isDismissed: true, isDuplicate: true });
  }

  // Salva silenciosamente a notificação no painel do sino
  addNotification(title, text, 'success');

  if (Swal.isVisible()) {
    Swal.close();
  }

  return agroAlert.fire({
    icon: 'success',
    title,
    text,
    iconColor: palette.success,
  });
};

export const showError = (title, text) => {
  if (shouldSkipDuplicateAlert('error', title, text)) {
    return Promise.resolve({ isDismissed: true, isDuplicate: true });
  }

  // Salva silenciosamente o erro no painel do sino para referência futura
  addNotification(title, text, 'error');

  if (Swal.isVisible()) {
    Swal.close();
  }

  return agroAlert.fire({
    icon: 'error',
    title,
    text,
    iconColor: palette.danger,
  });
};

export const showConfirm = (title, text, confirmText = 'Confirmar', cancelText = 'Cancelar') => {
  return agroAlert.fire({
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    iconColor: palette.gold,
  });
};

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AgroSystemModernUI from "./AgroSystemModernUI";
import { registerSW } from "virtual:pwa-register";
import Swal from "sweetalert2";
import { palette } from "./constants/theme";
import { clearAppCaches, fetchServerAppVersion } from "./utils/appVersion";

const APP_BUILD_VERSION = typeof __APP_BUILD_VERSION__ !== "undefined" ? __APP_BUILD_VERSION__ : "dev";
const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let isUpdatingApp = false;

async function forceAppUpdate(message = "Nova versão detectada. Atualizando o sistema...") {
  if (isUpdatingApp) return;
  isUpdatingApp = true;

  try {
    await Swal.fire({
      title: "Atualizando sistema",
      text: message,
      icon: "info",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      timer: 1800,
      timerProgressBar: true,
      background: palette.bg,
      color: palette.white,
    });
  } catch (error) {
    console.warn("Não foi possível exibir aviso de atualização:", error);
  }

  try {
    await clearAppCaches({ preserveMapCaches: true });
  } catch (error) {
    console.warn("Falha ao limpar cache antigo automaticamente:", error);
  }

  window.location.reload();
}

async function checkForNewAppVersion() {
  if (!import.meta.env.PROD || isUpdatingApp) return;

  try {
    const data = await fetchServerAppVersion();
    const latestVersion = data?.version;

    if (latestVersion && latestVersion !== APP_BUILD_VERSION) {
      await forceAppUpdate("Nova versão encontrada. Recarregando automaticamente...");
    }
  } catch (error) {
    console.warn("Erro ao verificar nova versão do sistema:", error);
  }
}

function requestPersistentStorageWhenIdle() {
  if (!navigator.storage?.persist) return;

  const request = () => {
    navigator.storage.persist().then((persistent) => {
      if (persistent) {
        console.info("Armazenamento persistente concedido pelo navegador.");
      } else {
        console.info("Armazenamento persistente ainda não foi concedido pelo navegador. O cache offline continua funcionando em modo best-effort.");
      }
    }).catch((error) => {
      console.info("Não foi possível solicitar armazenamento persistente agora:", error);
    });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(request, { timeout: 3000 });
  } else {
    window.setTimeout(request, 1500);
  }
}

requestPersistentStorageWhenIdle();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      forceAppUpdate("Nova versão do AgroSystem disponível. Atualizando automaticamente...");
    },
    onOfflineReady() {
      console.log("App pronto para uso offline.");
    },
    onRegisteredSW() {
      checkForNewAppVersion();
      window.setInterval(checkForNewAppVersion, VERSION_CHECK_INTERVAL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          checkForNewAppVersion();
        }
      });
      window.addEventListener("focus", checkForNewAppVersion);
    },
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AgroSystemModernUI />
  </React.StrictMode>
);

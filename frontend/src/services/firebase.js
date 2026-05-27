import { initializeApp, getApp, getApps } from "firebase/app";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyBvCk2kOBofW1xGoRj4xh3uRbAy99qECwk",
  authDomain: "agrosystem-e484e.firebaseapp.com",
  projectId: "agrosystem-e484e",
  storageBucket: "agrosystem-e484e.firebasestorage.app",
  messagingSenderId: "281017108690",
  appId: "1:281017108690:web:77cb5a191813810895850b",
  measurementId: "G-3HNZHBKN1K"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Única dependência Firebase mantida no frontend: Storage dos mapas/arquivos.
export const storage = getStorage(app);
export { app };

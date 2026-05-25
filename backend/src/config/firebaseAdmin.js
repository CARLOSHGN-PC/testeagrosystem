import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

if (!admin.apps.length) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } catch (error) {
      console.error('Erro ao carregar GOOGLE_APPLICATION_CREDENTIALS:', error);
      admin.initializeApp();
    }
  } else {
    admin.initializeApp();
  }
}

// Único uso Firebase mantido no backend: Storage dos mapas/arquivos.
export const firebaseStorage = admin.storage();

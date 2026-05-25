import db from './localDb';

/**
 * notificationService.js
 *
 * O que este bloco faz:
 * Gerencia as operações de CRUD para as notificações persistentes do sistema.
 *
 * Por que ele existe:
 * Para centralizar a lógica de criação e leitura das notificações salvas
 * no IndexedDB (Dexie), permitindo que qualquer parte do app registre um evento
 * e a Navbar as leia sem acoplar regras de banco de dados nos componentes de UI.
 */

/**
 * Adiciona uma nova notificação ao banco de dados local.
 *
 * @param {string} title - O título da notificação.
 * @param {string} text - O corpo descritivo da notificação.
 * @param {string} type - O tipo/categoria (ex: 'success', 'error', 'info', 'warning').
 * @returns {Promise<number>} O ID da notificação inserida no Dexie.
 */
export async function addNotification(title, text, type = 'info') {
  try {
    const newId = await db.notifications.add({
      title,
      text,
      type,
      isRead: 0, // 0 = false, 1 = true. Usando numérico pois Dexie indexa melhor.
      createdAt: new Date().getTime(),
    });
    return newId;
  } catch (error) {
    console.error("Falha ao salvar notificação localmente:", error);
    return null;
  }
}

/**
 * Retorna todas as notificações ordenadas da mais recente para a mais antiga.
 *
 * @returns {Promise<Array>} Array de objetos de notificação.
 */
export async function getNotifications() {
  try {
    const list = await db.notifications.orderBy('createdAt').reverse().toArray();
    return list;
  } catch (error) {
    console.error("Falha ao recuperar notificações:", error);
    return [];
  }
}

/**
 * Marca todas as notificações não lidas como lidas.
 *
 * @returns {Promise<number>} Número de registros modificados.
 */
export async function markAllAsRead() {
  try {
    return await db.notifications.where('isRead').equals(0).modify({ isRead: 1 });
  } catch (error) {
    console.error("Falha ao marcar notificações como lidas:", error);
    return 0;
  }
}

/**
 * Limpa todo o histórico de notificações do banco.
 *
 * @returns {Promise<void>}
 */
export async function clearAllNotifications() {
  try {
    await db.notifications.clear();
  } catch (error) {
    console.error("Falha ao limpar histórico de notificações:", error);
  }
}

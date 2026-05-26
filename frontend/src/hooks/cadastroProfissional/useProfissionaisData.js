import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../../services/localDb";
import { showSuccess, showError } from "../../utils/alert";
import { v4 as uuidv4 } from "uuid";
import { listCadastro, saveCadastro, inactivateCadastro } from "../../services/cadastros_mestres/cadastrosPostgresService";

export function useProfissionaisData(companyId) {
  useEffect(() => {
    if (!companyId) return;
    listCadastro('professionals', companyId, { limit: 1000 }).catch((error) => {
      console.warn('[Profissionais] cache Dexie:', error.message);
    });
  }, [companyId]);

  const profissionais = useLiveQuery(
    () => {
      if (!companyId) return [];
      return db.profissionais
        .where("companyId")
        .equals(companyId)
        .reverse()
        .sortBy("updatedAt");
    },
    [companyId],
    []
  );

  const checkDuplicates = async (matricula, cpf, excludeId) => {
    const list = await db.profissionais.where({ companyId }).toArray();
    const others = list.filter(p => p.id !== excludeId);
    const matriculaExists = matricula && others.some(p => p.matricula === matricula);
    const cpfExists = cpf && others.some(p => p.cpf === cpf);
    if (matriculaExists) throw new Error("A matrícula informada já está cadastrada.");
    if (cpfExists) throw new Error("O CPF informado já está cadastrado.");
  };

  const saveProfissional = async (formData) => {
    try {
      await checkDuplicates(formData.matricula, formData.cpf, formData.id);
      const now = new Date().toISOString();
      const uuid = formData.uuid || formData.id || uuidv4();
      const payload = {
        ...formData,
        id: formData.id || uuid,
        uuid,
        companyId,
        status: formData.status || 'ativo',
        syncStatus: 'synced',
        createdAt: formData.createdAt || now,
        updatedAt: now,
      };

      const saved = await saveCadastro('professionals', payload);
      await db.profissionais.put(saved || payload);
      showSuccess("Profissional salvo no PostgreSQL.");
      return true;
    } catch (error) {
      console.error("[useProfissionaisData] Erro ao salvar:", error);
      showError("Não foi possível salvar", error.message || "Erro desconhecido");
      return false;
    }
  };

  const toggleStatus = async (profissional) => {
    try {
      const novoStatus = profissional.status === "ativo" ? "inativo" : "ativo";
      let saved;
      if (novoStatus === 'inativo') {
        saved = await inactivateCadastro('professionals', profissional.id, companyId);
      } else {
        saved = await saveCadastro('professionals', { ...profissional, status: novoStatus, companyId });
      }
      await db.profissionais.put(saved || { ...profissional, status: novoStatus, updatedAt: new Date().toISOString(), syncStatus: 'synced' });
      return true;
    } catch (error) {
      console.error("[useProfissionaisData] Erro ao alternar status:", error);
      showError("Erro", "Não foi possível alterar o status do profissional.");
      return false;
    }
  };

  return { profissionais, saveProfissional, toggleStatus };
}

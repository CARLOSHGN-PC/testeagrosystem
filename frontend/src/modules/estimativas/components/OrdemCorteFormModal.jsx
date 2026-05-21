import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { palette } from '../../../constants/theme';
import { Layers } from 'lucide-react';
import db from '../../../services/localDb';
import { apiRequest } from '../../../services/apiClient';

export const OrdemCorteFormModal = ({ isOpen, onClose, onConfirm, talhoesCount, companyId }) => {
  const [frenteServico, setFrenteServico] = useState('');
  const [tipoCana, setTipoCana] = useState('Crua');
  const [tipoColheita, setTipoColheita] = useState('Mecanizada');
  const [matricula, setMatricula] = useState('');
  const [nomeColaborador, setNomeColaborador] = useState('');
  const [isSearchingMatricula, setIsSearchingMatricula] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFrenteServico('');
      setTipoCana('Crua');
      setTipoColheita('Mecanizada');
      setMatricula('');
      setNomeColaborador('');
    }
  }, [isOpen]);

  const handleFrenteChange = (e) => {
    let val = e.target.value.toUpperCase();
    if (val.match(/^F\d+$/) || val.match(/^FRENTE\s?\d+$/)) {
      const num = val.replace(/\D/g, '');
      if (num) val = `FRENTE ${num}`;
    }
    setFrenteServico(val);
  };

  const normalizeCompanyIds = (value) => {
    const raw = String(value || '').trim();
    const aliases = new Set([raw]);

    if (raw === '002') aliases.add('usinacacu');
    if (raw === '001') aliases.add('agro-system');
    if (raw === 'usinacacu') aliases.add('002');
    if (raw === 'agro-system') aliases.add('001');

    return Array.from(aliases).filter(Boolean);
  };

  const findLocalProfessionalByMatricula = async (mat) => {
    const companyAliases = normalizeCompanyIds(companyId);

    return db.profissionais
      .where({ matricula: mat })
      .filter((p) => companyAliases.includes(String(p.companyId || '').trim()))
      .first();
  };

  const buscarColaborador = async (mat) => {
    /**
     * Busca o colaborador por matrícula usando PostgreSQL/JWT primeiro.
     * O Auth PostgreSQL/JWT/PostgreSQL não é mais usado no login, então essa consulta não pode ir ao PostgreSQL.
     */
    const matriculaLimpa = String(mat || '').trim();

    if (!matriculaLimpa) {
      setNomeColaborador('');
      return;
    }

    setIsSearchingMatricula(true);

    try {
      let profissional = null;

      if (navigator.onLine) {
        const payload = await apiRequest(
          `/api/postgres/cadastros/professionals?companyId=${encodeURIComponent(companyId || '')}&search=${encodeURIComponent(matriculaLimpa)}&limit=50`
        );

        const profissionais = Array.isArray(payload?.data) ? payload.data : [];

        profissional = profissionais.find((p) => String(p.matricula || p.registration || '').trim() === matriculaLimpa)
          || profissionais.find((p) => String(p.nomeCompleto || p.nome || p.name || '').toLowerCase().includes(matriculaLimpa.toLowerCase()))
          || null;

        if (profissional?.id) {
          await db.profissionais.put({
            ...profissional,
            companyId: companyId || profissional.companyId,
            matricula: String(profissional.matricula || profissional.registration || matriculaLimpa),
            nomeCompleto: profissional.nomeCompleto || profissional.nome || profissional.name || 'Nome Indisponível',
            syncStatus: 'synced',
          }).catch(() => {});
        }
      }

      if (!profissional) {
        profissional = await findLocalProfessionalByMatricula(matriculaLimpa);
      }

      if (profissional) {
        setNomeColaborador(profissional.nomeCompleto || profissional.nome || profissional.name || 'Nome Indisponível');
      } else {
        setNomeColaborador('Não encontrado');
      }
    } catch (err) {
      console.error('Erro ao buscar colaborador:', err);

      const profissionalLocal = await findLocalProfessionalByMatricula(matriculaLimpa).catch(() => null);
      if (profissionalLocal) {
        setNomeColaborador(profissionalLocal.nomeCompleto || profissionalLocal.nome || profissionalLocal.name || 'Encontrado Local');
      } else {
        setNomeColaborador('Erro na busca');
      }
    } finally {
      setIsSearchingMatricula(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      buscarColaborador(matricula);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [matricula, companyId]);

  const isValidMatricula = () => {
    /**
     * O que este bloco faz: Valida se a matrícula informada é válida e se o colaborador foi encontrado no banco.
     * Por que ele existe: Para evitar que o usuário abra uma ordem de corte sem uma matrícula de um colaborador que já exista.
     */
    if (!matricula) return false;
    if (isSearchingMatricula) return false;
    if (nomeColaborador === 'Não encontrado' || nomeColaborador === 'Erro na busca' || !nomeColaborador) return false;
    return true;
  };

  const handleSubmit = async () => {
     /**
      * O que este bloco faz: Emite a confirmação com os dados da Ordem de Corte apenas se a matrícula for válida.
      * Por que ele existe: É a ação principal para concluir o formulário da modal.
      */
     if (!isValidMatricula()) {
       return;
     }

     onConfirm({ frenteServico, tipoCana, tipoColheita, matricula, nomeColaborador });
  };

  // Renderiza apenas se estiver aberto
  if (!isOpen) return null;

  // Usamos createPortal para garantir que a modal escape do contexto de empilhamento (stacking context)
  // causado pelo backdrop-filter e transforms nos componentes pais (como o EstimativaPanels).
  // Sem isso, a modal ficaria presa dentro da div pai, cortada pelo overflow.

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-5 bg-black/60 backdrop-blur-md" style={{ position: 'fixed' }}>
        <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          className="w-full max-w-[500px] max-h-[90vh] flex flex-col rounded-[26px] overflow-hidden border shadow-[0_10px_30px_rgba(0,0,0,0.28)]"
          style={{ background: "#111a2d", borderColor: "rgba(255,255,255,0.12)" }}
        >
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
            <div>
              <h2 className="text-[22px] font-semibold text-white leading-tight">Abrir Ordem de Corte</h2>
              <p className="text-sm mt-1" style={{ color: palette.text2 }}>Preencha os dados para vincular {talhoesCount} talhão(ões).</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border px-3 py-2 transition-colors hover:bg-white/10 shrink-0 text-white"
              style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" }}
            >
              ✕
            </button>
          </div>

          <div className="p-5 flex flex-col gap-4 overflow-y-auto flex-1">
             <div className="flex flex-col gap-4">
                 <div className="flex flex-col gap-2">
                   <label className="text-xs" style={{ color: palette.text2 }}>Frente de Serviço</label>
                   <input
                     type="text"
                     value={frenteServico}
                     onChange={handleFrenteChange}
                     placeholder="Ex: FRENTE 1"
                     className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors text-white"
                     style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)" }}
                   />
                 </div>

                 <div className="flex flex-col gap-2">
                   <label className="text-xs" style={{ color: palette.text2 }}>Tipo de Cana</label>
                   <select
                     value={tipoCana}
                     onChange={(e) => setTipoCana(e.target.value)}
                     className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors text-white"
                     style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)" }}
                   >
                     <option value="Crua" style={{ color: "black" }}>Crua</option>
                     <option value="Queimada" style={{ color: "black" }}>Queimada</option>
                     <option value="Bisada" style={{ color: "black" }}>Bisada</option>
                   </select>
                 </div>

                 <div className="flex flex-col gap-2">
                   <label className="text-xs" style={{ color: palette.text2 }}>Tipo de Colheita</label>
                   <select
                     value={tipoColheita}
                     onChange={(e) => setTipoColheita(e.target.value)}
                     className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors text-white"
                     style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)" }}
                   >
                     <option value="Manual" style={{ color: "black" }}>Manual</option>
                     <option value="Mecanizada" style={{ color: "black" }}>Mecanizada</option>
                   </select>
                 </div>

                 <div className="flex flex-col gap-2">
                   <label className="text-xs" style={{ color: palette.text2 }}>Matrícula</label>
                   <input
                     type="text"
                     value={matricula}
                     onChange={(e) => setMatricula(e.target.value)}
                     placeholder="Matrícula"
                     className="w-full rounded-2xl border px-4 py-3 outline-none appearance-none focus:border-yellow-500 transition-colors text-white"
                     style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.12)" }}
                   />
                 </div>
             </div>

             {/* Feedback de nome abaixo da matrícula */}
             <div className="text-xs mt-[-8px] pl-1 flex items-center h-4" style={{ color: palette.text2 }}>
                {isSearchingMatricula ? "Buscando colaborador..." : (matricula ? `Colaborador: ${nomeColaborador}` : "")}
             </div>
             {nomeColaborador === 'Não encontrado' && (
               <div className="text-xs mt-[-8px] pl-1 text-red-400">
                 Matrícula não cadastrada no sistema. Fale com seu gestor.
               </div>
             )}
          </div>

          <div className="flex justify-end gap-3 px-5 py-4 border-t shrink-0" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
            <button
              onClick={onClose}
              className="rounded-xl border px-4 py-3 hover:bg-white/10 transition-colors text-white font-medium"
              style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!frenteServico || !isValidMatricula()}
              className="rounded-xl px-4 py-3 transition-transform hover:scale-[1.02] text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: `linear-gradient(135deg, ${palette.gold} 0%, ${palette.goldLight} 100%)`, color: palette.bg }}
            >
              Confirmar e Abrir
            </button>
          </div>
        </motion.div>
        </AnimatePresence>
      </div>
  );

  return createPortal(modalContent, document.body);
};

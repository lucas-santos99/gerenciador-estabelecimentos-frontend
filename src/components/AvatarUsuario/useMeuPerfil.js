import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../utils/api";
import { confirmar, avisar } from "../Dialogo/dialogo";

/** Perfil de quem está logado (nome, papel, e-mail, foto) + trocar/remover a própria foto. */
export default function useMeuPerfil() {
  const [perfil, setPerfil] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const resp = await apiFetch("/api/meu-perfil");
      if (resp.ok) setPerfil(await resp.json());
    } catch { /* sem perfil, a foto some e o resto segue */ }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const trocar = useCallback(async (arquivo) => {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) { avisar("Selecione um arquivo de imagem."); return; }
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("foto", arquivo);
      const resp = await apiFetch("/api/meu-perfil/foto", { method: "POST", body: fd });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || "Erro ao enviar a foto.");
      setPerfil(p => ({ ...p, foto_url: d.foto_url }));
    } catch (err) {
      avisar(err.message || "Erro ao enviar a foto.");
    } finally { setEnviando(false); }
  }, []);

  const remover = useCallback(async () => {
    if (!(await confirmar({ titulo: "Remover a sua foto?", perigo: true, botao: "Remover" }))) return;
    setEnviando(true);
    try {
      const resp = await apiFetch("/api/meu-perfil/foto", { method: "DELETE" });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || "Erro ao remover."); }
      setPerfil(p => ({ ...p, foto_url: null }));
    } catch (err) {
      avisar(err.message || "Erro ao remover a foto.");
    } finally { setEnviando(false); }
  }, []);

  return { perfil, enviando, trocar, remover };
}

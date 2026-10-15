import { apiFetch } from "./api";

/** Troca a logo do estabelecimento (o servidor otimiza e apaga a anterior). Devolve a nova URL. */
export async function enviarLogoEstabelecimento(estabelecimentoId, file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Formato inválido. Use PNG, JPG ou WEBP.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Arquivo muito grande. Tamanho máximo: 2MB.");
  const imagem_base64 = await new Promise((resolve, reject) => {
    const l = new FileReader();
    l.onload = () => resolve(l.result);
    l.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    l.readAsDataURL(file);
  });
  const resp = await apiFetch(`/api/estabelecimentos/dados/${estabelecimentoId}/logo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imagem_base64 }),
  });
  const r = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(r.error || "Erro ao salvar logo.");
  return `${r.logo_url}?t=${Date.now()}`;
}

// src/pages/Administrador/Notificacoes/NotificacoesAdmin.jsx
// Central de Notificações do SuperAdmin (licenças, pagamentos, solicitações,
// novos cadastros e lembretes). O estado vem do Provider montado no App.jsx.
import React from "react";
import LayoutAdmin from "../Painel/LayoutAdmin";
import CentralNotificacoes from "../../../components/Notificacoes/CentralNotificacoes";

export default function NotificacoesAdmin() {
  return (
    <LayoutAdmin>
      <div className="ntf-admin-pagina">
        <CentralNotificacoes />
      </div>
    </LayoutAdmin>
  );
}

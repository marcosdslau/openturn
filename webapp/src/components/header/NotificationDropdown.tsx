"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { apiGet, apiPatch } from "@/lib/api";
import { useParams } from "next/navigation";
import { CheckCircleIcon, CheckLineIcon, ErrorIcon, InfoIcon } from "@/icons";

type Notificacao = {
  NOTCodigo: number;
  INSInstituicaoCodigo: number;
  ckey: string;
  tipo: string;
  titulo: string;
  conteudo: string;
  origem: string;
  chaveOrigem: string;
  lido: boolean;
  createdAt: string;
  updatedAt: string;
};

type NotificacaoListResponse = {
  data: Notificacao[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

function parseCodigoInstituicao(raw: unknown): number | null {
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    const n = Number(raw[0]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins <= 0) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifying, setNotifying] = useState(true);
  const [items, setItems] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState<Record<number, boolean>>({});

  const params = useParams();
  const codigoInstituicao = useMemo(() => {
    const fromRoute = parseCodigoInstituicao((params as any)?.codigoInstituicao);
    if (fromRoute) return fromRoute;
    const fromLocalStorage =
      typeof window !== "undefined" ? localStorage.getItem("sg_last_inst") : null;
    return parseCodigoInstituicao(fromLocalStorage);
  }, [params]);

  function toggleDropdown() {
    setIsOpen((prev) => !prev);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  const load = async (opts?: { silent?: boolean }) => {
    if (!codigoInstituicao) return;
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const res = await apiGet<NotificacaoListResponse>(
        `/instituicao/${codigoInstituicao}/notificacoes?page=1&limit=10`,
      );
      setItems(Array.isArray(res?.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.message || "Falha ao carregar notificações.");
      setItems([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!codigoInstituicao) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoInstituicao]);

  useEffect(() => {
    const hasUnread = items.some((n) => !n.lido);
    setNotifying(hasUnread);
  }, [items]);

  const markAsRead = async (id: number) => {
    if (!codigoInstituicao) return;

    const alreadyRead = items.some((n) => n.NOTCodigo === id && n.lido);
    if (alreadyRead) return;

    setMarking((prev) => ({ ...prev, [id]: true }));
    setItems((prev) =>
      prev.map((n) => (n.NOTCodigo === id ? { ...n, lido: true } : n)),
    );
    try {
      await apiPatch(`/instituicao/${codigoInstituicao}/notificacoes/${id}/lido`, {});
    } catch (e: any) {
      setItems((prev) =>
        prev.map((n) => (n.NOTCodigo === id ? { ...n, lido: false } : n)),
      );
      setError(e?.message || "Falha ao marcar como lida.");
    } finally {
      setMarking((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleClick = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setNotifying(false);
        void load({ silent: true });
      }
      return next;
    });
  };

  const rows = useMemo(() => {
    return items.map((n) => {
      const tipo = (n.tipo || "").toLowerCase();
      if (tipo === "erro") {
        return {
          ...n,
          icon: <ErrorIcon className="block w-6 h-6" />,
          iconBg: "bg-error-50 text-error-500 dark:bg-error-500/10",
          tipoLabel: "Erro",
        };
      }
      if (tipo === "sucesso") {
        return {
          ...n,
          icon: <CheckCircleIcon className="block w-6 h-6" />,
          iconBg: "bg-success-50 text-success-500 dark:bg-success-500/10",
          tipoLabel: "Sucesso",
        };
      }
      return {
        ...n,
        icon: <InfoIcon className="block w-6 h-6" />,
        iconBg: "bg-blue-light-50 text-blue-light-500 dark:bg-blue-light-500/10",
        tipoLabel: "Info",
      };
    });
  }, [items]);

  return (
    <div className="relative">
      <button
        className="relative dropdown-toggle flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={handleClick}
      >
        <span
          className={`absolute right-0 top-0.5 z-10 h-2 w-2 rounded-full bg-orange-400 ${
            !notifying ? "hidden" : "flex"
          }`}
        >
          <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping"></span>
        </span>
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Notification
          </h5>
          <button
            onClick={toggleDropdown}
            className="text-gray-500 transition dropdown-toggle dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <svg
              className="fill-current"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
          {loading && (
            <li className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" />
            </li>
          )}

          {!loading && error && (
            <li className="px-4 py-6">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {error}
              </div>
              <button
                onClick={() => void load()}
                className="mt-3 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Tentar novamente
              </button>
            </li>
          )}

          {!loading && !error && rows.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhuma notificação.
            </li>
          )}

          {!loading &&
            !error &&
            rows.map((n) => (
              <li key={n.ckey || n.NOTCodigo}>
                <div className="flex items-start gap-3 rounded-lg border-b border-gray-100 p-3 px-4.5 py-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5">
                  <button
                    type="button"
                    onClick={closeDropdown}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${n.iconBg}`}
                    >
                      {n.icon}
                    </span>

                    <span className="block min-w-0 flex-1">
                      <span className="mb-1.5 block text-theme-sm text-gray-500 dark:text-gray-400">
                        <span className="font-medium text-gray-800 dark:text-white/90">
                          {n.titulo}
                        </span>
                        {!n.lido && (
                          <span className="ml-2 inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
                            Novo
                          </span>
                        )}
                      </span>

                      <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">
                        {n.conteudo}
                      </span>

                      <span className="mt-1 flex items-center gap-2 text-gray-500 text-theme-xs dark:text-gray-400">
                        <span>{n.tipoLabel}</span>
                        <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                        <span>{formatRelativeTime(n.updatedAt)}</span>
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label="Marcar como lida"
                    disabled={!!marking[n.NOTCodigo] || n.lido}
                    onClick={() => void markAsRead(n.NOTCodigo)}
                    className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white/90"
                  >
                    <CheckLineIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
        </ul>
      </Dropdown>
    </div>
  );
}

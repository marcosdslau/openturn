"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { apiGet } from "@/lib/api";

export default function RootRedirect() {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.push("/signin");
      return;
    }

    const redirect = async () => {
      let instId = user?.activeScope?.instituicaoId;
      if (!instId) {
        try {
          const list = await apiGet<{ data: any[] }>("/instituicoes?limit=1");
          if (list.data?.length > 0) {
            instId = list.data[0].INSCodigo;
          }
        } catch {
          // fallback
        }
      }
      router.push(instId ? `/instituicao/${instId}/dashboard` : "/signin");
    };

    redirect();
  }, [loading, isAuthenticated, user, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
    </div>
  );
}

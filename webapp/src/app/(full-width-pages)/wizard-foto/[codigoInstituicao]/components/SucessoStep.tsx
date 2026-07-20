"use client";

export default function SucessoStep() {
  return (
    <div className="flex flex-col items-center gap-6 text-center py-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/20">
        <span className="text-5xl">✅</span>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          Foto cadastrada com sucesso!
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Sua foto foi atualizada e já está disponível nos equipamentos de
          controle de acesso. Você pode fechar esta janela.
        </p>
      </div>

      <div className="rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/40 px-6 py-4 text-sm text-blue-700 dark:text-blue-400 max-w-xs">
        Se precisar atualizar a foto novamente, basta escanear o QR Code novamente.
      </div>
    </div>
  );
}

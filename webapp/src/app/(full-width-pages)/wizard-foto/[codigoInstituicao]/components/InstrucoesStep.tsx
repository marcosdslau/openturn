"use client";

interface InstrucoesStepProps {
  onNext: () => void;
}

const dicas = [
  {
    emoji: "☀️",
    titulo: "Boa iluminação",
    descricao:
      "Fique em um ambiente bem iluminado. Evite contraluz (janela atrás de você).",
  },
  {
    emoji: "👤",
    titulo: "Rosto centralizado",
    descricao:
      "Posicione o rosto dentro do guia oval na tela. Mantenha o celular na altura dos olhos.",
  },
  {
    emoji: "👓",
    titulo: "Sem óculos escuros",
    descricao:
      "Remova óculos escuros ou chapéus que cubram o rosto. Óculos de grau são permitidos.",
  },
  {
    emoji: "😐",
    titulo: "Expressão neutra",
    descricao:
      "Olhe diretamente para a câmera com expressão natural. Não sorria exageradamente.",
  },
];

export default function InstrucoesStep({ onNext }: InstrucoesStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          Antes de tirar a foto
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Siga as orientações abaixo para garantir um bom reconhecimento facial.
        </p>
      </div>

      <ul className="space-y-4">
        {dicas.map((dica) => (
          <li
            key={dica.titulo}
            className="flex items-start gap-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4"
          >
            <span className="text-2xl flex-shrink-0 mt-0.5">{dica.emoji}</span>
            <div>
              <p className="font-semibold text-gray-800 dark:text-white text-sm">
                {dica.titulo}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {dica.descricao}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <button
        onClick={onNext}
        className="w-full rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
      >
        Entendi, tirar foto
      </button>
    </div>
  );
}

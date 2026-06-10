"use client";

import { useRef, useState } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  arrow,
  FloatingPortal,
  safePolygon,
} from "@floating-ui/react";
import { UserCircleIcon } from "@/icons";
import { formatJsonValue, hasJsonContent } from "@/components/ui/json/JsonViewer";

interface PessoaFotoListagemProps {
  nome: string;
  fotoBase64?: string | null;
  fotoExtensao?: string | null;
  imageError?: unknown;
}

export default function PessoaFotoListagem({
  nome,
  fotoBase64,
  fotoExtensao,
  imageError,
}: PessoaFotoListagemProps) {
  const hasError = hasJsonContent(imageError);
  const [isOpen, setIsOpen] = useState(false);
  const arrowRef = useRef(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "top",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "start" }),
      shift({ padding: 8 }),
      arrow({ element: arrowRef, padding: 8 }),
    ],
  });

  const hover = useHover(context, {
    move: false,
    delay: { open: 100, close: 0 },
    handleClose: safePolygon({ blockPointerEvents: true }),
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  const stopRowNav = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  const avatar = (
    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0 flex items-center justify-center">
      {fotoBase64 ? (
        <img
          src={`data:image/${fotoExtensao || "png"};base64,${fotoBase64}`}
          alt={nome}
          className="w-full h-full object-cover"
        />
      ) : (
        <UserCircleIcon className="w-6 h-6 text-gray-400" />
      )}
    </div>
  );

  if (!hasError) {
    return avatar;
  }

  const arrowX = context.middlewareData.arrow?.x;
  const side = context.placement.split("-")[0];

  const getArrowStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "absolute",
      width: "10px",
      height: "10px",
      transform: "rotate(45deg)",
    };
    switch (side) {
      case "top":
        return {
          ...base,
          bottom: "-5px",
          left: arrowX != null ? `${arrowX}px` : "50%",
        };
      case "bottom":
        return {
          ...base,
          top: "-5px",
          left: arrowX != null ? `${arrowX}px` : "50%",
        };
      default:
        return base;
    }
  };

  const getArrowBorderSides = () => {
    switch (side) {
      case "top":
        return "border-r border-b";
      case "bottom":
        return "border-l border-t";
      default:
        return "border-r border-b";
    }
  };

  return (
    <div className="relative flex-shrink-0">
      {avatar}
      <span
        ref={refs.setReference}
        {...getReferenceProps({
          onClick: stopRowNav,
          onMouseDown: stopRowNav,
        })}
        className="absolute -right-0.5 -top-0.5 z-10 flex h-[15px] w-[15px] cursor-help items-center justify-center"
        aria-label="Erro no cadastro facial"
      >
        <span className="h-3 w-3 rounded-full border border-white bg-error-500 dark:border-gray-900" />
      </span>
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps({
              onClick: stopRowNav,
              onMouseDown: stopRowNav,
            })}
            className="z-99999 max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs font-mono text-gray-700 shadow-md dark:border-gray-700 dark:bg-[#1E2634] dark:text-white/90"
          >
            <p className="mb-1 text-[10px] font-sans font-semibold uppercase tracking-wide text-error-600 dark:text-error-400">
              Erro no cadastro facial
            </p>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar">
              {formatJsonValue(imageError)}
            </pre>
            <div
              ref={arrowRef}
              style={getArrowStyles()}
              className={`bg-white dark:bg-[#1E2634] ${getArrowBorderSides()} border-gray-200 dark:border-gray-700`}
            />
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}

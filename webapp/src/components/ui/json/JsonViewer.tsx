"use client";

import CodeBlock from "@/components/ai/Codeblock";

export function hasJsonContent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function formatJsonValue(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") {
    try {
      return JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      return data;
    }
  }
  return JSON.stringify(data, null, 2);
}

interface JsonViewerProps {
  data: unknown;
  title?: string;
  description?: string;
  className?: string;
}

export default function JsonViewer({
  data,
  title,
  description,
  className = "",
}: JsonViewerProps) {
  if (!hasJsonContent(data)) return null;

  const code = formatJsonValue(data);

  return (
    <div className={className}>
      {(title || description) && (
        <div className="mb-3">
          {title && (
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {title}
            </h3>
          )}
          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
      )}
      <CodeBlock code={code} language="json" />
    </div>
  );
}

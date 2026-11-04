"use client";

import { useEffect, useId, useRef } from "react";

/** Keep every validation message available and bring keyboard users to feedback. */
export function FormErrorSummary({ errors, targets = {} }: { errors: string[]; targets?: Record<string, string> }) {
  const headingId = useId();
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    summary.current?.focus({ preventScroll: true });
  }, [errors]);

  return (
    <div ref={summary} data-tezukuru-errors role="alert" tabIndex={-1} aria-labelledby={headingId}
      className="application-error-summary rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
      <h2 id={headingId} className="mb-2 font-semibold">確認が必要な内容があります</h2>
      <ul className="list-disc pl-5">
        {errors.map((message, index) => {
          const target = Object.entries(targets).find(([prefix]) => message.startsWith(prefix))?.[1];
          return <li key={index}>{target ? <a href={`#${encodeURIComponent(target)}`} onClick={event => {
            const field = document.getElementById(target);
            if (!field) return;
            event.preventDefault();
            field.focus({ preventScroll: true });
            field.scrollIntoView({ block: "center", behavior: "auto" });
          }}>{message}</a> : message}</li>;
        })}
      </ul>
    </div>
  );
}

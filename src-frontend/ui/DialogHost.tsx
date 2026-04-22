import { useEffect, useRef, useState } from "react";
import { useDialogStore, type ChoiceOption } from "./dialogStore";
import { Button } from "./Button";

export function DialogHost() {
  const toasts = useDialogStore((s) => s.toasts);
  const dismissToast = useDialogStore((s) => s.dismissToast);
  const prompt = useDialogStore((s) => s.prompt);
  const resolvePrompt = useDialogStore((s) => s.resolvePrompt);
  const confirm = useDialogStore((s) => s.confirm);
  const resolveConfirm = useDialogStore((s) => s.resolveConfirm);
  const choice = useDialogStore((s) => s.choice);
  const resolveChoice = useDialogStore((s) => s.resolveChoice);

  return (
    <>
      {(prompt || confirm || choice) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          {prompt && (
            <PromptDialog
              title={prompt.title}
              placeholder={prompt.placeholder}
              onSubmit={(value) => resolvePrompt(value)}
              onCancel={() => resolvePrompt(null)}
            />
          )}
          {confirm && (
            <ConfirmDialog
              title={confirm.title}
              message={confirm.message}
              onResult={(value) => resolveConfirm(value)}
            />
          )}
          {choice && (
            <ChoiceDialog
              title={choice.title}
              options={choice.options}
              onPick={(i) => resolveChoice(i)}
            />
          )}
        </div>
      )}

      <div className="fixed top-14 right-4 z-40 flex flex-col gap-2 w-96 pointer-events-none">
        {toasts.map((t) => {
          const accent =
            t.kind === "error" ? "border-life" : t.kind === "success" ? "border-accent" : "border-border";
          return (
            <div
              key={t.id}
              onClick={() => dismissToast(t.id)}
              className={`pointer-events-auto cursor-pointer border ${accent} bg-bg-elevated px-3 py-2 font-mono text-xs text-fg-dim shadow-xl`}
            >
              <div className="text-[9px] uppercase tracking-widest text-fg-muted mb-0.5">{t.kind}</div>
              <div className="text-fg whitespace-pre-wrap">{t.message}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function PromptDialog({
  title,
  placeholder,
  onSubmit,
  onCancel,
}: {
  title: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="border border-border bg-bg-elevated w-[640px] max-w-[90vw] font-mono text-xs">
      <div className="border-b border-border px-4 py-2 text-[10px] uppercase tracking-widest text-fg-muted">
        {title}
      </div>
      <div className="p-4 space-y-3">
        <textarea
          ref={ref}
          className="w-full h-32 bg-bg border border-border px-3 py-2 font-mono text-[11px] text-fg focus:outline-none focus:border-fg-muted resize-none"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onSubmit(value);
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onSubmit(value)} disabled={!value.trim()}>Import</Button>
        </div>
      </div>
    </div>
  );
}

function ChoiceDialog({
  title,
  options,
  onPick,
}: {
  title: string;
  options: ChoiceOption[];
  onPick: (index: number | null) => void;
}) {
  return (
    <div className="border border-border bg-bg-elevated w-[380px] max-w-[90vw] font-mono text-xs">
      <div className="border-b border-border px-4 py-2 text-[10px] uppercase tracking-widest text-fg-muted">
        {title}
      </div>
      <div className="p-3 space-y-2">
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            className="w-full rounded-sm border border-border bg-bg px-3 py-2 text-left hover:border-fg-muted hover:bg-bg-elev"
          >
            <div className="text-fg">{opt.label}</div>
            {opt.description && (
              <div className="mt-0.5 text-[10px] text-fg-dim">{opt.description}</div>
            )}
          </button>
        ))}
        <div className="flex justify-end pt-1">
          <Button onClick={() => onPick(null)}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  onResult,
}: {
  title: string;
  message?: string;
  onResult: (value: boolean) => void;
}) {
  return (
    <div className="border border-border bg-bg-elevated w-96 max-w-[90vw] font-mono text-xs">
      <div className="border-b border-border px-4 py-2 text-[10px] uppercase tracking-widest text-fg-muted">
        {title}
      </div>
      <div className="p-4 space-y-3">
        {message && <div className="text-fg whitespace-pre-wrap">{message}</div>}
        <div className="flex justify-end gap-2">
          <Button onClick={() => onResult(false)}>Cancel</Button>
          <Button onClick={() => onResult(true)}>OK</Button>
        </div>
      </div>
    </div>
  );
}

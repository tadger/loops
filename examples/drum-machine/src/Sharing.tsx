import { useRef, useState } from "react";
import type { Diagnostic, Loop } from "@loops/core";
import { exportLoop, importLoop } from "./persistence";

interface SharingProps {
  loop: Loop;
  onImport(loop: Loop): void;
  onReset(): void;
}

export function Sharing({ loop, onImport, onReset }: SharingProps) {
  const [exported, setExported] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<Diagnostic[]>([]);
  const importRef = useRef<HTMLTextAreaElement>(null);

  const doImport = () => {
    const result = importLoop(text);
    if (result.ok) {
      setErrors([]);
      onImport(result.loop);
    } else {
      setErrors(result.errors);
      importRef.current?.focus();
    }
  };

  const doReset = () => {
    if (window.confirm("Replace your loop with the boom-bap beat?")) onReset();
  };

  return (
    <section className="sharing">
      <div>
        <button type="button" onClick={() => setExported(exportLoop(loop))}>
          Export
        </button>
        <button type="button" onClick={doReset}>
          Reset to boom-bap
        </button>
        {exported !== null && <textarea readOnly aria-label="Exported loop" value={exported} rows={10} />}
      </div>
      <div>
        <label htmlFor="import-text">Import loop JSON</label>
        <textarea id="import-text" ref={importRef} value={text} onChange={(e) => setText(e.target.value)} rows={10} />
        <button type="button" onClick={doImport}>
          Import
        </button>
        {errors.length > 0 && (
          <ul role="alert">
            {errors.map((d, i) => (
              <li key={i}>
                {d.path}: {d.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

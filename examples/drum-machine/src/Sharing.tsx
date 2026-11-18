import { useRef, useState } from "react";
import type { Diagnostic, Json, Loop } from "@loops/core";
import { JsonTree } from "./JsonTree";
import { exportLoop, importLoop } from "./persistence";

interface SharingProps {
  loop: Loop;
  onImport(loop: Loop): void;
  onReset(): void;
}

export function Sharing({ loop, onImport, onReset }: SharingProps) {
  const [exported, setExported] = useState<string | null>(null);
  const [view, setView] = useState<"tree" | "raw">("tree");
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
    if (window.confirm("Replace your loop with the default beat?")) onReset();
  };

  return (
    <section className="sharing">
      <div>
        <button type="button" onClick={() => setExported(exportLoop(loop))}>
          Export
        </button>
        <button type="button" onClick={doReset}>
          Reset default beat
        </button>
        {exported !== null && (
          <div className="export-view">
            <div className="export-toggle" role="group" aria-label="Export view">
              <button type="button" aria-pressed={view === "tree"} onClick={() => setView("tree")}>
                Tree
              </button>
              <button type="button" aria-pressed={view === "raw"} onClick={() => setView("raw")}>
                Raw
              </button>
            </div>
            {view === "tree" ? (
              <div className="json-view" role="group" aria-label="Exported loop">
                <JsonTree value={JSON.parse(exported) as Json} />
              </div>
            ) : (
              <textarea readOnly aria-label="Exported loop" value={exported} rows={10} />
            )}
          </div>
        )}
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

import { lazy, memo, Suspense, useCallback, useRef, useState } from "react";
import { AIResponse } from "components/ui/kibo-ui/ai/response";
import { Button } from "@/components/ui/button";
import type { Options } from "react-markdown";
import type { OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

export interface DocumentPanelProps {
  document: string | undefined;
  fullPath: string;
  extraComponents?: Options["components"];
  preprocessMarkdown?: (md: string) => string;
  onDocumentChange?: (content: string) => void;
}

export const DocumentPanel = memo(function DocumentPanel({
  document,
  fullPath,
  extraComponents,
  preprocessMarkdown,
  onDocumentChange,
}: DocumentPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const onDocumentChangeRef = useRef(onDocumentChange);
  onDocumentChangeRef.current = onDocumentChange;

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    // Register Prettier as Monaco's native document formatter for Markdown
    monaco.languages.registerDocumentFormattingEditProvider("markdown", {
      provideDocumentFormattingEdits: async (
        model: Monaco.editor.ITextModel
      ) => {
        try {
          const [prettier, markdownPlugin] = await Promise.all([
            import("prettier/standalone"),
            import("prettier/plugins/markdown"),
          ]);
          const formatted = await prettier.format(model.getValue(), {
            parser: "markdown",
            plugins: [markdownPlugin.default],
            proseWrap: "preserve",
            tabWidth: 2,
          });
          return [
            {
              text: formatted,
              range: model.getFullModelRange(),
            },
          ];
        } catch {
          return [];
        }
      },
    });

    // Ctrl+S / Cmd+S: format with Prettier then notify parent
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const formatAction = editor.getAction("editor.action.formatDocument");
      if (formatAction) {
        await formatAction.run();
        onDocumentChangeRef.current?.(editor.getValue());
      }
    });
  }, []);

  if (!document) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>No document yet. Send a message to generate one.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-end px-4 py-2 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? "Preview" : "Edit"}
        </Button>
      </div>
      {isEditing ? (
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Loading editor…
            </div>
          }
        >
          <MonacoEditor
            height="100%"
            defaultLanguage="markdown"
            value={document}
            onChange={(value) => onDocumentChange?.(value ?? "")}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              wordWrap: "on",
              lineNumbers: "off",
              fontSize: 14,
              padding: { top: 16, bottom: 16 },
              scrollBeyondLastLine: true,
            }}
          />
        </Suspense>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar scrollbar-track-transparent scrollbar-thumb-gray-700 hover:scrollbar-thumb-gray-600 p-6">
          <div className="max-w-[75ch] mx-auto">
            <AIResponse
              imageBasePath={fullPath}
              extraComponents={extraComponents}
              preprocessMarkdown={preprocessMarkdown}
            >
              {document}
            </AIResponse>
          </div>
        </div>
      )}
    </div>
  );
});

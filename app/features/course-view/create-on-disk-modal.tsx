import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

export function CreateOnDiskModal({
  lessonId,
  open,
  onOpenChange,
}: {
  lessonId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createOnDiskFetcher = useFetcher();
  const [repoPathInput, setRepoPathInput] = useState("");
  const [createOnDiskError, setCreateOnDiskError] = useState<string | null>(
    null
  );

  // If the create-on-disk fetcher returns an error, reopen the modal
  useEffect(() => {
    const errorMsg = (
      createOnDiskFetcher.data as { error?: string } | undefined
    )?.error;
    if (errorMsg && createOnDiskFetcher.state === "idle") {
      setCreateOnDiskError(errorMsg);
      onOpenChange(true);
    }
  }, [createOnDiskFetcher.data, createOnDiskFetcher.state, onOpenChange]);

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          setRepoPathInput("");
          setCreateOnDiskError(null);
        }
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create on Disk</DialogTitle>
        </DialogHeader>
        <createOnDiskFetcher.Form
          method="post"
          action={`/api/lessons/${lessonId}/create-on-disk`}
          className="space-y-4 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!repoPathInput.trim()) return;
            setCreateOnDiskError(null);
            createOnDiskFetcher.submit(
              { repoPath: repoPathInput.trim() },
              {
                method: "post",
                action: `/api/lessons/${lessonId}/create-on-disk`,
              }
            );
            onOpenChange(false);
            setRepoPathInput("");
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="create-on-disk-repo-path">
              Course Repository Path
            </Label>
            <Input
              id="create-on-disk-repo-path"
              name="repoPath"
              placeholder="e.g. /path/to/existing/directory"
              value={repoPathInput}
              onChange={(e) => setRepoPathInput(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Must point to an existing git repository directory. This will
              permanently assign a file path to the course.
            </p>
          </div>
          {createOnDiskError && (
            <p className="text-sm text-destructive">{createOnDiskError}</p>
          )}
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setRepoPathInput("");
                setCreateOnDiskError(null);
              }}
              type="button"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !repoPathInput.trim() || createOnDiskFetcher.state !== "idle"
              }
            >
              {createOnDiskFetcher.state !== "idle" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Create on Disk"
              )}
            </Button>
          </div>
        </createOnDiskFetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

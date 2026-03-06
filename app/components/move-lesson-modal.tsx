import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import type { useFetcher } from "react-router";

export function MoveLessonModal(props: {
  lessonId: string;
  lessonTitle: string;
  currentSectionId: string;
  sections: {
    id: string;
    path: string;
  }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher: ReturnType<typeof useFetcher>;
}) {
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedSectionId("");
    }
    props.onOpenChange(open);
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Move Lesson
          </DialogTitle>
          <DialogDescription>
            Move &ldquo;{props.lessonTitle}&rdquo; to a different section.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Select
            value={selectedSectionId}
            onValueChange={setSelectedSectionId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a section..." />
            </SelectTrigger>
            <SelectContent>
              {props.sections
                .filter((s) => s.id !== props.currentSectionId)
                .map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.path}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button
              disabled={
                !selectedSectionId || props.fetcher.state === "submitting"
              }
              onClick={async () => {
                await props.fetcher.submit(
                  { sectionId: selectedSectionId, lessonId: props.lessonId },
                  {
                    method: "post",
                    action: `/api/lessons/${props.lessonId}/move-to-section`,
                  }
                );
                handleOpenChange(false);
              }}
            >
              {props.fetcher.state === "submitting" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Move"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

interface AddCourseModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCourseModal({ isOpen, onOpenChange }: AddCourseModalProps) {
  const addCourseFetcher = useFetcher();
  const addGhostCourseFetcher = useFetcher();
  const [mode, setMode] = useState<"real" | "ghost">("real");

  useEffect(() => {
    if (addCourseFetcher.state === "idle" && addCourseFetcher.data) {
      onOpenChange(false);
    }
  }, [addCourseFetcher.state, addCourseFetcher.data, onOpenChange]);

  useEffect(() => {
    if (addGhostCourseFetcher.state === "idle" && addGhostCourseFetcher.data) {
      onOpenChange(false);
    }
  }, [
    addGhostCourseFetcher.state,
    addGhostCourseFetcher.data,
    onOpenChange,
  ]);

  // Reset mode when modal opens
  useEffect(() => {
    if (isOpen) setMode("real");
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Course</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 border-b pb-2">
          <button
            type="button"
            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
              mode === "real"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("real")}
          >
            From Repository
          </button>
          <button
            type="button"
            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
              mode === "ghost"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("ghost")}
          >
            Ghost Course
          </button>
        </div>
        {mode === "real" ? (
          <addCourseFetcher.Form
            method="post"
            action="/api/courses/add"
            className="space-y-4 py-4"
          >
            <div className="space-y-2">
              <Label htmlFor="course-name">Course Name</Label>
              <Input
                id="course-name"
                placeholder="e.g., Total TypeScript"
                name="name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="course-path">Course Repo Path</Label>
              <Input
                id="course-path"
                placeholder="Enter local file path..."
                name="repoPath"
                required
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button type="submit">Add Course</Button>
            </div>
          </addCourseFetcher.Form>
        ) : (
          <addGhostCourseFetcher.Form
            method="post"
            action="/api/courses/add-ghost"
            className="space-y-4 py-4"
          >
            <div className="space-y-2">
              <Label htmlFor="ghost-course-name">Course Name</Label>
              <Input
                id="ghost-course-name"
                placeholder="e.g., Total TypeScript"
                name="name"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Ghost courses exist only in the database with no file path. You
              can assign a file path later when you're ready to materialize.
            </p>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button type="submit">Create Ghost Course</Button>
            </div>
          </addGhostCourseFetcher.Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { DBFunctionsService } from "@/services/db-service";
import { runtimeLive } from "@/services/layer";
import { Console, Effect } from "effect";
import { data, useRevalidator } from "react-router";
import type { Route } from "./+types/videos.$videoId.thumbnails";
import { CameraIcon, ImageIcon, SaveIcon, Loader2Icon } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { CaptureCameraModal } from "@/components/capture-camera-modal";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

export const loader = async (args: Route.LoaderArgs) => {
  const { videoId } = args.params;
  return Effect.gen(function* () {
    const db = yield* DBFunctionsService;
    const thumbnails = yield* db.getThumbnailsByVideoId(videoId);

    return { videoId, thumbnails };
  }).pipe(
    Effect.tapErrorCause((e) => Console.dir(e, { depth: null })),
    Effect.catchAll(() => {
      return Effect.die(data("Internal server error", { status: 500 }));
    }),
    runtimeLive.runPromise
  );
};

/**
 * Draws an image onto a canvas using crop-to-cover (fills entire canvas, cropping excess).
 */
function drawCropToCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
) {
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let sx: number, sy: number, sw: number, sh: number;

  if (imgAspect > canvasAspect) {
    // Image is wider — crop sides
    sh = img.naturalHeight;
    sw = sh * canvasAspect;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    // Image is taller — crop top/bottom
    sw = img.naturalWidth;
    sh = sw / canvasAspect;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
}

export default function ThumbnailsPage({ loaderData }: Route.ComponentProps) {
  const { videoId, thumbnails } = loaderData;
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revalidator = useRevalidator();

  const handleCapture = (dataUrl: string) => {
    setCapturedPhoto(dataUrl);
  };

  // Draw captured photo onto the canvas compositor
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !capturedPhoto) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      drawCropToCover(ctx, img, CANVAS_WIDTH, CANVAS_HEIGHT);
    };
    img.src = capturedPhoto;
  }, [capturedPhoto]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !capturedPhoto) return;

    setSaving(true);
    try {
      // Export canvas to data URL
      const exportDataUrl = canvas.toDataURL("image/png");

      const response = await fetch("/api/thumbnails/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          imageDataUrl: exportDataUrl,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save thumbnail");
      }

      // Clear the captured photo and revalidate to show new thumbnail
      setCapturedPhoto(null);
      revalidator.revalidate();
    } catch (error) {
      console.error("Failed to save thumbnail:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Thumbnails {thumbnails.length > 0 && `(${thumbnails.length})`}
        </h2>
        <Button onClick={() => setCameraOpen(true)}>
          <CameraIcon />
          Capture Face
        </Button>
      </div>

      {capturedPhoto && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-gray-400">
            Canvas Preview
          </h3>
          <div className="inline-block overflow-hidden rounded-lg border">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="h-auto max-w-2xl w-full"
            />
          </div>
          <div className="mt-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              {saving ? "Saving..." : "Save Thumbnail"}
            </Button>
          </div>
        </div>
      )}

      {thumbnails.length === 0 && !capturedPhoto ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-4">
          <ImageIcon className="size-16 opacity-50" />
          <div className="text-center">
            <p className="text-lg font-medium">No thumbnails yet</p>
            <p className="text-sm mt-1">
              Capture a face photo to start creating thumbnails.
            </p>
          </div>
        </div>
      ) : (
        thumbnails.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-400">
              Saved Thumbnails
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {thumbnails.map((thumbnail) => (
                <div
                  key={thumbnail.id}
                  className="border rounded-lg overflow-hidden"
                >
                  {thumbnail.filePath ? (
                    <img
                      src={`/api/thumbnails/${thumbnail.id}/image`}
                      alt="Thumbnail"
                      className="w-full aspect-video object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-gray-800 flex items-center justify-center text-gray-500">
                      Not rendered
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      <CaptureCameraModal
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={handleCapture}
      />
    </div>
  );
}

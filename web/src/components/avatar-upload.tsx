import { useRef } from "react";
import { Camera, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACCEPT = "image/png,image/jpeg,image/webp";

/** Profile photo picker: the avatar itself and the button both open the file dialog. */
export function AvatarUpload({
  image,
  onSelect,
  onRemove,
}: {
  image: string | null;
  onSelect: (file: File | undefined) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => inputRef.current?.click();

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={image ? "Change profile photo" : "Upload profile photo"}
        onClick={openPicker}
      >
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound className="mx-auto h-7 w-7 text-muted-foreground" />
        )}
        <span className="absolute inset-0 grid place-items-center bg-foreground/45 text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="h-5 w-5" />
        </span>
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openPicker}>
            <Camera className="h-4 w-4" />
            {image ? "Change photo" : "Upload photo"}
          </Button>
          {image && (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">PNG, JPG or WebP, up to 500 KB.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          onSelect(event.target.files?.[0]);
          // Clear so choosing the same file again still fires a change.
          event.target.value = "";
        }}
      />
    </div>
  );
}

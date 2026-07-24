import { BrandMark } from "@/components/brand-mark";

export function AlpacaLoader({
  label = "Getting things ready",
  fullPage = false,
}: {
  label?: string;
  fullPage?: boolean;
}) {
  return (
    <div
      className={`${fullPage ? "min-h-[60vh]" : "min-h-40"} flex flex-col items-center justify-center px-5 text-center`}
      role="status"
      aria-live="polite"
    >
      <div className="alpaca-walkway">
        <BrandMark className="alpaca-walker h-12 w-12" />
        <span className="alpaca-step alpaca-step-one" />
        <span className="alpaca-step alpaca-step-two" />
        <span className="alpaca-step alpaca-step-three" />
      </div>
      <p className="mt-4 text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

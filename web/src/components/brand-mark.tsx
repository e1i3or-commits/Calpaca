export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <img
      src="/icons/llama.svg"
      alt=""
      aria-hidden="true"
      className={`${className} shrink-0 object-contain`}
    />
  );
}

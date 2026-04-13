export function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#065F46] border-t-transparent" />
        <div className="font-heading text-sm text-[var(--muted)]">Loading UENR Career Hub...</div>
      </div>
    </div>
  );
}

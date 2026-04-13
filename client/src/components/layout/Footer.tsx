export function Footer() {
  return (
    <footer className="hidden md:block border-t border-[var(--border)] bg-[var(--card)] py-8">
      <div className="mx-auto max-w-7xl px-4 text-sm text-[var(--muted)]">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <div className="font-heading font-bold text-[var(--fg)]">UENR Alumni Career Hub</div>
            <div>University of Energy and Natural Resources • Sunyani, Ghana</div>
          </div>
          <div>© {new Date().getFullYear()} UENR Career Services. Built for the next generation.</div>
        </div>
      </div>
    </footer>
  );
}

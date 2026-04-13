import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
      <div className="text-7xl">🧭</div>
      <h1 className="font-heading text-4xl font-bold">Lost in the network</h1>
      <p className="text-[var(--muted)] max-w-md">This page doesn't exist yet — but your career journey does. Let's head back home.</p>
      <Link to="/" className="btn-primary">Take me home</Link>
    </div>
  );
}

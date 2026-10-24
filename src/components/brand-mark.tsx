export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-label="Settlewise">
      <rect x="3" y="4" width="26" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 4v24" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <path d="M13 11h11M13 16h11M13 21h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

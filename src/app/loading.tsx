export default function Loading() {
  return (
    <div className="container" aria-busy="true" aria-live="polite">
      <p className="visually-hidden">Loading the ledger.</p>
      <div style={{ height: "4.5rem", marginTop: "2.4rem", maxWidth: "420px" }} className="skeleton" />
      <div className="loading-grid">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );
}

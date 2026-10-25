"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}
      className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-800 print:hidden">
      Print / save as PDF
    </button>
  );
}

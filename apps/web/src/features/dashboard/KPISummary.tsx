import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CaretRight } from '@phosphor-icons/react';

export interface KPI {
  label: string;
  value: ReactNode;
  hint: string;
  /** Route to open, or an in-page section id starting with '#'. */
  to?: string;
  alert?: boolean;
}

/** Headline numbers; each card with a target opens the list or section behind the number. */
export function KPISummary({ items }: { items: KPI[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {items.map((k) => {
        const body = (
          <>
            <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-stone-500">
              {k.label}
              {k.to && (
                <CaretRight
                  size={14}
                  className="text-stone-400 group-hover:text-brand-700"
                  aria-hidden
                />
              )}
            </p>
            <p
              className={`num mt-1 text-2xl font-semibold tracking-tight sm:text-3xl ${k.alert ? 'text-red-700' : 'text-stone-900'}`}
            >
              {k.value}
            </p>
            <p className="mt-1 text-xs text-stone-600">{k.hint}</p>
          </>
        );
        const cls = 'card group block transition-colors';
        if (!k.to)
          return (
            <div key={k.label} className={cls}>
              {body}
            </div>
          );
        return k.to.startsWith('#') ? (
          <a
            key={k.label}
            href={k.to}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(k.to!.slice(1))?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`${cls} hover:border-brand-400`}
          >
            {body}
          </a>
        ) : (
          <Link key={k.label} to={k.to} className={`${cls} hover:border-brand-400`}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}

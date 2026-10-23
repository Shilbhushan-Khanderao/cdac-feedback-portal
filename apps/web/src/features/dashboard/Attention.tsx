import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ChartLineDown,
  Clock,
  EyeSlash,
  PlusCircle,
  UsersThree,
  WhatsappLogo,
} from '@phosphor-icons/react';
import { fmt, shareFeedbackLink } from '../../shared/format';
import { pct, type Action, type Missing } from './insights';

type Row =
  Exclude<Action, { kind: 'missing' }> | { kind: 'missing'; first: Missing; names: string[] };

/** One row per cohort for missing modules, instead of one per module. */
function collapse(items: Action[]): Row[] {
  const out: Row[] = [];
  const byCohort = new Map<string, { kind: 'missing'; first: Missing; names: string[] }>();
  for (const a of items) {
    if (a.kind !== 'missing') {
      out.push(a);
      continue;
    }
    const key = `${a.batch_id}|${a.centre_id}|${a.course_id}`;
    const g = byCohort.get(key);
    if (g) g.names.push(a.module.name);
    else {
      const row = { kind: 'missing' as const, first: a, names: [a.module.name] };
      byCohort.set(key, row);
      out.push(row);
    }
  }
  return out;
}

const SHOW = 5;

const studentLink = (id: string) => `${location.origin}${location.pathname}#/feedback/${id}`;

/** "What to do next": one row per action, each with the button that does it. */
export function Attention({ items: actions }: { items: Action[] }) {
  const [all, setAll] = useState(false);
  const items = collapse(actions);
  if (!items.length)
    return (
      <section className="card border-brand-200 bg-brand-50/50 text-sm text-stone-700">
        Nothing needs your attention right now.
      </section>
    );
  const shown = all ? items : items.slice(0, SHOW);
  return (
    <section className="card p-0">
      <header className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2 className="text-base font-semibold text-stone-900">What to do next</h2>
        <span className="text-sm font-medium text-stone-600">{items.length} items</span>
      </header>
      <ul className="divide-y divide-stone-100">
        {shown.map((a) => (
          <li
            key={
              a.kind === 'missing'
                ? `m-${a.first.centre_id}-${a.first.batch_id}-${a.first.course_id}`
                : `${a.kind}-${a.row.id}`
            }
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
          >
            <Item a={a} />
          </li>
        ))}
      </ul>
      {items.length > SHOW && (
        <button
          className="w-full border-t border-stone-100 py-2.5 text-sm font-medium text-brand-700 hover:bg-stone-50"
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

function Item({ a }: { a: Row }) {
  if (a.kind === 'missing') {
    const m = a.first;
    const more = a.names.length > 3 ? ` and ${a.names.length - 3} more` : '';
    const q = new URLSearchParams({
      new: '1',
      batch_id: m.batch_id,
      centre_id: m.centre_id,
      course_id: m.course_id,
      module_id: m.module.id,
    });
    return (
      <>
        <Icon tone="brand">
          <PlusCircle size={20} weight="fill" />
        </Icon>
        <Text
          title={
            a.names.length > 1
              ? `${a.names.length} modules have no feedback session yet`
              : `${m.module.name}: no feedback session yet`
          }
          detail={`${a.names.length > 1 ? `${a.names.slice(0, 3).join(', ')}${more} · ` : ''}${m.course} · ${m.batch} · ${m.centre}`}
        />
        <Link to={`/sessions?${q}`} className="btn btn-primary">
          {a.names.length > 1 ? `Create for ${m.module.name}` : 'Create session'}
        </Link>
      </>
    );
  }
  const r = a.row;
  const where = `${r.course} · ${r.batch} · ${r.centre}`;
  if (a.kind === 'turnout')
    return (
      <>
        <Icon tone={a.closesSoon ? 'red' : 'amber'}>
          {a.closesSoon ? (
            <Clock size={20} weight="fill" />
          ) : (
            <UsersThree size={20} weight="fill" />
          )}
        </Icon>
        <Text
          title={`${r.module}: ${r.submitted} of ${r.students} answered (${pct(r.submitted, r.students)}%)`}
          detail={`${a.closesSoon ? 'Closes soon:' : 'Closes'} ${fmt(r.closes_at)} · ${where}`}
        />
        <div className="flex flex-wrap gap-2">
          <button
            className="btn bg-emerald-700 font-medium text-white hover:bg-emerald-800"
            onClick={() => void shareFeedbackLink(studentLink(r.id), r.module)}
          >
            <WhatsappLogo size={16} aria-hidden /> Send reminder
          </button>
          <Link to={`/sessions/${r.id}`} className="btn">
            Who hasn't answered
          </Link>
        </div>
      </>
    );
  if (a.kind === 'low')
    return (
      <>
        <Icon tone="red">
          <ChartLineDown size={20} weight="fill" />
        </Icon>
        <Text
          title={`${r.module}: low rating, ${a.value} / 5`}
          detail={`Closed ${fmt(r.closes_at)} · ${where}`}
        />
        <Link to={`/sessions/${r.id}`} className="btn btn-primary">
          Read the feedback
        </Link>
      </>
    );
  return (
    <>
      <Icon tone="stone">
        <EyeSlash size={20} weight="fill" />
      </Icon>
      <Text
        title={`${r.module}: results hidden, ${r.submitted ? `only ${r.submitted} answered` : 'nobody answered'}`}
        detail={`At least 3 answers are needed to keep them anonymous; share the link earlier next time. ${where}`}
      />
      <Link to={`/sessions/${r.id}`} className="btn">
        View session
      </Link>
    </>
  );
}

const TONES = {
  brand: 'bg-brand-100 text-brand-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  stone: 'bg-stone-100 text-stone-600',
};

function Icon({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}
      aria-hidden
    >
      {children}
    </span>
  );
}

function Text({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="min-w-0 flex-1 basis-56">
      <p className="font-medium text-stone-900">{title}</p>
      <p className="text-sm text-stone-600">{detail}</p>
    </div>
  );
}

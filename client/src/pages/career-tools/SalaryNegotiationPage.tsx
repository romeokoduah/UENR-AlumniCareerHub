// Salary Negotiation — four-tab tool that backs /career-tools/salary.
//
//   Tab 1 — Benchmarks: filter & browse SalaryBenchmark rows
//   Tab 2 — Cost of Living: side-by-side city compare + lifestyle calc
//   Tab 3 — Offer Analyzer: model a real offer against the benchmarks
//   Tab 4 — Scripts & Playbooks: hand-written negotiation guides
//
// All numbers in the underlying SalaryBenchmark rows are MONTHLY in the
// row's currency. The user picks a base currency (default GHS) and we
// convert with the static FX map served by /api/salary/exchange-rates.
//
// No AI calls anywhere on this page. All math is deterministic.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, DollarSign, Search, Filter, MapPin, Building2,
  Calculator, BarChart3, FileSearch, BookOpen, ChevronDown, ChevronRight,
  TrendingUp, AlertCircle, CheckCircle2, Save, Trash2, ArrowRightLeft,
  Sparkles, Info
} from 'lucide-react';
import { api } from '../../services/api';
import { SALARY_PLAYBOOKS } from './salaryPlaybooks';

const TOOL_SLUG = 'salary';

// ============================ Types =======================================

type Benchmark = {
  id: string;
  role: string;
  seniority: string;
  city: string;
  country: string;
  currency: string;
  minMonthly: number;
  maxMonthly: number;
  source: string | null;
  notes: string | null;
};

type CityCost = {
  id: string;
  city: string;
  country: string;
  currency: string;
  rentMonthly: number;
  groceriesMonthly: number;
  transportMonthly: number;
  utilitiesMonthly: number;
  totalMonthly: number;
  notes: string | null;
};

type SeniorityKey = 'junior' | 'mid' | 'senior' | 'lead';
type TabKey = 'benchmarks' | 'col' | 'offer' | 'scripts';

// ============================ Helpers =====================================

const logActivity = (action: string, metadata?: Record<string, unknown>) =>
  api.post('/career-tools/activity', { tool: TOOL_SLUG, action, metadata }).catch(() => {});

const SENIORITIES: SeniorityKey[] = ['junior', 'mid', 'senior', 'lead'];
const SENIORITY_LABEL: Record<SeniorityKey, string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead'
};

const ALL_CURRENCIES = ['GHS', 'USD', 'GBP', 'EUR', 'CAD', 'AED', 'ZAR', 'NGN', 'KES'];

// Format an amount in a given currency. We don't use Intl with currency
// formatting because (a) it surprises people for non-major currencies
// and (b) we don't want to gamble on which symbol the OS picks.
function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  return `${currency} ${rounded.toLocaleString('en-US')}`;
}

// Convert `amount` from `from` to `to` using the static rate map. Rates
// are relative to GHS — multiply to get target, divide to come back.
function convert(amount: number, from: string, to: string, rates: Record<string, number>): number {
  if (from === to) return amount;
  const fromRate = rates[from] ?? 1;
  const toRate = rates[to] ?? 1;
  // amount in GHS first, then to target
  const inGhs = amount / fromRate;
  return inGhs * toRate;
}

// ============================ Page shell ==================================

export default function SalaryNegotiationPage() {
  const [tab, setTab] = useState<TabKey>('benchmarks');

  useEffect(() => { logActivity('open'); }, []);

  return (
    <div className="bg-[var(--bg)]">
      <Header />

      {/* Tab strip */}
      <section className="border-b border-[var(--border)] bg-[var(--card)]/40">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-wrap gap-1 overflow-x-auto py-2">
            <TabButton icon={<BarChart3 size={15} />} label="Benchmarks" active={tab === 'benchmarks'} onClick={() => setTab('benchmarks')} />
            <TabButton icon={<Calculator size={15} />} label="Cost of Living" active={tab === 'col'} onClick={() => setTab('col')} />
            <TabButton icon={<FileSearch size={15} />} label="Offer Analyzer" active={tab === 'offer'} onClick={() => setTab('offer')} />
            <TabButton icon={<BookOpen size={15} />} label="Scripts & Playbooks" active={tab === 'scripts'} onClick={() => setTab('scripts')} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {tab === 'benchmarks' && <BenchmarksTab />}
        {tab === 'col' && <CostOfLivingTab />}
        {tab === 'offer' && <OfferAnalyzerTab />}
        {tab === 'scripts' && <ScriptsTab />}
      </section>
    </div>
  );
}

function Header() {
  return (
    <section className="border-b border-[var(--border)]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <Link
          to="/career-tools"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
        >
          <ArrowLeft size={14} /> Career Tools
        </Link>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
            <DollarSign size={28} />
          </div>
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
              — Salary Negotiation
            </div>
            <h1 className="font-heading text-3xl font-extrabold leading-tight md:text-4xl">
              Know your number. Then ask for it.
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Ghana + diaspora benchmarks, a cost-of-living calculator, and scripts for the
              awkward part of the conversation.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
        active
          ? 'bg-[#065F46] text-white dark:bg-[#84CC16] dark:text-stone-900'
          : 'text-[var(--fg)] hover:bg-[var(--card)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1 text-xs font-semibold transition-all ${
        active
          ? 'border-[#065F46] bg-[#065F46] text-white'
          : 'border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:border-[#065F46]/50'
      }`}
    >
      {label}
    </button>
  );
}

// =================== Tab 1: Benchmarks ====================================

function BenchmarksTab() {
  const [roleQuery, setRoleQuery] = useState('');
  const [seniority, setSeniority] = useState<SeniorityKey | 'all'>('all');
  const [country, setCountry] = useState<string>('all');
  const [city, setCity] = useState<string>('all');
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  useEffect(() => {
    logActivity('view_benchmark');
  }, []);

  const rolesQuery = useQuery<string[]>({
    queryKey: ['salary', 'roles'],
    queryFn: async () => (await api.get('/salary/benchmarks/roles')).data.data
  });

  const citiesQuery = useQuery<{ city: string; country: string; currency: string }[]>({
    queryKey: ['salary', 'cities'],
    queryFn: async () => (await api.get('/salary/benchmarks/cities')).data.data
  });

  // Country list derived from cities response so we don't need a third call.
  const countries = useMemo(() => {
    const set = new Set<string>();
    (citiesQuery.data ?? []).forEach((c) => set.add(c.country));
    return Array.from(set).sort();
  }, [citiesQuery.data]);

  const citiesForCountry = useMemo(() => {
    const list = citiesQuery.data ?? [];
    return country === 'all' ? list : list.filter((c) => c.country === country);
  }, [citiesQuery.data, country]);

  // Reset city if it doesn't belong to the chosen country.
  useEffect(() => {
    if (city !== 'all' && !citiesForCountry.some((c) => c.city === city)) {
      setCity('all');
    }
  }, [country, city, citiesForCountry]);

  const benchmarksQuery = useQuery<Benchmark[]>({
    queryKey: ['salary', 'benchmarks', roleQuery.trim(), seniority, country, city],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (roleQuery.trim()) params.role = roleQuery.trim();
      if (seniority !== 'all') params.seniority = seniority;
      if (country !== 'all') params.country = country;
      if (city !== 'all') params.city = city;
      return (await api.get('/salary/benchmarks', { params })).data.data;
    }
  });

  // Group results by country for section headers, then by city for sort.
  const grouped = useMemo(() => {
    const rows = (benchmarksQuery.data ?? []).slice();
    rows.sort((a, b) => {
      if (a.country !== b.country) return a.country.localeCompare(b.country);
      if (a.city !== b.city) return a.city.localeCompare(b.city);
      const aIdx = SENIORITIES.indexOf(a.seniority as SeniorityKey);
      const bIdx = SENIORITIES.indexOf(b.seniority as SeniorityKey);
      return aIdx - bIdx;
    });
    const g: Record<string, Benchmark[]> = {};
    for (const r of rows) {
      if (!g[r.country]) g[r.country] = [];
      g[r.country]!.push(r);
    }
    return g;
  }, [benchmarksQuery.data]);

  const filteredAutocomplete = useMemo(() => {
    const q = roleQuery.trim().toLowerCase();
    if (!q) return [];
    return (rolesQuery.data ?? [])
      .filter((r) => r.toLowerCase().includes(q) && r.toLowerCase() !== q)
      .slice(0, 6);
  }, [roleQuery, rolesQuery.data]);

  return (
    <div className="space-y-6">
      {/* Filter card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
          <Filter size={14} /> Filters
        </div>

        {/* Role autocomplete */}
        <div className="relative max-w-xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={roleQuery}
            onChange={(e) => { setRoleQuery(e.target.value); setShowAutocomplete(true); }}
            onFocus={() => setShowAutocomplete(true)}
            onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
            placeholder="Search role — Software Engineer, ESG Consultant, Mining Engineer…"
            className="input w-full pl-9"
            aria-label="Search role"
          />
          {showAutocomplete && filteredAutocomplete.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
              {filteredAutocomplete.map((r) => (
                <button
                  key={r}
                  type="button"
                  onMouseDown={() => { setRoleQuery(r); setShowAutocomplete(false); }}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--bg)]"
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Seniority chips */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Seniority</div>
          <div className="flex flex-wrap gap-2">
            <FilterChip label="All" active={seniority === 'all'} onClick={() => setSeniority('all')} />
            {SENIORITIES.map((s) => (
              <FilterChip key={s} label={SENIORITY_LABEL[s]} active={seniority === s} onClick={() => setSeniority(s)} />
            ))}
          </div>
        </div>

        {/* Country chips */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Country</div>
          <div className="flex flex-wrap gap-2">
            <FilterChip label="All" active={country === 'all'} onClick={() => setCountry('all')} />
            {countries.map((c) => (
              <FilterChip key={c} label={c} active={country === c} onClick={() => setCountry(c)} />
            ))}
          </div>
        </div>

        {/* City chips (filtered by country if one selected) */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">City</div>
          <div className="flex flex-wrap gap-2">
            <FilterChip label="All" active={city === 'all'} onClick={() => setCity('all')} />
            {citiesForCountry.map((c) => (
              <FilterChip key={c.city} label={c.city} active={city === c.city} onClick={() => setCity(c.city)} />
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {benchmarksQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-24" />)}
        </div>
      ) : (benchmarksQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="No benchmarks match those filters"
          body="Loosen one or two filters, or run the seed if you're an admin and the database is empty."
        />
      ) : (
        <div className="space-y-8">
          {Object.keys(grouped).sort().map((countryName) => (
            <div key={countryName}>
              <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wider text-[var(--muted)]">
                <MapPin size={14} className="text-[#065F46] dark:text-[#84CC16]" />
                {countryName}
                <span className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-[var(--muted)]">
                  {grouped[countryName]!.length} rows
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[countryName]!.map((row, i) => (
                  <BenchmarkCard key={row.id} row={row} index={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BenchmarkCard({ row, index }: { row: Benchmark; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-heading text-base font-bold">{row.role}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <MapPin size={11} />
            <span>{row.city}</span>
          </div>
        </div>
        <span className="rounded-full bg-[#065F46]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          {SENIORITY_LABEL[row.seniority as SeniorityKey] ?? row.seniority}
        </span>
      </div>
      <div className="mt-3 font-heading text-lg font-extrabold text-[var(--fg)]">
        {formatMoney(row.minMonthly, row.currency)} – {formatMoney(row.maxMonthly, row.currency)}
        <span className="ml-1 text-xs font-semibold text-[var(--muted)]">/ month</span>
      </div>
      {(row.source || row.notes) && (
        <div className="mt-2 space-y-0.5 text-[11px] text-[var(--muted)]">
          {row.source && <div>Source: {row.source}</div>}
          {row.notes && <div className="italic">{row.notes}</div>}
        </div>
      )}
    </motion.div>
  );
}

// =================== Tab 2: Cost of Living ================================

function CostOfLivingTab() {
  const [cityA, setCityA] = useState<string>('Accra');
  const [cityB, setCityB] = useState<string>('London');
  const [baseCurrency, setBaseCurrency] = useState<string>('GHS');
  const [lifestyleAmount, setLifestyleAmount] = useState<number>(15000);
  const [lifestyleFrom, setLifestyleFrom] = useState<'A' | 'B'>('A');

  const colsQuery = useQuery<CityCost[]>({
    queryKey: ['salary', 'col'],
    queryFn: async () => (await api.get('/salary/cost-of-living')).data.data
  });

  const ratesQuery = useQuery<Record<string, number>>({
    queryKey: ['salary', 'rates'],
    queryFn: async () => (await api.get('/salary/exchange-rates')).data.data,
    staleTime: 24 * 60 * 60 * 1000
  });

  const cities = colsQuery.data ?? [];
  const rates = ratesQuery.data ?? {};

  const a = cities.find((c) => c.city === cityA);
  const b = cities.find((c) => c.city === cityB);

  if (colsQuery.isLoading || ratesQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="skeleton h-72" />
        <div className="skeleton h-72" />
      </div>
    );
  }

  if (cities.length === 0) {
    return (
      <EmptyState
        title="Cost-of-living data not loaded yet"
        body="An admin can run the salary seed to populate the city data."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* City pickers + base currency */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr_auto]">
          <CitySelect label="City A" value={cityA} options={cities} onChange={setCityA} />
          <div className="flex items-end justify-center pb-2">
            <ArrowRightLeft size={18} className="text-[var(--muted)]" />
          </div>
          <CitySelect label="City B" value={cityB} options={cities} onChange={setCityB} />
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Show in
            </label>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              className="input"
              aria-label="Base currency"
            >
              {ALL_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Side-by-side bar charts */}
      {a && b && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CostBreakdownCard city={a} baseCurrency={baseCurrency} rates={rates} />
          <CostBreakdownCard city={b} baseCurrency={baseCurrency} rates={rates} />
        </div>
      )}

      {/* Difference highlight */}
      {a && b && (
        <DifferenceBanner a={a} b={b} baseCurrency={baseCurrency} rates={rates} />
      )}

      {/* Lifestyle calculator */}
      {a && b && (
        <LifestyleCalculator
          a={a}
          b={b}
          baseCurrency={baseCurrency}
          rates={rates}
          amount={lifestyleAmount}
          setAmount={setLifestyleAmount}
          from={lifestyleFrom}
          setFrom={setLifestyleFrom}
        />
      )}
    </div>
  );
}

function CitySelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: CityCost[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          logActivity('compare_cities', { city: e.target.value, slot: label });
        }}
        className="input w-full"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.city} value={o.city}>{o.city} ({o.country})</option>
        ))}
      </select>
    </div>
  );
}

function CostBreakdownCard({ city, baseCurrency, rates }: {
  city: CityCost;
  baseCurrency: string;
  rates: Record<string, number>;
}) {
  const items = [
    { label: 'Rent (1BR center)', amount: city.rentMonthly, color: 'bg-[#065F46]' },
    { label: 'Groceries', amount: city.groceriesMonthly, color: 'bg-[#84CC16]' },
    { label: 'Transport', amount: city.transportMonthly, color: 'bg-[#F59E0B]' },
    { label: 'Utilities', amount: city.utilitiesMonthly, color: 'bg-[#FB7185]' }
  ];

  const max = Math.max(...items.map((i) => i.amount));
  const totalConverted = convert(city.totalMonthly, city.currency, baseCurrency, rates);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
            {city.country}
          </div>
          <h3 className="font-heading text-xl font-extrabold">{city.city}</h3>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Total / month
          </div>
          <div className="font-heading text-lg font-extrabold">
            {formatMoney(city.totalMonthly, city.currency)}
          </div>
          {city.currency !== baseCurrency && (
            <div className="text-xs text-[var(--muted)]">
              ≈ {formatMoney(totalConverted, baseCurrency)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const pct = max > 0 ? Math.round((item.amount / max) * 100) : 0;
          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--fg)]">{item.label}</span>
                <span className="text-[var(--muted)]">
                  {formatMoney(item.amount, city.currency)}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg)]">
                <motion.div
                  className={`h-full ${item.color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {city.notes && (
        <p className="mt-4 text-xs italic text-[var(--muted)]">{city.notes}</p>
      )}
    </div>
  );
}

function DifferenceBanner({ a, b, baseCurrency, rates }: {
  a: CityCost; b: CityCost; baseCurrency: string; rates: Record<string, number>;
}) {
  const aBase = convert(a.totalMonthly, a.currency, baseCurrency, rates);
  const bBase = convert(b.totalMonthly, b.currency, baseCurrency, rates);
  if (aBase === 0 || bBase === 0) return null;

  const more = bBase > aBase;
  const ratio = more ? bBase / aBase : aBase / bBase;
  const expensive = more ? b : a;
  const cheap = more ? a : b;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4">
      <Sparkles size={18} className="mt-0.5 flex-shrink-0 text-[#F59E0B]" />
      <div className="text-sm">
        <span className="font-bold">{expensive.city}</span> costs{' '}
        <span className="font-bold text-[#F59E0B]">{ratio.toFixed(1)}×</span>{' '}
        more per month than <span className="font-bold">{cheap.city}</span> when both
        baskets (rent + groceries + transport + utilities) are converted to{' '}
        <span className="font-bold">{baseCurrency}</span>.
      </div>
    </div>
  );
}

function LifestyleCalculator({
  a, b, baseCurrency, rates, amount, setAmount, from, setFrom
}: {
  a: CityCost; b: CityCost; baseCurrency: string; rates: Record<string, number>;
  amount: number; setAmount: (n: number) => void;
  from: 'A' | 'B'; setFrom: (v: 'A' | 'B') => void;
}) {
  const fromCity = from === 'A' ? a : b;
  const toCity = from === 'A' ? b : a;

  // Strategy: amount is in `baseCurrency`. Convert to fromCity.currency
  // for the cost-of-living ratio, then scale by the ratio of total
  // monthly costs in their local currencies (after both have been
  // normalised to GHS).
  const fromTotalGhs = convert(fromCity.totalMonthly, fromCity.currency, 'GHS', rates);
  const toTotalGhs = convert(toCity.totalMonthly, toCity.currency, 'GHS', rates);
  const ratio = fromTotalGhs > 0 ? toTotalGhs / fromTotalGhs : 0;

  const equivalent = amount * ratio;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
        <Calculator size={14} /> Lifestyle equivalent
      </div>
      <p className="mb-4 text-sm text-[var(--muted)]">
        What salary in <span className="font-semibold">{toCity.city}</span> matches your
        lifestyle in <span className="font-semibold">{fromCity.city}</span>?
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[auto_1fr_auto]">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Direction
          </label>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value as 'A' | 'B')}
            className="input"
            aria-label="Direction"
          >
            <option value="A">{a.city} → {b.city}</option>
            <option value="B">{b.city} → {a.city}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Your monthly take-home in {baseCurrency}
          </label>
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
            className="input w-full"
          />
        </div>
        <div className="flex items-end">
          <div className="rounded-xl border border-[#065F46]/40 bg-[#065F46]/5 px-4 py-3 dark:bg-[#84CC16]/10">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#065F46] dark:text-[#84CC16]">
              Equivalent in {toCity.city}
            </div>
            <div className="font-heading text-xl font-extrabold text-[#065F46] dark:text-[#84CC16]">
              {formatMoney(equivalent, baseCurrency)}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-[var(--muted)]">
        Based on a cost-of-living ratio of {ratio.toFixed(2)}× ({toCity.city} ÷ {fromCity.city}),
        using rent + groceries + transport + utilities. Tax and savings rates differ — adjust accordingly.
      </p>
    </div>
  );
}

// =================== Tab 3: Offer Analyzer ================================

type SavedOffer = {
  id: string;
  label: string;
  baseAmount: number;
  baseCurrency: string;
  basePeriod: 'monthly' | 'annual';
  signingBonus: number;
  annualBonusPct: number;
  equity4yr: number;
  remoteAllowance: number;
  pensionPct: number;
  healthMonthly: number;
  benchmarkRole: string;
  benchmarkSeniority: SeniorityKey;
  benchmarkCity: string;
  monthlyTotal: number;
  annualTotal: number;
  verdict: string;
  savedAt: string;
};

const STORAGE_KEY = 'uenr_salary_offers_v1';

function loadSavedOffers(): SavedOffer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSavedOffers(offers: SavedOffer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offers));
  } catch { /* quota; ignore */ }
}

function OfferAnalyzerTab() {
  const [baseAmount, setBaseAmount] = useState<number>(15000);
  const [baseCurrency, setBaseCurrency] = useState<string>('GHS');
  const [basePeriod, setBasePeriod] = useState<'monthly' | 'annual'>('monthly');
  const [signingBonus, setSigningBonus] = useState<number>(0);
  const [annualBonusPct, setAnnualBonusPct] = useState<number>(0);
  const [equity4yr, setEquity4yr] = useState<number>(0);
  const [remoteAllowance, setRemoteAllowance] = useState<number>(0);
  const [pensionPct, setPensionPct] = useState<number>(13); // SSNIT employer default
  const [healthMonthly, setHealthMonthly] = useState<number>(0);

  const [benchmarkRole, setBenchmarkRole] = useState<string>('');
  const [benchmarkSeniority, setBenchmarkSeniority] = useState<SeniorityKey>('mid');
  const [benchmarkCity, setBenchmarkCity] = useState<string>('Accra');

  const [savedOffers, setSavedOffers] = useState<SavedOffer[]>([]);
  useEffect(() => { setSavedOffers(loadSavedOffers()); }, []);

  const ratesQuery = useQuery<Record<string, number>>({
    queryKey: ['salary', 'rates'],
    queryFn: async () => (await api.get('/salary/exchange-rates')).data.data,
    staleTime: 24 * 60 * 60 * 1000
  });
  const rates = ratesQuery.data ?? {};

  const rolesQuery = useQuery<string[]>({
    queryKey: ['salary', 'roles'],
    queryFn: async () => (await api.get('/salary/benchmarks/roles')).data.data
  });

  const citiesQuery = useQuery<{ city: string; country: string; currency: string }[]>({
    queryKey: ['salary', 'cities'],
    queryFn: async () => (await api.get('/salary/benchmarks/cities')).data.data
  });

  // Pull matching benchmarks (typically 1 row, but be defensive).
  const matchedQuery = useQuery<Benchmark[]>({
    queryKey: ['salary', 'benchmarks-for-offer', benchmarkRole, benchmarkSeniority, benchmarkCity],
    queryFn: async () => {
      if (!benchmarkRole) return [];
      return (await api.get('/salary/benchmarks', {
        params: { role: benchmarkRole, seniority: benchmarkSeniority, city: benchmarkCity }
      })).data.data;
    },
    enabled: !!benchmarkRole
  });

  // ---- Compute total comp in base currency, monthly --------------------

  const totals = useMemo(() => {
    // Normalize base to monthly in baseCurrency.
    const baseMonthly = basePeriod === 'monthly' ? baseAmount : baseAmount / 12;

    // Annual bonus: % of annual base
    const annualBase = baseMonthly * 12;
    const annualBonus = annualBase * (annualBonusPct / 100);

    // Equity is given in USD over 4 years — convert to baseCurrency, then /48 months.
    const equityMonthly = (equity4yr > 0)
      ? convert(equity4yr / 48, 'USD', baseCurrency, rates)
      : 0;

    // Signing bonus amortised over 12 months for "monthly comp" view.
    const signingMonthly = signingBonus / 12;

    // Pension: only the employer contribution — that's real value to the
    // employee even if it doesn't hit their bank account. Compute on
    // monthly base.
    const pensionMonthly = baseMonthly * (pensionPct / 100);

    const monthlyTotal = baseMonthly
      + (annualBonus / 12)
      + equityMonthly
      + signingMonthly
      + remoteAllowance
      + pensionMonthly
      + healthMonthly;

    return {
      baseMonthly,
      annualBase,
      annualBonus,
      equityMonthly,
      signingMonthly,
      pensionMonthly,
      monthlyTotal,
      annualTotal: monthlyTotal * 12
    };
  }, [baseAmount, baseCurrency, basePeriod, annualBonusPct, equity4yr, signingBonus, remoteAllowance, pensionPct, healthMonthly, rates]);

  // ---- Verdict against benchmark ---------------------------------------

  const verdict = useMemo(() => {
    const benches = matchedQuery.data ?? [];
    if (benches.length === 0) {
      return {
        label: 'No benchmark match',
        tone: 'neutral' as const,
        explanation: 'Pick a role/seniority/city that exists in the benchmark dataset to compare.'
      };
    }
    // Compare base monthly only against benchmark ranges (apples to apples).
    // Convert base monthly into benchmark currency.
    const bench = benches[0]!;
    const baseInBenchCurrency = convert(totals.baseMonthly, baseCurrency, bench.currency, rates);
    const min = bench.minMonthly;
    const max = bench.maxMonthly;
    const median = (min + max) / 2;
    const p25 = min + (median - min) / 2;
    const p75 = median + (max - median) / 2;

    if (baseInBenchCurrency < p25) {
      return {
        label: 'Below 25th percentile',
        tone: 'low' as const,
        explanation: `Your base of ${formatMoney(baseInBenchCurrency, bench.currency)}/month sits below the typical 25th-percentile of ${formatMoney(p25, bench.currency)}. Strong case for a counter — see the playbooks.`
      };
    }
    if (baseInBenchCurrency <= p75) {
      return {
        label: 'Within typical range',
        tone: 'mid' as const,
        explanation: `Your base of ${formatMoney(baseInBenchCurrency, bench.currency)}/month is inside the typical range (${formatMoney(min, bench.currency)} – ${formatMoney(max, bench.currency)}). A 5-10% counter is still reasonable, especially if you have competing offers.`
      };
    }
    if (baseInBenchCurrency <= max) {
      return {
        label: 'Above 75th percentile',
        tone: 'high' as const,
        explanation: `Your base of ${formatMoney(baseInBenchCurrency, bench.currency)}/month is above the 75th-percentile of ${formatMoney(p75, bench.currency)}. Strong offer — focus the counter on equity, signing bonus, or learning budget rather than base.`
      };
    }
    return {
      label: 'Outlier high',
      tone: 'outlier' as const,
      explanation: `Your base of ${formatMoney(baseInBenchCurrency, bench.currency)}/month is above the typical max of ${formatMoney(max, bench.currency)}. Either the benchmark is stale, or this is an exceptional offer. Verify the role scope.`
    };
  }, [matchedQuery.data, totals.baseMonthly, baseCurrency, rates]);

  const verdictTone = (() => {
    switch (verdict.tone) {
      case 'low': return 'border-[#FB7185]/40 bg-[#FB7185]/10 text-[#FB7185]';
      case 'mid': return 'border-[#84CC16]/40 bg-[#84CC16]/10 text-[#65A30D] dark:text-[#84CC16]';
      case 'high': return 'border-[#065F46]/40 bg-[#065F46]/10 text-[#065F46] dark:text-[#84CC16]';
      case 'outlier': return 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]';
      default: return 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]';
    }
  })();

  const handleSave = () => {
    const offer: SavedOffer = {
      id: `offer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: `${benchmarkRole || 'Offer'} — ${benchmarkCity}`,
      baseAmount, baseCurrency, basePeriod,
      signingBonus, annualBonusPct, equity4yr,
      remoteAllowance, pensionPct, healthMonthly,
      benchmarkRole, benchmarkSeniority, benchmarkCity,
      monthlyTotal: totals.monthlyTotal,
      annualTotal: totals.annualTotal,
      verdict: verdict.label,
      savedAt: new Date().toISOString()
    };
    const next = [offer, ...savedOffers].slice(0, 8);
    setSavedOffers(next);
    saveSavedOffers(next);
    logActivity('analyze_offer', {
      role: benchmarkRole, city: benchmarkCity, verdict: verdict.label
    });
  };

  const handleDelete = (id: string) => {
    const next = savedOffers.filter((o) => o.id !== id);
    setSavedOffers(next);
    saveSavedOffers(next);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      {/* Form */}
      <div className="space-y-5">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
            <FileSearch size={14} /> The offer
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Base salary</label>
              <input
                type="number" min={0} value={baseAmount}
                onChange={(e) => setBaseAmount(Math.max(0, Number(e.target.value) || 0))}
                className="input w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Currency</label>
              <select value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)} className="input w-full">
                {ALL_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Period</label>
              <select value={basePeriod} onChange={(e) => setBasePeriod(e.target.value as 'monthly' | 'annual')} className="input w-full">
                <option value="monthly">per month</option>
                <option value="annual">per year</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <NumberField label="Signing bonus (one-time, in base currency)" value={signingBonus} onChange={setSigningBonus} />
            <NumberField label="Annual bonus (% of base)" value={annualBonusPct} onChange={setAnnualBonusPct} suffix="%" />
            <NumberField label="Equity / RSU value over 4 years (USD)" value={equity4yr} onChange={setEquity4yr} />
            <NumberField label="Remote allowance (per month, in base currency)" value={remoteAllowance} onChange={setRemoteAllowance} />
            <NumberField label="Pension / SSNIT employer contribution (%)" value={pensionPct} onChange={setPensionPct} suffix="%" />
            <NumberField label="Health benefits value (per month, in base currency)" value={healthMonthly} onChange={setHealthMonthly} />
          </div>
        </div>

        {/* Benchmark target */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
            <BarChart3 size={14} /> Compare against
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Role</label>
              <select value={benchmarkRole} onChange={(e) => setBenchmarkRole(e.target.value)} className="input w-full">
                <option value="">— pick a role —</option>
                {(rolesQuery.data ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Seniority</label>
              <select value={benchmarkSeniority} onChange={(e) => setBenchmarkSeniority(e.target.value as SeniorityKey)} className="input w-full">
                {SENIORITIES.map((s) => <option key={s} value={s}>{SENIORITY_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">City</label>
              <select value={benchmarkCity} onChange={(e) => setBenchmarkCity(e.target.value)} className="input w-full">
                {(citiesQuery.data ?? []).map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
              </select>
            </div>
          </div>

          {/* Verdict */}
          <div className={`mt-4 rounded-xl border p-4 ${verdictTone}`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              {verdict.tone === 'low' && <AlertCircle size={14} />}
              {verdict.tone === 'mid' && <CheckCircle2 size={14} />}
              {verdict.tone === 'high' && <TrendingUp size={14} />}
              {verdict.tone === 'outlier' && <Sparkles size={14} />}
              {verdict.tone === 'neutral' && <Info size={14} />}
              {verdict.label}
            </div>
            <p className="mt-1 text-sm text-[var(--fg)]">{verdict.explanation}</p>
          </div>
        </div>
      </div>

      {/* Sticky summary + saved offers */}
      <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
            <Sparkles size={14} /> Total compensation
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Monthly</div>
            <div className="font-heading text-2xl font-extrabold text-[var(--fg)]">
              {formatMoney(totals.monthlyTotal, baseCurrency)}
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Annual</div>
            <div className="font-heading text-xl font-extrabold text-[#065F46] dark:text-[#84CC16]">
              {formatMoney(totals.annualTotal, baseCurrency)}
            </div>
          </div>

          <div className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            <Row label="Base/month" value={formatMoney(totals.baseMonthly, baseCurrency)} />
            <Row label="Annual bonus/12" value={formatMoney(totals.annualBonus / 12, baseCurrency)} />
            <Row label="Equity (USD→base)" value={formatMoney(totals.equityMonthly, baseCurrency)} />
            <Row label="Signing/12" value={formatMoney(totals.signingMonthly, baseCurrency)} />
            <Row label="Remote allowance" value={formatMoney(remoteAllowance, baseCurrency)} />
            <Row label="Pension (employer)" value={formatMoney(totals.pensionMonthly, baseCurrency)} />
            <Row label="Health benefits" value={formatMoney(healthMonthly, baseCurrency)} />
          </div>

          <button onClick={handleSave} className="btn-primary mt-5 w-full">
            <Save size={16} /> Save this offer
          </button>
          <p className="mt-2 text-center text-[10px] text-[var(--muted)]">
            Saved to this browser only. Compare up to 8 offers in one session.
          </p>
        </div>

        {savedOffers.length > 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
              Saved offers
            </div>
            <ul className="space-y-2">
              {savedOffers.map((o) => (
                <li key={o.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-sm">{o.label}</div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {formatMoney(o.monthlyTotal, o.baseCurrency)}/mo · {o.verdict}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(o.id)}
                      aria-label="Delete saved offer"
                      className="rounded-md p-1 text-[var(--muted)] hover:bg-[#FB7185]/10 hover:text-[#FB7185]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, suffix }: {
  label: string; value: number; onChange: (n: number) => void; suffix?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </label>
      <div className="relative">
        <input
          type="number" min={0} value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="input w-full"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--muted)]">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-semibold text-[var(--fg)]">{value}</span>
    </div>
  );
}

// =================== Tab 4: Scripts & Playbooks ===========================

function ScriptsTab() {
  const [open, setOpen] = useState<string | null>(SALARY_PLAYBOOKS[0]?.slug ?? null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        {SALARY_PLAYBOOKS.map((p, i) => (
          <PlaybookSection
            key={p.slug}
            playbook={p}
            index={i}
            isOpen={open === p.slug}
            onToggle={() => setOpen(open === p.slug ? null : p.slug)}
          />
        ))}
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#065F46] dark:text-[#84CC16]">
            <BookOpen size={14} /> Index
          </div>
          <ul className="space-y-1.5 text-sm">
            {SALARY_PLAYBOOKS.map((p) => (
              <li key={p.slug}>
                <button
                  type="button"
                  onClick={() => setOpen(p.slug)}
                  className={`block w-full text-left transition-colors ${
                    open === p.slug
                      ? 'font-semibold text-[#065F46] dark:text-[#84CC16]'
                      : 'text-[var(--muted)] hover:text-[var(--fg)]'
                  }`}
                >
                  {p.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function PlaybookSection({ playbook, index, isOpen, onToggle }: {
  playbook: typeof SALARY_PLAYBOOKS[number];
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--bg)]/40"
      >
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#065F46]/10 text-[#065F46] dark:bg-[#84CC16]/15 dark:text-[#84CC16]">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold leading-snug">{playbook.title}</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{playbook.summary}</p>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-5 pb-5"
          >
            <PlaybookBody body={playbook.body} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Tiny markdown-ish renderer: paragraphs separated by blank lines,
// "- " bullets, "> " block quotes (we use these for example phrasing).
// Intentionally NOT a full markdown parser — keeps the bundle slim.
function PlaybookBody({ body }: { body: string }) {
  const blocks = body.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-[var(--fg)]">
      {blocks.map((block, i) => {
        const lines = block.split('\n').map((l) => l.trim());
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-[#84CC16]">
              {lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}
            </ul>
          );
        }
        if (lines.every((l) => l.startsWith('> '))) {
          return (
            <blockquote
              key={i}
              className="border-l-4 border-[#065F46] bg-[#065F46]/5 px-4 py-2 italic text-[var(--fg)] dark:border-[#84CC16] dark:bg-[#84CC16]/10"
            >
              {lines.map((l) => l.slice(2)).join(' ')}
            </blockquote>
          );
        }
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}

// =================== Shared UI ============================================

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/50 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F59E0B]/15 text-[#F59E0B]">
        <Building2 size={28} />
      </div>
      <h2 className="mt-5 font-heading text-xl font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">{body}</p>
    </div>
  );
}

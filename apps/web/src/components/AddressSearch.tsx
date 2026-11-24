'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { translator, type AddressSuggestion, type Locale } from '@zopf/shared';

export const formatAddress = (a: Pick<AddressSuggestion, 'street' | 'houseNumber' | 'zip' | 'city'>) =>
  `${`${a.street} ${a.houseNumber}`.trim()}, ${a.zip} ${a.city}`;

/**
 * Address field with suggestions (ARIA combobox): type, pick with the arrow
 * keys and Enter or by clicking. Asks the given endpoint 250 ms after the last
 * keystroke; only our own API, which searches the imported directory.
 */
export function AddressSearch({
  locale,
  endpoint,
  onSelect,
  inputClassName,
}: {
  locale: Locale;
  endpoint: string;
  onSelect: (address: AddressSuggestion) => void;
  inputClassName: string;
}) {
  const t = translator(locale);
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searched, setSearched] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(text)}`);
        const data = res.ok ? ((await res.json()) as AddressSuggestion[]) : [];
        // An older answer arriving late must not replace a newer one.
        if (ticket !== latest.current) return;
        setResults(data);
        setActive(data.length ? 0 : -1);
        setSearched(true);
      } catch {
        if (ticket === latest.current) setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, endpoint]);

  const choose = (address: AddressSuggestion) => {
    setQuery(formatAddress(address));
    setOpen(false);
    setResults([]);
    setSearched(false);
    onSelect(address);
  };

  const listId = `${id}-list`;
  const showList = open && (results.length > 0 || searched);

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        placeholder={t('addresses.placeholder')}
        value={query}
        className={inputClassName}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && open && active >= 0 && results[active]) {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {showList && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500">{t('addresses.none')}</p>
          ) : (
            results.map((address, index) => (
              <div
                key={address.id}
                tabIndex={-1}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                className={`cursor-pointer px-3 py-2 text-sm ${index === active ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(address);
                }}
                onMouseEnter={() => setActive(index)}
              >
                <span className="font-medium">{`${address.street} ${address.houseNumber}`.trim()}</span>
                <span className="text-zinc-500">
                  , {address.zip} {address.city}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

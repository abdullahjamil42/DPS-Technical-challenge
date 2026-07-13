import { useState, useCallback, useRef, useEffect } from 'react';
import styles from './SearchBar.module.css';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

/**
 * SearchBar component.
 *
 * Renders a search input with:
 * - 300ms debounce to avoid firing a request on every keystroke
 * - Inline validation message when query is 1–2 characters (too short)
 * - Clear button when input is non-empty
 * - Keyboard shortcut hint (/) to focus from anywhere
 *
 * The parent receives the debounced query via `onSearch`.
 * The raw (undebounced) value is displayed in the input for instant feedback.
 *
 * @param {{ onSearch: (query: string) => void }} props
 */
export function SearchBar({ onSearch }) {
  const [rawValue, setRawValue] = useState('');
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const handleChange = useCallback(
    (e) => {
      const value = e.target.value;
      setRawValue(value);

      // Clear any pending debounce timer
      clearTimeout(debounceRef.current);

      // If the field is empty, notify parent immediately (clear results)
      if (value === '') {
        onSearch('');
        return;
      }

      // Debounce: only fire onSearch after user pauses typing
      debounceRef.current = setTimeout(() => {
        onSearch(value);
      }, DEBOUNCE_MS);
    },
    [onSearch]
  );

  const handleClear = useCallback(() => {
    setRawValue('');
    onSearch('');
    inputRef.current?.focus();
  }, [onSearch]);

  // "/" keyboard shortcut to focus the search input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const isTooShort = rawValue.length > 0 && rawValue.length < MIN_QUERY_LENGTH;
  const charsNeeded = MIN_QUERY_LENGTH - rawValue.length;

  return (
    <div className={styles.wrapper} role="search">
      <div className={styles.inputRow}>
        <span className={styles.searchIcon} aria-hidden="true">🔍</span>

        <input
          ref={inputRef}
          id="station-search"
          type="search"
          className={styles.input}
          placeholder="Search station name… e.g. Bru, Gent, Antwerpen"
          value={rawValue}
          onChange={handleChange}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          aria-label="Search for train station"
          aria-describedby={isTooShort ? 'search-hint' : undefined}
        />

        {rawValue && (
          <button
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Clear search"
            type="button"
          >
            ✕
          </button>
        )}
      </div>

      {/* Validation hint */}
      {isTooShort && (
        <p
          id="search-hint"
          className={`${styles.hint} ${styles.hintError}`}
          role="status"
          aria-live="polite"
        >
          <span className={styles.hintIcon}>⚠</span>
          Type {charsNeeded} more character{charsNeeded !== 1 ? 's' : ''} to search
        </p>
      )}

      {!rawValue && (
        <p className={`${styles.hint} ${styles.hintInfo}`} aria-hidden="true">
          <span className={styles.hintIcon}>💡</span>
          Showing departures within the next 15 minutes — updates every 30s
        </p>
      )}

      <div className={styles.kbdHint} aria-hidden="true">
        Press <kbd>/</kbd> to focus search
      </div>
    </div>
  );
}

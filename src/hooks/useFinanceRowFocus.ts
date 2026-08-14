import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { FinanceTraceOrigin } from '../types/FinanceTrace';
import {
  financeFocusToken,
  parseFinanceFocus,
} from '../utils/financeTraceFocus';

interface UseFinanceRowFocusOptions<T> {
  records: T[];
  originForRecord: (record: T) => FinanceTraceOrigin;
  loading: boolean;
  pageSize?: number;
  setPage?: (page: number) => void;
  revealRecord?: (record: T) => void;
  rowRefs: MutableRefObject<Map<string, HTMLElement>>;
}

export interface FinanceRowFocusResult {
  focusedOrigin: FinanceTraceOrigin | null;
  focusedKey: string;
  focusError: string;
  hasBackSource: boolean;
  isFocused: (origin: FinanceTraceOrigin) => boolean;
  clearFocus: () => void;
  backToSource: () => void;
}

export function useFinanceRowFocus<T>({
  records,
  originForRecord,
  loading,
  pageSize,
  setPage,
  revealRecord,
  rowRefs,
}: UseFinanceRowFocusOptions<T>): FinanceRowFocusResult {
  const location = useLocation();
  const navigate = useNavigate();
  const handledToken = useRef('');
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const rawFocus = params.get('focus') || '';
  const focusedOrigin = useMemo(() => parseFinanceFocus(rawFocus), [rawFocus]);
  const focusedKey = focusedOrigin ? financeFocusToken(focusedOrigin) : '';
  const from = params.get('from') || '';

  const focusedRecord = useMemo(() => {
    if (!focusedOrigin) return undefined;
    return records.find((record) => (
      financeFocusToken(originForRecord(record)) === focusedKey
    ));
  }, [focusedKey, focusedOrigin, originForRecord, records]);

  useEffect(() => {
    if (!focusedRecord || !focusedKey || handledToken.current === focusedKey) return;
    revealRecord?.(focusedRecord);
    const index = records.indexOf(focusedRecord);
    if (setPage && pageSize && pageSize > 0 && index >= 0) {
      setPage(Math.floor(index / pageSize));
    }
    handledToken.current = focusedKey;
    const frame = window.requestAnimationFrame(() => {
      rowRefs.current.get(focusedKey)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedKey, focusedRecord, pageSize, records, revealRecord, rowRefs, setPage]);

  useEffect(() => {
    if (handledToken.current && handledToken.current !== focusedKey) {
      handledToken.current = '';
    }
  }, [focusedKey]);

  const clearFocus = useCallback(() => {
    const next = new URLSearchParams(location.search);
    next.delete('focus');
    next.delete('from');
    handledToken.current = '';
    navigate({
      pathname: location.pathname,
      search: next.toString() ? `?${next.toString()}` : '',
    }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const backToSource = useCallback(() => {
    if (from) navigate(from);
  }, [from, navigate]);

  const isFocused = useCallback((origin: FinanceTraceOrigin) => (
    Boolean(focusedKey) && financeFocusToken(origin) === focusedKey
  ), [focusedKey]);

  let focusError = '';
  if (rawFocus && !focusedOrigin) focusError = 'Invalid money trail link.';
  else if (focusedOrigin && !loading && !focusedRecord) focusError = 'Finance record not found.';

  return {
    focusedOrigin,
    focusedKey,
    focusError,
    hasBackSource: Boolean(from),
    isFocused,
    clearFocus,
    backToSource,
  };
}

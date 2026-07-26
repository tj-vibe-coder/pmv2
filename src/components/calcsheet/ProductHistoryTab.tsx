import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  fetchProductHistory,
  fetchProductHistorySuggestion,
} from '../../services/productHistoryService';
import type {
  ProductHistoryAddSelection,
  ProductHistoryObservation,
  ProductHistorySuggestion,
} from '../../types/ProductHistory';

interface Props {
  active: boolean;
  analysisDate: string;
  expectedPurchaseDate: string;
  defaultContingencyPct: number;
  onAdd: (selection: ProductHistoryAddSelection) => void;
}

const projectStatuses = [
  ['draft', 'Draft'],
  ['for_review', 'For review'],
  ['sent', 'Sent'],
  ['won', 'Won'],
  ['lost', 'Lost'],
  ['inactive', 'Inactive'],
] as const;

const sortOptions = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['price_asc', 'Cost: low to high'],
  ['price_desc', 'Cost: high to low'],
] as const;

const php = (value: number | null) => value == null
  ? 'Unavailable'
  : `PHP ${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const titleCase = (value: string) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalized = (value?: string) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const errorMessage = (error: unknown, fallback: string) => (
  error instanceof Error && error.message ? error.message : fallback
);

export default function ProductHistoryTab({
  active,
  analysisDate,
  expectedPurchaseDate,
  defaultContingencyPct,
  onAdd,
}: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [rows, setRows] = useState<ProductHistoryObservation[]>([]);
  const [selected, setSelected] = useState<ProductHistoryObservation | null>(null);
  const [suggestion, setSuggestion] = useState<ProductHistorySuggestion | null>(null);
  const [applySuggestion, setApplySuggestion] = useState(false);
  const [targetDate, setTargetDate] = useState(expectedPurchaseDate);
  const [confirmedCandidateIds, setConfirmedCandidateIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionRetryCount, setSuggestionRetryCount] = useState(0);
  const suggestionRequestId = useRef(0);

  useEffect(() => {
    suggestionRequestId.current += 1;
    setTargetDate(expectedPurchaseDate);
  }, [expectedPurchaseDate]);

  useEffect(() => {
    if (!active) return undefined;

    let current = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchProductHistory({
          search,
          status,
          sort,
          limit: 50,
        });
        if (current) setRows(result.items);
      } catch (requestError) {
        if (current) {
          setRows([]);
          setError(errorMessage(requestError, 'Failed to load quotation history'));
        }
      } finally {
        if (current) setLoading(false);
      }
    }, search ? 300 : 0);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [active, retryCount, search, sort, status]);

  const requestSuggestion = useCallback(async (
    observation: ProductHistoryObservation,
    candidateIds: string[],
  ) => {
    const requestId = ++suggestionRequestId.current;
    setSuggestionLoading(true);
    setSuggestionError(null);
    setSuggestion(null);
    setApplySuggestion(false);
    try {
      const result = await fetchProductHistorySuggestion({
        selectedObservationId: observation.observationId,
        confirmedCandidateObservationIds: candidateIds,
        analysisDate,
        expectedPurchaseDate: targetDate,
      });
      if (requestId === suggestionRequestId.current) setSuggestion(result);
    } catch (requestError) {
      if (requestId === suggestionRequestId.current) {
        setSuggestionError(errorMessage(
          requestError,
          'Could not calculate a contingency suggestion',
        ));
      }
    } finally {
      if (requestId === suggestionRequestId.current) setSuggestionLoading(false);
    }
  }, [analysisDate, targetDate]);

  useEffect(() => {
    if (!active) {
      suggestionRequestId.current += 1;
      setSuggestion(null);
      setSuggestionError(null);
      setSuggestionLoading(false);
      setApplySuggestion(false);
      return;
    }
    if (!selected) return;
    void requestSuggestion(selected, confirmedCandidateIds);
  }, [
    active,
    confirmedCandidateIds,
    requestSuggestion,
    selected,
    suggestionRetryCount,
  ]);

  const candidateRows = useMemo(() => {
    if (!selected || selected.productKey) return [];
    const selectedBrand = normalized(selected.brand);
    const selectedDescription = normalized(selected.description);
    return rows.filter((candidate) => (
      candidate.observationId !== selected.observationId
      && !candidate.productKey
      && normalized(candidate.brand) === selectedBrand
      && normalized(candidate.description) === selectedDescription
    ));
  }, [rows, selected]);

  const trendMaximum = useMemo(() => Math.max(
    1,
    ...(suggestion?.included.map((entry) => entry.normalizedUnitCost ?? 0) ?? []),
  ), [suggestion]);

  const selectObservation = (observation: ProductHistoryObservation) => {
    suggestionRequestId.current += 1;
    setSelected(observation);
    setConfirmedCandidateIds([]);
    setTargetDate(expectedPurchaseDate);
    setSuggestion(null);
    setSuggestionError(null);
    setApplySuggestion(false);
  };

  const updateCandidate = (observationId: string, checked: boolean) => {
    suggestionRequestId.current += 1;
    setConfirmedCandidateIds((current) => checked
      ? [...current, observationId]
      : current.filter((id) => id !== observationId));
  };

  const invalidTargetDate = !targetDate || targetDate < analysisDate;
  const canAddSelected = Boolean(
    selected?.quotationDate
    && selected.normalizedUnitCost != null
    && Number.isFinite(selected.normalizedUnitCost)
    && selected.normalizedUnitCost > 0
    && !invalidTargetDate
  );

  const handleAdd = () => {
    if (!selected || !canAddSelected) return;
    onAdd({
      observation: selected,
      suggestion,
      applySuggestion,
      expectedPurchaseDateOverride:
        targetDate === expectedPurchaseDate ? undefined : targetDate,
    });
  };

  if (!active) return null;

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 3fr) minmax(320px, 2fr)' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            component="form"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <TextField
              label="Search quotation history"
              type="search"
              size="small"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Part no., product, project, or quotation"
              fullWidth
            />
            <TextField
              select
              label="Project status"
              size="small"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              sx={{ minWidth: 145 }}
            >
              <MenuItem value="">All statuses</MenuItem>
              {projectStatuses.map(([value, label]) => (
                <MenuItem key={value} value={value}>{label}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Sort results"
              size="small"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              sx={{ minWidth: 165 }}
            >
              {sortOptions.map(([value, label]) => (
                <MenuItem key={value} value={value}>{label}</MenuItem>
              ))}
            </TextField>
          </Stack>

          {error && (
            <Alert
              severity="error"
              action={(
                <Button color="inherit" size="small" onClick={() => setRetryCount((n) => n + 1)}>
                  Retry
                </Button>
              )}
            >
              {error}
            </Alert>
          )}

          {loading && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="center"
              role="status"
              aria-label="Loading quotation history"
              sx={{ py: 4 }}
            >
              <CircularProgress size={24} />
              <Typography variant="body2">Loading quotation history…</Typography>
            </Stack>
          )}

          {!loading && !error && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small" aria-label="Quotation history results">
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell>Source project</TableCell>
                    <TableCell>Quotation</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Cost</TableCell>
                    <TableCell align="right">Quoted</TableCell>
                    <TableCell align="right">Suggested contingency</TableCell>
                    <TableCell>Confidence</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.observationId}
                      selected={selected?.observationId === row.observationId}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {row.description || 'Unnamed product'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {[row.brand, row.partNo, row.uom].filter(Boolean).join(' · ') || 'No catalog number'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{row.projectName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.projectCode}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{row.quotationReference}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {row.quotationKind} · Rev {row.quotationRevision}
                        </Typography>
                        <Chip
                          label={titleCase(row.projectStatus)}
                          size="small"
                          variant="outlined"
                          sx={{ mt: 0.5 }}
                        />
                      </TableCell>
                      <TableCell>
                        {row.quotationDate || 'Missing date'}
                        {row.quotationDateSource === 'createdAt' && (
                          <Typography variant="caption" color="warning.main" display="block">
                            Fallback
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">{php(row.normalizedUnitCost)}</TableCell>
                      <TableCell align="right">{php(row.quotedSellingUnit)}</TableCell>
                      <TableCell align="right">
                        {selected?.observationId === row.observationId
                          && suggestion?.status === 'ready'
                          ? `${suggestion.suggestedContingencyPct}%`
                          : selected?.observationId === row.observationId && suggestionLoading
                            ? 'Calculating…'
                            : 'Review'}
                      </TableCell>
                      <TableCell>
                        {selected?.observationId === row.observationId
                          && suggestion?.confidence
                          ? titleCase(suggestion.confidence)
                          : '—'}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          aria-label={`Select ${row.description}`}
                          onClick={() => selectObservation(row)}
                        >
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        No quotation history matches these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>

        <Paper variant="outlined" sx={{ p: 2, minHeight: 220 }}>
          {!selected ? (
            <Stack spacing={0.5}>
              <Typography variant="h6">Suggestion evidence</Typography>
              <Typography variant="body2" color="text.secondary">
                Review a historical product to inspect its source and calculate a contingency.
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Box>
                <Typography variant="h6">{selected.description}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {selected.quotationReference}
                </Typography>
                <Typography variant="body2">
                  {selected.projectName} · {selected.quotationKind} revision {selected.quotationRevision}
                </Typography>
                <Typography variant="body2">
                  Source date: {selected.quotationDate || 'Missing date'}
                </Typography>
              </Box>

              {selected.quotationDateSource === 'createdAt' && (
                <Alert severity="warning">Fallback date</Alert>
              )}
              {selected.quotationDateSource === 'missing' && (
                <Alert severity="warning">
                  Missing quotation date; this row cannot contribute to a trend.
                </Alert>
              )}

              <TextField
                label="This product expected purchase date"
                type="date"
                size="small"
                value={targetDate}
                onChange={(event) => {
                  suggestionRequestId.current += 1;
                  setTargetDate(event.target.value);
                }}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: analysisDate }}
                error={invalidTargetDate}
                helperText={invalidTargetDate
                  ? targetDate
                    ? 'Expected purchase date cannot be before the quotation date'
                    : 'Expected purchase date is required'
                  : targetDate === expectedPurchaseDate
                    ? 'Using quotation-level or assumed purchase date'
                    : 'Product-level override'}
              />

              {!selected.productKey && (
                <Box>
                  <Typography variant="subtitle2">Confirm same product</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Only checked description matches will be used as evidence.
                  </Typography>
                  {candidateRows.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      No visible candidate matches.
                    </Typography>
                  ) : candidateRows.map((candidate) => (
                    <FormControlLabel
                      key={candidate.observationId}
                      control={(
                        <Checkbox
                          checked={confirmedCandidateIds.includes(candidate.observationId)}
                          onChange={(_event, checked) => updateCandidate(
                            candidate.observationId,
                            checked,
                          )}
                        />
                      )}
                      label={`${candidate.quotationReference} · ${candidate.quotationDate || 'Missing date'} · ${candidate.projectName}`}
                    />
                  ))}
                </Box>
              )}

              {suggestionLoading && (
                <Stack direction="row" spacing={1} alignItems="center" role="status">
                  <CircularProgress size={20} />
                  <Typography variant="body2">Calculating suggestion…</Typography>
                </Stack>
              )}

              {suggestionError && (
                <Alert
                  severity="error"
                  action={(
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => setSuggestionRetryCount((n) => n + 1)}
                    >
                      Retry suggestion
                    </Button>
                  )}
                >
                  {suggestionError}
                </Alert>
              )}

              {suggestion?.status === 'insufficient_history' && (
                <Alert severity="info">Insufficient history</Alert>
              )}

              {suggestion?.status === 'ready' && (
                <Stack spacing={1.5} aria-live="polite">
                  <Box>
                    <Typography variant="overline">Suggested contingency</Typography>
                    <Typography variant="h4">
                      {suggestion.suggestedContingencyPct}%
                    </Typography>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      {suggestion.method && (
                        <Chip label={titleCase(suggestion.method)} size="small" />
                      )}
                      {suggestion.confidence && (
                        <Chip
                          label={titleCase(suggestion.confidence)}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      <Chip
                        label={`Current default ${defaultContingencyPct}%`}
                        size="small"
                        variant="outlined"
                      />
                    </Stack>
                  </Box>

                  {suggestion.highRisk && (
                    <Alert severity="warning">
                      High-risk suggestion: this exceeds 50%. Review the evidence before applying.
                    </Alert>
                  )}

                  <Box>
                    <Typography variant="subtitle2">Price trend</Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {suggestion.rate != null && suggestion.method
                        ? `${(suggestion.rate * 100).toFixed(2)}% ${suggestion.method} rate`
                        : 'Rate unavailable'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {suggestion.forecastDays != null
                        ? `${Math.round(suggestion.forecastDays)}-day forecast interval`
                        : `${selected.quotationDate || 'Missing source date'} to ${targetDate}`}
                    </Typography>
                    <Stack spacing={0.75} sx={{ mt: 1 }}>
                      {suggestion.included.map((entry) => (
                        <Box
                          key={entry.observationId}
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: '82px minmax(40px, 1fr) auto',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          <Typography variant="caption">
                            {entry.quotationDate || 'No date'}
                          </Typography>
                          <Box
                            role="img"
                            aria-label={`${entry.quotationReference}: ${php(entry.normalizedUnitCost)}`}
                            sx={{
                              height: 8,
                              width: `${Math.max(
                                4,
                                ((entry.normalizedUnitCost ?? 0) / trendMaximum) * 100,
                              )}%`,
                              bgcolor: 'primary.main',
                              borderRadius: 1,
                            }}
                          />
                          <Typography variant="caption">
                            {php(entry.normalizedUnitCost)}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2">
                      Included evidence ({suggestion.included.length})
                    </Typography>
                    {suggestion.included.map((entry) => (
                      <Typography key={entry.observationId} variant="body2">
                        {entry.quotationReference} · {entry.quotationDate || 'Missing date'} · {php(entry.normalizedUnitCost)}
                      </Typography>
                    ))}
                  </Box>

                  {suggestion.excluded.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2">
                        Excluded evidence ({suggestion.excluded.length})
                      </Typography>
                      {suggestion.excluded.map((entry) => (
                        <Typography key={entry.observationId} variant="body2">
                          {entry.observationId} · {titleCase(entry.reason)}
                        </Typography>
                      ))}
                    </Box>
                  )}

                  <Button
                    variant={applySuggestion ? 'outlined' : 'contained'}
                    onClick={() => setApplySuggestion((value) => !value)}
                  >
                    {applySuggestion
                      ? 'Use default contingency'
                      : `Apply ${suggestion.suggestedContingencyPct}% suggestion`}
                  </Button>
                </Stack>
              )}

              <Button variant="contained" onClick={handleAdd} disabled={!canAddSelected}>
                Add product to quotation
              </Button>
            </Stack>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

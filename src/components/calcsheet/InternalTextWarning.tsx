import { Alert, Box, Typography } from '@mui/material';
import type { InternalTextFinding } from '../../utils/calcsheet/internalText';

const SHOWN = 8;
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Shown before an export when printed fields look like they hold team-only wording (see findInternalLookingText).
export default function InternalTextWarning({ findings }: { findings: InternalTextFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <Alert severity="warning" sx={{ mb: 2 }} data-testid="internal-text-warning">
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Possible internal text in {findings.length} printed field{findings.length === 1 ? '' : 's'}
      </Typography>
      <Typography variant="body2" sx={{ mb: 0.5 }}>
        These print on the quotation. Price-source notes belong in the line's internal note (the note icon), which never prints.
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {findings.slice(0, SHOWN).map((f, i) => (
          <li key={`${f.section}-${f.code}-${f.field}-${i}`}>
            <Typography variant="caption">
              <strong>{f.code || f.section}</strong> · {f.field}: “{clip(f.text)}” <em>({f.matches.join(', ')})</em>
            </Typography>
          </li>
        ))}
      </Box>
      {findings.length > SHOWN && <Typography variant="caption">…and {findings.length - SHOWN} more.</Typography>}
    </Alert>
  );
}

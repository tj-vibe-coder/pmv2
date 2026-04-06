import React from 'react';
import { Box, Button, Divider, GlobalStyles, Typography } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Payslip } from '../../types/Payroll';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

interface RowProps { label: string; value: number; bold?: boolean; indent?: boolean }
const Row: React.FC<RowProps> = ({ label, value, bold, indent }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25, pl: indent ? 2 : 0 }}>
    <Typography variant="body2" sx={{ fontWeight: bold ? 700 : 400 }}>{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: bold ? 700 : 400 }}>{fmt(value)}</Typography>
  </Box>
);

interface Props {
  payslip: Payslip;
  onBack?: () => void;
}

const PayslipCard: React.FC<Props> = ({ payslip: s, onBack }) => {
  const emp = s.employeeSnapshot;
  const rate = emp.employeeType === 'FIELD'
    ? `₱${fmt(emp.dailyRate ?? 0)}/day`
    : `₱${fmt(emp.monthlyRate ?? 0)}/mo`;

  const totalOT = s.otPayRegular + s.otPayRestDay + s.otPayRegularHoliday;
  const earningSubtotal = s.basicPay + s.mealAllowance + totalOT + s.nightDifferential +
    s.regularHolidayPay + s.specialHolidayPay + s.adjustment;

  return (
    <>
      <GlobalStyles styles={{
        '@media print': {
          'body *': { visibility: 'hidden' },
          '.payslip-print-area, .payslip-print-area *': { visibility: 'visible' },
          '.payslip-print-area': { position: 'absolute', left: 0, top: 0, width: '100%' },
          '.no-print': { display: 'none !important' },
        }
      }} />

      {/* Controls — hidden on print */}
      <Box className="no-print" sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        {onBack && (
          <Button startIcon={<ArrowBackIcon />} onClick={onBack}>Back</Button>
        )}
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}
          sx={{ bgcolor: '#2853c0' }}>
          Print Payslip
        </Button>
      </Box>

      {/* Payslip — visible on print */}
      <Box className="payslip-print-area" sx={{
        maxWidth: 700,
        mx: 'auto',
        border: '1px solid #ccc',
        borderRadius: 2,
        overflow: 'hidden',
        fontFamily: 'Arial, sans-serif',
        bgcolor: 'white',
      }}>
        {/* Header */}
        <Box sx={{ bgcolor: '#2c3242', color: 'white', p: 2, textAlign: 'center' }}>
          <Typography variant="h6" fontWeight={700} letterSpacing={1}>IO CONTROL TECHNOLOGIE OPC</Typography>
          <Typography variant="caption">IOCT Payroll System</Typography>
        </Box>

        {/* Employee Info */}
        <Box sx={{ p: 2, bgcolor: '#f5f7fa', borderBottom: '1px solid #ddd' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">EMPLOYEE NO.</Typography>
              <Typography fontWeight={600}>{emp.employeeNumber}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">NAME</Typography>
              <Typography fontWeight={600}>{emp.name}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">DESIGNATION</Typography>
              <Typography fontWeight={600}>{emp.designation}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">RATE</Typography>
              <Typography fontWeight={600}>{rate}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">MEAL ALLOW.</Typography>
              <Typography fontWeight={600}>₱{fmt(emp.mealAllowance ?? 0)}/day</Typography>
            </Box>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {s.payrollRunId && (
              <Box>
                <Typography variant="caption" color="text.secondary">PAY DATE</Typography>
                <Typography variant="body2">{s.computedAt ? fmtDate(s.computedAt) : '—'}</Typography>
              </Box>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary">WORKING DAYS</Typography>
              <Typography variant="body2">{s.workingDays}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">REG HRS</Typography>
              <Typography variant="body2">{s.regularHours}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">OT HRS</Typography>
              <Typography variant="body2">{s.overtimeHours}</Typography>
            </Box>
          </Box>
        </Box>

        {/* Earnings | Deductions */}
        <Box sx={{ display: 'flex', gap: 0 }}>
          {/* Earnings */}
          <Box sx={{ flex: 1, p: 2, borderRight: '1px solid #ddd' }}>
            <Typography variant="subtitle2" fontWeight={700} color="#2853c0" mb={1}>EARNINGS</Typography>
            <Row label="Basic Pay" value={s.basicPay} />
            <Row label="Meal Allowance" value={s.mealAllowance} />
            {s.otPayRegular > 0 && <Row label="OT (Regular)" value={s.otPayRegular} indent />}
            {s.otPayRestDay > 0 && <Row label="OT (Rest Day / SNWH)" value={s.otPayRestDay} indent />}
            {s.otPayRegularHoliday > 0 && <Row label="OT (Regular Holiday)" value={s.otPayRegularHoliday} indent />}
            {s.regularHolidayPay > 0 && <Row label="Regular Holiday Pay" value={s.regularHolidayPay} />}
            {s.specialHolidayPay > 0 && <Row label="Special Holiday Pay" value={s.specialHolidayPay} />}
            {s.nightDifferential > 0 && <Row label="Night Differential" value={s.nightDifferential} />}
            {s.adjustment !== 0 && <Row label="Adjustment" value={s.adjustment} />}
            <Divider sx={{ my: 1 }} />
            <Row label="Sub-Total" value={earningSubtotal} bold />
          </Box>

          {/* Deductions */}
          <Box sx={{ flex: 1, p: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} color="#c62828" mb={1}>DEDUCTIONS</Typography>
            <Row label="SSS" value={s.empSSS} />
            <Row label="PhilHealth" value={s.empPhilhealth} />
            <Row label="Pag-IBIG" value={s.empPagibig} />
            <Row label="Withholding Tax" value={s.withholdingTax} />
            {s.tardinessDeduction > 0 && <Row label="Tardiness" value={s.tardinessDeduction} />}
            {s.otherDeduction > 0 && <Row label="Other Deduction" value={s.otherDeduction} />}
            <Divider sx={{ my: 1 }} />
            <Row label="Sub-Total" value={s.totalDeductions} bold />
          </Box>
        </Box>

        {/* Net Pay */}
        <Box sx={{ bgcolor: '#2853c0', color: 'white', p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={700}>NET PAY</Typography>
          <Typography variant="h5" fontWeight={800}>₱{fmt(s.netPay)}</Typography>
        </Box>

        {/* Signature block */}
        <Box sx={{ p: 2, display: 'flex', gap: 4 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">Prepared by</Typography>
            <Box sx={{ borderBottom: '1px solid #999', mt: 4, mb: 0.5 }} />
            <Typography variant="caption">Signature / Date</Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">Received by (Employee)</Typography>
            <Box sx={{ borderBottom: '1px solid #999', mt: 4, mb: 0.5 }} />
            <Typography variant="caption">Signature / Date</Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary">Remarks</Typography>
            <Box sx={{ borderBottom: '1px solid #999', mt: 4, mb: 0.5 }} />
            <Typography variant="caption">&nbsp;</Typography>
          </Box>
        </Box>
      </Box>
    </>
  );
};

export default PayslipCard;

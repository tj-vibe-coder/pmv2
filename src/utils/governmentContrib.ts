/**
 * Philippine Government Mandatory Contributions
 * SSS: R.A. 11199 (2025 rates)
 * PhilHealth: Circular 2023-0014 (5% rate)
 * Pag-IBIG: HDMF circular
 */

// SSS contribution table — salary ranges map to Monthly Salary Credit (MSC)
const SSS_TABLE: { min: number; max: number; msc: number }[] = [
  { min: 0,      max: 4249.99,  msc: 4000  },
  { min: 4250,   max: 4749.99,  msc: 4500  },
  { min: 4750,   max: 5249.99,  msc: 5000  },
  { min: 5250,   max: 5749.99,  msc: 5500  },
  { min: 5750,   max: 6249.99,  msc: 6000  },
  { min: 6250,   max: 6749.99,  msc: 6500  },
  { min: 6750,   max: 7249.99,  msc: 7000  },
  { min: 7250,   max: 7749.99,  msc: 7500  },
  { min: 7750,   max: 8249.99,  msc: 8000  },
  { min: 8250,   max: 8749.99,  msc: 8500  },
  { min: 8750,   max: 9249.99,  msc: 9000  },
  { min: 9250,   max: 9749.99,  msc: 9500  },
  { min: 9750,   max: 10249.99, msc: 10000 },
  { min: 10250,  max: 10749.99, msc: 10500 },
  { min: 10750,  max: 11249.99, msc: 11000 },
  { min: 11250,  max: 11749.99, msc: 11500 },
  { min: 11750,  max: 12249.99, msc: 12000 },
  { min: 12250,  max: 12749.99, msc: 12500 },
  { min: 12750,  max: 13249.99, msc: 13000 },
  { min: 13250,  max: 13749.99, msc: 13500 },
  { min: 13750,  max: 14249.99, msc: 14000 },
  { min: 14250,  max: 14749.99, msc: 14500 },
  { min: 14750,  max: 15249.99, msc: 15000 },
  { min: 15250,  max: 15749.99, msc: 15500 },
  { min: 15750,  max: 16249.99, msc: 16000 },
  { min: 16250,  max: 16749.99, msc: 16500 },
  { min: 16750,  max: 17249.99, msc: 17000 },
  { min: 17250,  max: 17749.99, msc: 17500 },
  { min: 17750,  max: 18249.99, msc: 18000 },
  { min: 18250,  max: 18749.99, msc: 18500 },
  { min: 18750,  max: 19249.99, msc: 19000 },
  { min: 19250,  max: 19749.99, msc: 19500 },
  { min: 19750,  max: 20249.99, msc: 20000 },
  { min: 20250,  max: 20749.99, msc: 20500 },
  { min: 20750,  max: 21249.99, msc: 21000 },
  { min: 21250,  max: 21749.99, msc: 21500 },
  { min: 21750,  max: 22249.99, msc: 22000 },
  { min: 22250,  max: 22749.99, msc: 22500 },
  { min: 22750,  max: 23249.99, msc: 23000 },
  { min: 23250,  max: 23749.99, msc: 23500 },
  { min: 23750,  max: 24249.99, msc: 24000 },
  { min: 24250,  max: 24749.99, msc: 24500 },
  { min: 24750,  max: 25249.99, msc: 25000 },
  { min: 25250,  max: 25749.99, msc: 25500 },
  { min: 25750,  max: 26249.99, msc: 26000 },
  { min: 26250,  max: 26749.99, msc: 26500 },
  { min: 26750,  max: 27249.99, msc: 27000 },
  { min: 27250,  max: 27749.99, msc: 27500 },
  { min: 27750,  max: 28249.99, msc: 28000 },
  { min: 28250,  max: 28749.99, msc: 28500 },
  { min: 28750,  max: 29249.99, msc: 29000 },
  { min: 29250,  max: 29749.99, msc: 29500 },
  { min: 29750,  max: Infinity,  msc: 30000 },
];

export interface ContribRates {
  philhealthRate: number;
  philhealthMin: number;
  philhealthMax: number;
  pagibigCap: number;
  sssEmployeeRate: number;
  sssEmployerRate: number;
}

export const CONTRIB_DEFAULTS: ContribRates = {
  philhealthRate: 0.05,
  philhealthMin: 500,
  philhealthMax: 5000,
  pagibigCap: 100,
  sssEmployeeRate: 0.045,
  sssEmployerRate: 0.085,
};

/**
 * Compute SSS contribution based on monthly basic pay.
 * Employee share: sssEmployeeRate of MSC
 * Employer share: sssEmployerRate of MSC + EC (₱10 for MSC ≤ ₱14,750, ₱30 above)
 */
export function computeSSS(
  monthlyBasicPay: number,
  rates: ContribRates = CONTRIB_DEFAULTS
): { employee: number; employer: number } {
  const row = SSS_TABLE.find((r) => monthlyBasicPay >= r.min && monthlyBasicPay <= r.max);
  const msc = row ? row.msc : 30000;
  const ec = msc <= 14750 ? 10 : 30;
  return {
    employee: msc * rates.sssEmployeeRate,
    employer: msc * rates.sssEmployerRate + ec,
  };
}

/**
 * Compute PhilHealth contribution.
 * Rate: philhealthRate of basic monthly salary, shared equally.
 * Min/max capped per circular.
 */
export function computePhilhealth(
  monthlyBasicPay: number,
  rates: ContribRates = CONTRIB_DEFAULTS
): { employee: number; employer: number } {
  const premium = Math.min(
    Math.max(monthlyBasicPay * rates.philhealthRate, rates.philhealthMin),
    rates.philhealthMax
  );
  const half = premium / 2;
  return { employee: half, employer: half };
}

/**
 * Compute Pag-IBIG (HDMF) contribution.
 * Employee: 1% if salary ≤ ₱1,500; 2% if > ₱1,500 (max pagibigCap/month)
 * Employer: 2% (max pagibigCap/month)
 */
export function computePagibig(
  monthlyBasicPay: number,
  rates: ContribRates = CONTRIB_DEFAULTS
): { employee: number; employer: number } {
  const empRate = monthlyBasicPay <= 1500 ? 0.01 : 0.02;
  return {
    employee: Math.min(monthlyBasicPay * empRate, rates.pagibigCap),
    employer: Math.min(monthlyBasicPay * 0.02, rates.pagibigCap),
  };
}

/**
 * Divide monthly contribution to per-period amount.
 * WEEKLY: divide by 4.33 (average weeks/month)
 * SEMI_MONTHLY: divide by 2
 * MONTHLY: no division
 */
export function toPerPeriod(monthlyAmount: number, frequency: 'WEEKLY' | 'SEMI_MONTHLY' | 'MONTHLY'): number {
  if (frequency === 'WEEKLY') return monthlyAmount / 4.33;
  if (frequency === 'SEMI_MONTHLY') return monthlyAmount / 2;
  return monthlyAmount;
}

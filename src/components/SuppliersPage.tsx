import React, { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Collapse,
  InputAdornment,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon, Edit as EditIcon, Sync as SyncIcon, FileDownload as FileDownloadIcon, Upload as UploadIcon, Search as SearchIcon } from '@mui/icons-material';

export const SUPPLIERS_STORAGE_KEY = 'suppliersList';

export interface SupplierProduct {
  id: string;
  name: string;
  partNo: string;
  description: string;
  brand?: string;
  unit: string;
  unitPrice?: number;
  priceDate?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms?: string;
  products: SupplierProduct[];
  createdAt: string;
}

const loadStored = (): Supplier[] => {
  try {
    const raw = localStorage.getItem(SUPPLIERS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const saveStored = (list: Supplier[]) => {
  try {
    localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(list));
  } catch (_) {}
};

/** Siemens product descriptions from TIA Selection Tool / Industry Mall - https://tiaselectiontool.siemens.com/ */
const SIEMENS_DESCRIPTIONS: Record<string, string> = {
  '6ES7515-2AN03-0AB0': 'SIMATIC S7-1500 CPU 1515-2 PN, 1 MB program / 4.5 MB data memory, PROFINET IRT with 2-port switch, 6 ns bit performance',
  '6ES7515-2RN03-0AB0': 'SIMATIC S7-1500R CPU 1515R-2 PN redundant CPU, 1 MB program / 4.5 MB data memory, PROFINET IRT',
  '6GK7543-1MX00-0XE0': 'Industrial Ethernet switch 10/100/1000 Mbit/s for S7-1500, VPN and Firewall support',
  '6EP1334-2BA20': 'SITOP PSU100S stabilized power supply 24V DC 10A (240W), 120/230V AC input, 90% efficiency, power boost 150%',
  '6EP1336-3BA10': 'SITOP PSU8200 20 A stabilized power supply, 120-230V AC / 110-220V DC input, 24V DC/20A output',
  '6GK5008-0BA10-1AB2': 'SCALANCE XB008 unmanaged Industrial Ethernet switch, 8x RJ45 10/100 Mbit/s, 24V AC/DC, IP20, PROFINET class A',
  '6ES7590-1AB60-0AA0': 'SIMATIC S7-1500 mounting rail 160 mm, incl. grounding screw, integrated DIN rail for terminals and circuit breakers',
  '6ES7590-1AC40-0AA0': 'SIMATIC S7-1500 mounting rail 245 mm, incl. grounding screw, integrated DIN rail for incidentals',
  '6ES7954-8LL03-0AA0': 'SIMATIC S7 Memory Card 256 MB Flash for S7-1200/1500 CPU, 3.3V, program and configuration storage',
  '6GK5622-2GS00-2AC2': 'SCALANCE SC622-2C Industrial Security Appliance; firewall, NAT/NAPT, network separation PROFIsafe; 2x combo 10/100/1000 Mbit/s RJ45/SFP',
  '6GK5208-0BA00-2AC2': 'SCALANCE XC208 manageable Layer 2 IE switch, IEC 62443-4-2 certified, 8x 10/100 Mbit/s RJ45',
  '6ES7131-6BH01-0BA0': 'ET 200SP DI 16x24VDC ST digital input module, 16 channels',
  '6ES7132-6BH01-0BA0': 'ET 200SP DQ 16x24VDC/0.5A ST digital output module, 16 channels',
  '6ES7134-6GF00-0AA1': 'ET 200SP AI 8xI 2-/4-wire BA analog input module, 8 channels',
  '6ES7135-6HD00-0BA1': 'ET 200SP AQ 4xU/I ST analog output module, 4 channels',
  '6ES7155-6AU01-0CN0': 'ET 200SP IM 155-6 PN/2 HF interface module, PROFINET',
  '6ES7155-6AA02-0BN0': 'ET 200SP IM 155-6 PN ST interface module, PROFINET',
  '6ES7134-6HD01-0BA1': 'ET 200SP AI 4xU/I 2-wire ST analog input module, 4 channels, 16-bit',
  '6EP1933-2EC51': 'SITOP UPS500S 22-29V DC input DIN rail uninterruptible power supply 360W',
  '6ES7193-6AR00-0AA0': 'ET 200SP BusAdapter BA 2xRJ45, 2 RJ45 sockets',
  '6ES7193-6BP00-0DA0': 'ET 200SP BaseUnit BU15-P16+A0+2D, BU type A0, push-in terminals, 15x117 mm',
  '6ES7212-1AE40-0XB0': 'SIMATIC S7-1200 CPU 1212C compact CPU, 100 KB work memory',
  '6ES7522-5HH00-0AB0': 'SIMATIC S7-1500 digital output module DQ 8x24VDC/0.5A HF',
  'P55802-Y157-A452': 'CCA-500-BA Add 500 building automation data points license for DESIGO CC',
  'QBE61.3-DP2': 'Differential pressure sensor for liquids and gases 0...2 bar, 0-10V output, IP54, G 1/2 thread, HVAC/building automation',
  'PXC4.E16': 'DESIGO PXC4.E16 PLC I/O module for HVAC; 16 I/O (12 universal, 4 relay); 24V ac/dc; BACnet/IP; expandable to 40 I/O via TXM modules',
  'TXM1.8U': 'TXM1.8U 8 Universal I/O Module for Desigo Px; configurable DI/AI/AO; 0-10V; DIN rail; expandable to PXC4 automation stations',
};

/** Normalize supplier name for matching (e.g. "Corporation" vs "Corp", "Incorporated" vs "Inc") */
export function normalizeSupplierName(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/\bcorporation\b/g, 'corp')
    .replace(/\bincorporated\b/g, 'inc')
    .replace(/\blimited\b/g, 'ltd')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Key for merging same products (by part no, then name, then id) */
function productMergeKey(p: SupplierProduct): string {
  const part = (p.partNo || '').trim().toLowerCase();
  const name = (p.name || '').trim().toLowerCase();
  return part || name || p.id;
}

const emptyProduct = (): SupplierProduct => ({
  id: Math.random().toString(36).slice(2),
  name: '',
  partNo: '',
  description: '',
  unit: '',
  unitPrice: undefined,
  priceDate: undefined,
});

const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingProduct, setEditingProduct] = useState<{ supplier: Supplier; product: SupplierProduct } | null>(null);
  const [productSupplierId, setProductSupplierId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const productMatchesSearch = (p: SupplierProduct, q: string): boolean => {
    if (!q.trim()) return true;
    const lower = q.trim().toLowerCase();
    return (
      (p.partNo || '').toLowerCase().includes(lower) ||
      (p.name || '').toLowerCase().includes(lower) ||
      (p.brand || '').toLowerCase().includes(lower)
    );
  };

  const filteredSuppliers = React.useMemo(() => {
    const q = searchQuery.trim();
    let list: Supplier[] = suppliers;
    if (q) {
      const lower = q.toLowerCase();
      list = suppliers
        .map((s) => {
          const supplierMatches = (s.name || '').toLowerCase().includes(lower);
          const matchingProducts = s.products.filter((p) => productMatchesSearch(p, q));
          if (supplierMatches) return { ...s, products: s.products };
          if (matchingProducts.length > 0) return { ...s, products: matchingProducts };
          return null;
        })
        .filter((s): s is Supplier => s !== null);
    }
    return [...list].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
  }, [suppliers, searchQuery]);

  const escapeCsv = (v: string) => {
    if (!v) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const exportToCSV = () => {
    const headers = ['Supplier Name', 'Contact', 'Email', 'Phone', 'Address', 'Payment Terms', 'Product Name', 'Part #', 'Brand', 'Description', 'Unit', 'Unit Price (PHP)', 'Price Date'];
    const rows: string[][] = [];
    for (const s of suppliers) {
      if (s.products.length === 0) {
        rows.push([
          escapeCsv(s.name),
          escapeCsv(s.contactName || ''),
          escapeCsv(s.email || ''),
          escapeCsv(s.phone || ''),
          escapeCsv(s.address || ''),
          escapeCsv(s.paymentTerms || ''),
          '', '', '', '', '', '', '',
        ]);
      } else {
        for (const p of s.products) {
          rows.push([
            escapeCsv(s.name),
            escapeCsv(s.contactName || ''),
            escapeCsv(s.email || ''),
            escapeCsv(s.phone || ''),
            escapeCsv(s.address || ''),
            escapeCsv(s.paymentTerms || ''),
            escapeCsv(p.name || ''),
            escapeCsv(p.partNo || ''),
            escapeCsv(p.brand || ''),
            escapeCsv(p.description || ''),
            escapeCsv(p.unit || ''),
            p.unitPrice != null ? String(p.unitPrice) : '',
            escapeCsv(p.priceDate || ''),
          ]);
        }
      }
    }
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Suppliers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let i = 0;
    let inQuotes = false;
    const flushField = () => { row.push(field); field = ''; };
    const flushRow = () => {
      if (row.length > 0 || field) { if (field) flushField(); rows.push(row); row = []; }
    };
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
        else if (c === '"') { inQuotes = false; i++; }
        else { field += c; i++; }
      } else {
        if (c === '"') { inQuotes = true; i++; }
        else if (c === ',' || c === '\n' || c === '\r') {
          if (c === ',') { flushField(); i++; }
          else { flushRow(); if (c === '\r' && text[i + 1] === '\n') i += 2; else i++; }
        } else { field += c; i++; }
      }
    }
    if (field || row.length > 0) { if (field) flushField(); if (row.length > 0) rows.push(row); }
    return rows;
  };

  const applyImportFromCSVText = (text: string) => {
    try {
      const rows = parseCSV(text);
        if (rows.length < 2) {
          setSyncMessage({ type: 'error', text: 'CSV must have a header row and at least one data row.' });
          setTimeout(() => setSyncMessage(null), 4000);
          return;
        }
        const headerRow = rows[0].map((h) => String(h).replace(/^"|"$/g, '').trim().toLowerCase());
        const col = (names: string[]) => headerRow.findIndex((h) => names.some((n) => h.includes(n)));
        const supplierNameCol = col(['supplier name', 'supplier', 'name']);
        const contactCol = col(['contact']);
        const emailCol = col(['email']);
        const phoneCol = col(['phone']);
        const addressCol = col(['address']);
        const paymentTermsCol = col(['payment terms']);
        const productNameCol = col(['product name', 'product']);
        const partNoCol = col(['part #', 'part number', 'partno']);
        const brandCol = col(['brand']);
        const descCol = col(['description']);
        const unitCol = col(['unit']);
        const unitPriceCol = col(['unit price', 'price']);
        const priceDateCol = col(['price date']);

        if (supplierNameCol < 0) {
          setSyncMessage({ type: 'error', text: 'CSV must have a Supplier Name column.' });
          setTimeout(() => setSyncMessage(null), 4000);
          return;
        }

        const bySupplier = new Map<string, { supplier: Omit<Supplier, 'products'>; products: SupplierProduct[] }>();
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i];
          const get = (c: number) => (c >= 0 && cells[c] !== undefined ? String(cells[c]).replace(/^"|"$/g, '').trim() : '');
          const supName = get(supplierNameCol);
          if (!supName) continue;
          const normKey = normalizeSupplierName(supName);
          if (!bySupplier.has(normKey)) {
            bySupplier.set(normKey, {
              supplier: {
                id: `supplier-${Date.now()}-${i}`,
                name: supName,
                contactName: get(contactCol),
                email: get(emailCol),
                phone: get(phoneCol),
                address: get(addressCol),
                paymentTerms: get(paymentTermsCol) || undefined,
                createdAt: new Date().toISOString(),
              },
              products: [],
            });
          }
          const entry = bySupplier.get(normKey)!;
          if (contactCol >= 0 && get(contactCol)) entry.supplier.contactName = get(contactCol);
          if (emailCol >= 0 && get(emailCol)) entry.supplier.email = get(emailCol);
          if (phoneCol >= 0 && get(phoneCol)) entry.supplier.phone = get(phoneCol);
          if (addressCol >= 0 && get(addressCol)) entry.supplier.address = get(addressCol);
          if (paymentTermsCol >= 0 && get(paymentTermsCol)) entry.supplier.paymentTerms = get(paymentTermsCol) || undefined;

          const pName = get(productNameCol);
          const pPartNo = get(partNoCol);
          const desc = get(descCol) || '';
          if (pName && (pName.startsWith('Various items') || pName.includes('Various items per'))) continue;
          if (desc && (desc.startsWith('Various items') || desc.includes('Various items per'))) continue;
          if (pName || pPartNo) {
            const unitPriceVal = unitPriceCol >= 0 ? parseFloat(String(cells[unitPriceCol] || '').replace(/[^0-9.]/g, '')) : undefined;
            let descFinal = desc;
            const pBrand = get(brandCol);
            if (pBrand && /siemens/i.test(pBrand) && pPartNo && SIEMENS_DESCRIPTIONS[pPartNo] && (!descFinal || descFinal.length < 30)) {
              descFinal = SIEMENS_DESCRIPTIONS[pPartNo];
            }
            const product: SupplierProduct = {
              id: `prod-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
              name: pName || pPartNo || '—',
              partNo: pPartNo || '',
              description: descFinal,
              brand: pBrand || undefined,
              unit: get(unitCol) || 'pcs',
              unitPrice: Number.isFinite(unitPriceVal) ? unitPriceVal : undefined,
              priceDate: get(priceDateCol) || undefined,
            };
            entry.products.push(product);
          }
        }

        let addedCount = 0;
        const merged = [...suppliers];
        for (const [, { supplier, products }] of Array.from(bySupplier.entries())) {
          const existingIdx = merged.findIndex((s) => normalizeSupplierName(s.name) === normalizeSupplierName(supplier.name));
          if (existingIdx >= 0) {
            const existing = merged[existingIdx];
            const mergedProducts = [...existing.products];
            for (const np of products) {
              const idx = mergedProducts.findIndex((p) => (p.partNo || '').trim() === (np.partNo || '').trim());
              if (idx >= 0) {
                mergedProducts[idx] = { ...mergedProducts[idx], ...np, id: mergedProducts[idx].id };
              } else {
                mergedProducts.push({ ...np, id: `prod-${Date.now()}-${Math.random().toString(36).slice(2)}` });
              }
            }
            merged[existingIdx] = {
              ...existing,
              ...supplier,
              id: existing.id,
              products: mergedProducts,
            };
          } else {
            addedCount++;
            merged.push({
              ...supplier,
              id: `supplier-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              products: products.map((p: SupplierProduct) => ({ ...p, id: `prod-${Date.now()}-${Math.random().toString(36).slice(2)}` })),
            });
          }
        }
        persist(merged);
        setSyncMessage({ type: 'success', text: `Imported ${bySupplier.size} supplier(s) from CSV${addedCount > 0 ? ` — ${addedCount} new` : ''}.` });
        setTimeout(() => setSyncMessage(null), 4000);
    } catch (err) {
      setSyncMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to parse CSV.' });
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const importFromCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      applyImportFromCSVText((reader.result as string) || '');
    };
    reader.readAsText(file);
  };

  // Form state for supplier
  const [formName, setFormName] = useState('');
  const [formContactName, setFormContactName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPaymentTerms, setFormPaymentTerms] = useState('');

  // Form state for product
  const [productName, setProductName] = useState('');
  const [productPartNo, setProductPartNo] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productBrand, setProductBrand] = useState('');
  const [productUnit, setProductUnit] = useState('');
  const [productUnitPrice, setProductUnitPrice] = useState<string>('');
  const [productPriceDate, setProductPriceDate] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      setLoadError(null);
      try {
        const res = await fetch('/api/suppliers');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length >= 0) {
            setSuppliers(data);
            saveStored(data);
            return;
          }
        }
      } catch (_) {}
      // Do not fall back to localStorage: it can contain deleted items and makes them "reappear"
      setSuppliers([]);
      setLoadError('Could not load from database. Is the API server running? (npm run start)');
    };
    load();
  }, []);

  const saveToBackend = (list: Supplier[]) => {
    fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Save failed');
      })
      .catch(() => {
        setSyncMessage({ type: 'error', text: 'Could not save to database. Changes are in browser only.' });
        setTimeout(() => setSyncMessage(null), 5000);
      });
  };

  const persist = (next: Supplier[], options?: { skipBackend?: boolean }) => {
    setSuppliers(next);
    saveStored(next);
    if (!options?.skipBackend) saveToBackend(next);
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const openAddSupplier = () => {
    setEditingSupplier(null);
    setFormName('');
    setFormContactName('');
    setFormEmail('');
    setFormPhone('');
    setFormAddress('');
    setFormPaymentTerms('');
    setSupplierDialogOpen(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setFormName(s.name);
    setFormContactName(s.contactName || '');
    setFormEmail(s.email || '');
    setFormPhone(s.phone || '');
    setFormAddress(s.address || '');
    setFormPaymentTerms(s.paymentTerms || '');
    setSupplierDialogOpen(true);
  };

  const handleSaveSupplier = () => {
    const name = formName.trim();
    if (!name) return;
    if (editingSupplier) {
      const next = suppliers.map((s) =>
        s.id === editingSupplier.id
          ? {
              ...s,
              name,
              contactName: formContactName.trim(),
              email: formEmail.trim(),
              phone: formPhone.trim(),
              address: formAddress.trim(),
              paymentTerms: formPaymentTerms.trim() || undefined,
            }
          : s
      );
      persist(next);
    } else {
      const newSupplier: Supplier = {
        id: `supplier-${Date.now()}`,
        name,
        contactName: formContactName.trim(),
        email: formEmail.trim(),
        phone: formPhone.trim(),
        address: formAddress.trim(),
        paymentTerms: formPaymentTerms.trim() || undefined,
        products: [],
        createdAt: new Date().toISOString(),
      };
      persist([newSupplier, ...suppliers]);
    }
    setSupplierDialogOpen(false);
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!window.confirm('Delete this supplier and all their products?')) return;
    try {
      const res = await fetch(`/api/suppliers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const status = res.status;
        const body = await res.json().catch(() => ({}));
        const msg = (body && body.error) || (status === 404 ? 'Backend not running? Try: npm run start' : `Server error (${status})`);
        throw new Error(msg);
      }
      persist(suppliers.filter((s) => s.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      setSyncMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not delete supplier.' });
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const openAddProduct = (supplierId: string) => {
    setProductSupplierId(supplierId);
    setEditingProduct(null);
    setProductName('');
    setProductPartNo('');
    setProductDescription('');
    setProductBrand('');
    setProductUnit('');
    setProductUnitPrice('');
    setProductPriceDate(new Date().toISOString().slice(0, 10));
    setProductDialogOpen(true);
  };

  const openEditProduct = (supplier: Supplier, product: SupplierProduct) => {
    setProductSupplierId(supplier.id);
    setEditingProduct({ supplier, product });
    setProductName(product.name);
    setProductPartNo(product.partNo || '');
    setProductDescription(product.description || '');
    setProductBrand(product.brand || '');
    setProductUnit(product.unit || '');
    setProductUnitPrice(product.unitPrice != null ? String(product.unitPrice) : '');
    setProductPriceDate(product.priceDate || '');
    setProductDialogOpen(true);
  };

  const handleSaveProduct = () => {
    const name = productName.trim();
    if (!name || !productSupplierId) return;
    const supplier = suppliers.find((s) => s.id === productSupplierId);
    if (!supplier) return;

    const unitPriceVal = parseFloat(productUnitPrice) || undefined;
    const priceDateVal = productPriceDate.trim() || undefined;
    if (editingProduct) {
      const next = suppliers.map((s) => {
        if (s.id !== productSupplierId) return s;
        return {
          ...s,
          products: s.products.map((p) =>
            p.id === editingProduct.product.id
              ? {
                  ...p,
                  name,
                  partNo: productPartNo.trim(),
                  description: productDescription.trim(),
                  brand: productBrand.trim() || undefined,
                  unit: productUnit.trim(),
                  unitPrice: unitPriceVal,
                  priceDate: priceDateVal,
                }
              : p
          ),
        };
      });
      persist(next);
    } else {
      const newProduct: SupplierProduct = {
        ...emptyProduct(),
        name,
        partNo: productPartNo.trim(),
        description: productDescription.trim(),
        brand: productBrand.trim() || undefined,
        unit: productUnit.trim(),
        unitPrice: unitPriceVal,
        priceDate: priceDateVal,
      };
      const next = suppliers.map((s) =>
        s.id === productSupplierId
          ? { ...s, products: [...s.products, newProduct] }
          : s
      );
      persist(next);
    }
    setProductDialogOpen(false);
  };

  const handleDeleteProduct = async (supplierId: string, productId: string) => {
    if (!window.confirm('Remove this product?')) return;
    try {
      const res = await fetch(`/api/supplier-products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const status = res.status;
        const body = await res.json().catch(() => ({}));
        const msg = (body && body.error) || (status === 404 ? 'Backend not running? Try: npm run start' : `Server error (${status})`);
        throw new Error(msg);
      }
      const next = suppliers.map((s) =>
        s.id === supplierId ? { ...s, products: s.products.filter((p) => p.id !== productId) } : s
      );
      persist(next);
    } catch (err) {
      setSyncMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not delete product.' });
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const supplierForProductDialog = suppliers.find((s) => s.id === productSupplierId);

  const handleSyncFromPOs = async () => {
    const { syncAllPOsToSuppliers } = await import('./PurchaseOrderPage');
    const added = syncAllPOsToSuppliers();
    const list = loadStored();
    setSuppliers(list);
    saveToBackend(list);
    setSyncMessage({
      type: 'success',
      text: added > 0 ? `Synced ${added} product(s) from Purchase Orders.` : 'No new PO items to sync.',
    });
    setTimeout(() => setSyncMessage(null), 4000);
  };

  const handleReloadFromServer = async () => {
    try {
      setSyncMessage({ type: 'success', text: 'Reloading from database...' });
      const res = await fetch('/api/suppliers');
      if (!res.ok) {
        const status = res.status;
        let msg = `Failed to load suppliers (${status}).`;
        if (status === 404 || status === 502) msg += ' Is the API server running? Start with: npm run start';
        throw new Error(msg);
      }
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Invalid response');
      persist(data, { skipBackend: true });
      setLoadError(null);
      setSyncMessage({ type: 'success', text: `Loaded ${data.length} supplier(s) from database.` });
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'Failed to reload from server.';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) msg = 'Cannot reach server. Start the backend with: npm run start';
      setSyncMessage({ type: 'error', text: msg });
      setTimeout(() => setSyncMessage(null), 6000);
    }
  };

  const handleMergeDuplicates = () => {
    const list = loadStored();
    const byNorm = new Map<string, Supplier[]>();
    for (const s of list) {
      const k = normalizeSupplierName(s.name);
      if (!byNorm.has(k)) byNorm.set(k, []);
      byNorm.get(k)!.push(s);
    }
    const toRemove = new Map<string, string>(); // oldId -> keptId
    const merged: Supplier[] = [];
    for (const [, group] of Array.from(byNorm.entries())) {
      if (group.length === 1) {
        merged.push(group[0]);
        continue;
      }
      const kept = group[0];
      const combined: Supplier = {
        ...kept,
        contactName: kept.contactName || group.find((g: Supplier) => g.contactName)?.contactName || '',
        email: kept.email || group.find((g: Supplier) => g.email)?.email || '',
        phone: kept.phone || group.find((g: Supplier) => g.phone)?.phone || '',
        address: kept.address || group.find((g: Supplier) => g.address)?.address || '',
        paymentTerms: kept.paymentTerms || group.find((g: Supplier) => g.paymentTerms)?.paymentTerms || undefined,
        products: [],
      };
      const productsByKey = new Map<string, SupplierProduct>();
      for (const s of group) {
        for (const p of s.products || []) {
          const key = productMergeKey(p);
          const existing = productsByKey.get(key);
          if (!existing) {
            productsByKey.set(key, { ...p, id: p.id });
          } else {
            const mergedProduct: SupplierProduct = {
              ...existing,
              name: existing.name || p.name || '',
              partNo: existing.partNo || p.partNo || '',
              description: (existing.description || '').trim() ? existing.description : (p.description || existing.description || ''),
              brand: existing.brand || p.brand || '',
              unit: existing.unit || p.unit || 'pcs',
              unitPrice: existing.unitPrice != null ? existing.unitPrice : p.unitPrice,
              priceDate: existing.priceDate || p.priceDate,
            };
            productsByKey.set(key, mergedProduct);
          }
        }
      }
      combined.products = Array.from(productsByKey.values());
      merged.push(combined);
      for (let i = 1; i < group.length; i++) {
        toRemove.set(group[i].id, kept.id);
      }
    }
    if (toRemove.size === 0) {
      setSyncMessage({ type: 'success', text: 'No duplicate suppliers found.' });
      setTimeout(() => setSyncMessage(null), 4000);
      return;
    }
    persist(merged);
    for (const [removedId, keptId] of Array.from(toRemove.entries())) {
      try {
        const poRaw = localStorage.getItem('purchaseOrders');
        if (poRaw) {
          const pos = JSON.parse(poRaw);
          let changed = false;
          for (const po of pos) {
            if (po.supplierId === removedId) {
              po.supplierId = keptId;
              changed = true;
            }
          }
          if (changed) localStorage.setItem('purchaseOrders', JSON.stringify(pos));
        }
        const mrfRaw = localStorage.getItem('materialRequests');
        if (mrfRaw) {
          const mrfs = JSON.parse(mrfRaw);
          let changed = false;
          for (const mrf of mrfs) {
            for (const item of mrf.items || []) {
              if (item.supplierId === removedId) {
                item.supplierId = keptId;
                changed = true;
              }
            }
          }
          if (changed) localStorage.setItem('materialRequests', JSON.stringify(mrfs));
        }
      } catch (_) {}
    }
    setSuppliers(loadStored());
    setSyncMessage({ type: 'success', text: `Merged ${toRemove.size} duplicate supplier(s).` });
    setTimeout(() => setSyncMessage(null), 4000);
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, color: '#2c5aa0', mb: 2 }}>
        Suppliers
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Manage your suppliers and their product catalogs.
      </Typography>

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLoadError(null)}>
          {loadError}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>{suppliers.length}</Box> supplier{suppliers.length !== 1 ? 's' : ''}
          {' · '}
          <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>{suppliers.reduce((n, s) => n + s.products.length, 0)}</Box> total product{suppliers.reduce((n, s) => n + s.products.length, 0) !== 1 ? 's' : ''}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openAddSupplier}
          sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}
        >
          Add supplier
        </Button>
        <Button
          variant="outlined"
          startIcon={<SyncIcon />}
          onClick={handleSyncFromPOs}
          sx={{ borderColor: '#2c5aa0', color: '#2c5aa0' }}
        >
          Sync from POs
        </Button>
        <Button
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={exportToCSV}
          disabled={suppliers.length === 0}
          sx={{ borderColor: '#2c5aa0', color: '#2c5aa0' }}
        >
          Export CSV
        </Button>
        <input type="file" id="suppliers-csv-import" accept=".csv" hidden onChange={importFromCSV} />
        <Button
          variant="outlined"
          component="label"
          htmlFor="suppliers-csv-import"
          startIcon={<UploadIcon />}
          sx={{ borderColor: '#2c5aa0', color: '#2c5aa0' }}
        >
          Import CSV
        </Button>
        <Button
          variant="contained"
          startIcon={<SyncIcon />}
          onClick={handleReloadFromServer}
          sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}
        >
          Reload from database
        </Button>
        <Button
          variant="outlined"
          startIcon={<SyncIcon />}
          onClick={handleMergeDuplicates}
          sx={{ borderColor: '#2c5aa0', color: '#2c5aa0' }}
        >
          Merge duplicates
        </Button>
      </Box>

      {syncMessage && (
        <Typography variant="body2" sx={{ mb: 2, p: 1.5, bgcolor: syncMessage.type === 'error' ? 'error.light' : 'success.light', color: syncMessage.type === 'error' ? 'error.dark' : 'success.dark', borderRadius: 1 }}>
          {syncMessage.text}
        </Typography>
      )}

      <TextField
        fullWidth
        size="small"
        placeholder="Search supplier, part number, product name, brand..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        sx={{ mb: 2, maxWidth: 400 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
        }}
      />

      <Paper sx={{ borderRadius: 2, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main' }}>
                <TableCell sx={{ width: 48, color: 'white' }} />
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Supplier name</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Contact</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Email</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 600 }}>Phone</TableCell>
                <TableCell align="center" sx={{ color: 'white', fontWeight: 600 }}>Products</TableCell>
                <TableCell align="center" sx={{ color: 'white', fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSuppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {suppliers.length === 0 ? 'No suppliers yet. Click &quot;Add supplier&quot; to get started.' : 'No suppliers or products match your search.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSuppliers.map((s) => (
                  <React.Fragment key={s.id}>
                    <TableRow hover>
                      <TableCell sx={{ width: 48, py: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => toggleExpand(s.id)}
                          aria-label={expandedId === s.id ? 'Collapse' : 'Expand'}
                        >
                          {expandedId === s.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{s.name}</TableCell>
                      <TableCell>{s.contactName || '—'}</TableCell>
                      <TableCell>{s.email || '—'}</TableCell>
                      <TableCell>{s.phone || '—'}</TableCell>
                      <TableCell align="center">{s.products.length}</TableCell>
                      <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton size="small" onClick={() => openEditSupplier(s)} title="Edit supplier">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteSupplier(s.id)} color="error" title="Delete supplier">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={7} sx={{ py: 0, borderBottom: expandedId === s.id ? '1px solid #e2e8f0' : 'none' }}>
                        <Collapse in={expandedId === s.id} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 2, px: 2, bgcolor: 'grey.50' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                              <Typography variant="subtitle2" color="text.secondary">
                                Products
                              </Typography>
                              <Button size="small" startIcon={<AddIcon />} onClick={() => openAddProduct(s.id)}>
                                Add product
                              </Button>
                            </Box>
                            {s.products.length === 0 ? (
                              <Typography variant="body2" color="text.secondary">
                                No products. Add products to build a catalog for this supplier.
                              </Typography>
                            ) : (
                              <TableContainer>
                                <Table size="small" sx={{ '& .MuiTableCell-root': { borderColor: 'divider' } }}>
                                  <TableHead>
                                    <TableRow>
                                      <TableCell sx={{ fontWeight: 600 }}>Product name</TableCell>
                                      <TableCell sx={{ fontWeight: 600 }}>Part #</TableCell>
                                      <TableCell sx={{ fontWeight: 600 }}>Brand</TableCell>
                                      <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                                      <TableCell sx={{ fontWeight: 600 }}>Unit</TableCell>
                                      <TableCell align="right" sx={{ fontWeight: 600 }}>Price (PHP)</TableCell>
                                      <TableCell sx={{ fontWeight: 600 }}>Price date</TableCell>
                                      <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {s.products.map((p) => (
                                      <TableRow key={p.id}>
                                        <TableCell>{p.name}</TableCell>
                                        <TableCell>{p.partNo || '—'}</TableCell>
                                        <TableCell>{p.brand || '—'}</TableCell>
                                        <TableCell>{p.description || '—'}</TableCell>
                                        <TableCell>{p.unit || '—'}</TableCell>
                                        <TableCell align="right">{p.unitPrice != null ? `PHP ${p.unitPrice.toFixed(2)}` : '—'}</TableCell>
                                        <TableCell>{p.priceDate || '—'}</TableCell>
                                        <TableCell align="center">
                                          <IconButton size="small" onClick={() => openEditProduct(s, p)} title="Edit product">
                                            <EditIcon fontSize="small" />
                                          </IconButton>
                                          <IconButton size="small" onClick={() => handleDeleteProduct(s.id, p.id)} color="error" title="Remove product">
                                            <DeleteIcon fontSize="small" />
                                          </IconButton>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </TableContainer>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Add/Edit Supplier Dialog */}
      <Dialog open={supplierDialogOpen} onClose={() => setSupplierDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>{editingSupplier ? 'Edit supplier' : 'Add supplier'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField fullWidth label="Supplier name" value={formName} onChange={(e) => setFormName(e.target.value)} required size="small" />
            <TextField fullWidth label="Contact name" value={formContactName} onChange={(e) => setFormContactName(e.target.value)} size="small" />
            <TextField fullWidth label="Email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} size="small" />
            <TextField fullWidth label="Phone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} size="small" />
            <TextField fullWidth label="Address" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} multiline rows={2} size="small" />
            <TextField fullWidth label="Payment Terms" value={formPaymentTerms} onChange={(e) => setFormPaymentTerms(e.target.value)} size="small" placeholder="e.g. 50% DP, 50% upon delivery" />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSupplierDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveSupplier} disabled={!formName.trim()} sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}>
            {editingSupplier ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add/Edit Product Dialog */}
      <Dialog open={productDialogOpen} onClose={() => setProductDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle>
          {editingProduct ? 'Edit product' : 'Add product'}
          {supplierForProductDialog && (
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.5 }}>
              {supplierForProductDialog.name}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField fullWidth label="Product name" value={productName} onChange={(e) => setProductName(e.target.value)} required size="small" />
            <TextField
              fullWidth
              label="Part number"
              value={productPartNo}
              onChange={(e) => {
                const v = e.target.value;
                setProductPartNo(v);
                if (productBrand && /siemens/i.test(productBrand) && SIEMENS_DESCRIPTIONS[v.trim()]) {
                  setProductDescription(SIEMENS_DESCRIPTIONS[v.trim()]);
                }
              }}
              size="small"
            />
            <TextField
              fullWidth
              label="Brand"
              value={productBrand}
              onChange={(e) => {
                const v = e.target.value;
                setProductBrand(v);
                if (/siemens/i.test(v) && productPartNo && SIEMENS_DESCRIPTIONS[productPartNo.trim()]) {
                  setProductDescription(SIEMENS_DESCRIPTIONS[productPartNo.trim()]);
                }
              }}
              size="small"
            />
            <TextField fullWidth label="Description" value={productDescription} onChange={(e) => setProductDescription(e.target.value)} multiline rows={2} size="small" />
            <TextField fullWidth label="Unit (e.g. pc, box)" value={productUnit} onChange={(e) => setProductUnit(e.target.value)} size="small" placeholder="pc, set, box, etc." />
            <TextField fullWidth label="Unit price (PHP)" value={productUnitPrice} onChange={(e) => setProductUnitPrice(e.target.value)} type="number" inputProps={{ min: 0, step: 0.01 }} size="small" placeholder="0.00" />
            <TextField fullWidth label="Price date" value={productPriceDate} onChange={(e) => setProductPriceDate(e.target.value)} type="date" size="small" InputLabelProps={{ shrink: true }} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setProductDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveProduct} disabled={!productName.trim()} sx={{ bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}>
            {editingProduct ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SuppliersPage;

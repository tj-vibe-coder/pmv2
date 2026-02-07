import React, { useState, useEffect } from 'react';
import {
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
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon, Edit as EditIcon } from '@mui/icons-material';

export const SUPPLIERS_STORAGE_KEY = 'suppliersList';

export interface SupplierProduct {
  id: string;
  name: string;
  partNo: string;
  description: string;
  unit: string;
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

const emptyProduct = (): SupplierProduct => ({
  id: Math.random().toString(36).slice(2),
  name: '',
  partNo: '',
  description: '',
  unit: '',
});

const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingProduct, setEditingProduct] = useState<{ supplier: Supplier; product: SupplierProduct } | null>(null);
  const [productSupplierId, setProductSupplierId] = useState<string | null>(null);

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
  const [productUnit, setProductUnit] = useState('');

  useEffect(() => {
    setSuppliers(loadStored());
  }, []);

  const persist = (next: Supplier[]) => {
    setSuppliers(next);
    saveStored(next);
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

  const handleDeleteSupplier = (id: string) => {
    if (!window.confirm('Delete this supplier and all their products?')) return;
    persist(suppliers.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const openAddProduct = (supplierId: string) => {
    setProductSupplierId(supplierId);
    setEditingProduct(null);
    setProductName('');
    setProductPartNo('');
    setProductDescription('');
    setProductUnit('');
    setProductDialogOpen(true);
  };

  const openEditProduct = (supplier: Supplier, product: SupplierProduct) => {
    setProductSupplierId(supplier.id);
    setEditingProduct({ supplier, product });
    setProductName(product.name);
    setProductPartNo(product.partNo || '');
    setProductDescription(product.description || '');
    setProductUnit(product.unit || '');
    setProductDialogOpen(true);
  };

  const handleSaveProduct = () => {
    const name = productName.trim();
    if (!name || !productSupplierId) return;
    const supplier = suppliers.find((s) => s.id === productSupplierId);
    if (!supplier) return;

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
                  unit: productUnit.trim(),
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
        unit: productUnit.trim(),
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

  const handleDeleteProduct = (supplierId: string, productId: string) => {
    if (!window.confirm('Remove this product?')) return;
    const next = suppliers.map((s) =>
      s.id === supplierId ? { ...s, products: s.products.filter((p) => p.id !== productId) } : s
    );
    persist(next);
  };

  const supplierForProductDialog = suppliers.find((s) => s.id === productSupplierId);

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, color: '#2c5aa0', mb: 2 }}>
        Suppliers
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Manage your suppliers and their product catalogs.
      </Typography>

      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={openAddSupplier}
        sx={{ mb: 2, bgcolor: '#2c5aa0', '&:hover': { bgcolor: '#1e4a72' } }}
      >
        Add supplier
      </Button>

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
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No suppliers yet. Click &quot;Add supplier&quot; to get started.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
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
                                      <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                                      <TableCell sx={{ fontWeight: 600 }}>Unit</TableCell>
                                      <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {s.products.map((p) => (
                                      <TableRow key={p.id}>
                                        <TableCell>{p.name}</TableCell>
                                        <TableCell>{p.partNo || '—'}</TableCell>
                                        <TableCell>{p.description || '—'}</TableCell>
                                        <TableCell>{p.unit || '—'}</TableCell>
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
            <TextField fullWidth label="Part number" value={productPartNo} onChange={(e) => setProductPartNo(e.target.value)} size="small" />
            <TextField fullWidth label="Description" value={productDescription} onChange={(e) => setProductDescription(e.target.value)} multiline rows={2} size="small" />
            <TextField fullWidth label="Unit (e.g. pc, box)" value={productUnit} onChange={(e) => setProductUnit(e.target.value)} size="small" placeholder="pc, set, box, etc." />
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

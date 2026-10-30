import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChangePasswordDialog from './ChangePasswordDialog';

const fill = (label: RegExp, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('ChangePasswordDialog', () => {
  const realFetch = window.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    window.fetch = fetchMock as unknown as typeof window.fetch;
    localStorage.setItem('netpacific_token', 'tok');
  });

  afterEach(() => {
    window.fetch = realFetch;
    localStorage.clear();
  });

  it('rejects a mismatched confirmation without calling the server', () => {
    render(<ChangePasswordDialog open onClose={() => {}} />);
    fill(/current password/i, 'Old-Pass-1');
    fill(/^new password/i, 'New-Pass-22');
    fill(/confirm new password/i, 'New-Pass-23');
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a short new password without calling the server', () => {
    render(<ChangePasswordDialog open onClose={() => {}} />);
    fill(/current password/i, 'Old-Pass-1');
    fill(/^new password/i, 'short');
    fill(/confirm new password/i, 'short');
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    expect(screen.getByText(/at least 8 characters\./i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends current and new password with the token and shows the server message', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, message: 'Password changed. Your other devices have been signed out.' }) });
    const onClose = jest.fn();
    render(<ChangePasswordDialog open onClose={onClose} />);
    fill(/current password/i, 'Old-Pass-1');
    fill(/^new password/i, 'New-Pass-22');
    fill(/confirm new password/i, 'New-Pass-22');
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(screen.getByText(/other devices have been signed out/i)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/auth\/change-password$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ currentPassword: 'Old-Pass-1', newPassword: 'New-Pass-22' });
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the server error and keeps the form open', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ success: false, error: 'Current password is incorrect' }) });
    render(<ChangePasswordDialog open onClose={() => {}} />);
    fill(/current password/i, 'wrong-wrong');
    fill(/^new password/i, 'New-Pass-22');
    fill(/confirm new password/i, 'New-Pass-22');
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(screen.getByText(/current password is incorrect/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /change password/i })).toBeEnabled();
  });
});

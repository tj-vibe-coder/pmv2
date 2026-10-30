'use strict';

// POST /api/auth/change-password — a signed-in user sets their own password.
// Superadmins still set anyone's password from User Management; this is the
// self-service path. On success every other session of the user ends, so a
// stolen token dies when its owner changes their password.

const MIN_NEW_PASSWORD_LENGTH = 8;

function createChangePasswordHandler({
  db, getCurrentUser, verifyPassword, hashPassword, revokeUserSessions, bearerToken,
  loginThrottle, tooManyAttempts, minLength = MIN_NEW_PASSWORD_LENGTH,
}) {
  return async function changePassword(req, res) {
    const user = await getCurrentUser(req);
    if (!user || user.scannerScope) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const body = req.body || {};
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password are required' });
    }
    if (newPassword.length < minLength) {
      return res.status(400).json({ success: false, error: `New password must be at least ${minLength} characters` });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ success: false, error: 'New password must be different from the current one' });
    }
    try {
      // Wrong current passwords share the login lockout, so this form can't be
      // used to guess a password that the login form would refuse.
      const lock = await loginThrottle.check('login', user.username);
      if (lock.locked) return res.status(429).json({ success: false, error: tooManyAttempts(lock.retryAfterMs) });
      const { ok } = await verifyPassword(currentPassword, user.password_hash);
      if (!ok) {
        const hit = await loginThrottle.hit('login', user.username);
        if (hit.locked) return res.status(429).json({ success: false, error: tooManyAttempts(hit.retryAfterMs) });
        return res.status(400).json({ success: false, error: 'Current password is incorrect' });
      }
      await db.collection('users').doc(String(user.id)).update({
        password_hash: await hashPassword(newPassword),
        updated_at: Math.floor(Date.now() / 1000),
      });
      await loginThrottle.clear('login', user.username);
      await revokeUserSessions(user.id, bearerToken(req));
      res.json({ success: true, message: 'Password changed. Your other devices have been signed out.' });
    } catch (err) {
      console.error(`Error changing password for ${user.username}:`, err);
      res.status(500).json({ success: false, error: 'Could not change password' });
    }
  };
}

module.exports = { createChangePasswordHandler, MIN_NEW_PASSWORD_LENGTH };

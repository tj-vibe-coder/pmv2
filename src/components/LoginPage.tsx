import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Alert,
  IconButton,
  InputAdornment,
  CircularProgress,
  InputLabel,
  FormControl,
  OutlinedInput,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { LoginCredentials } from '../types/User';

interface RegistrationData extends LoginCredentials {
  email: string;
  confirmPassword: string;
  role?: string;
}

const darkBlue = '#1e4a72';

const LoginPage: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const [loginData, setLoginData] = useState<LoginCredentials>({
    username: '',
    password: '',
  });

  const [registrationData, setRegistrationData] = useState<RegistrationData>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'user',
  });

  const handleLoginChange = (field: keyof LoginCredentials) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setLoginData((prev) => ({ ...prev, [field]: event.target.value }));
    setError(null);
  };

  const handleRegistrationChange = (field: keyof RegistrationData) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setRegistrationData((prev) => ({ ...prev, [field]: event.target.value }));
    setError(null);
  };

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  const validateRegistration = (): string | null => {
    if (!registrationData.username.trim()) return 'Username is required';
    if (!registrationData.email.trim()) return 'Email is required';
    if (!registrationData.password) return 'Password is required';
    if (registrationData.password !== registrationData.confirmPassword) return 'Passwords do not match';
    if (registrationData.password.length < 6) return 'Password must be at least 6 characters long';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(registrationData.email)) return 'Please enter a valid email address';
    return null;
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!loginData.username.trim() || !loginData.password.trim()) {
      setError('Please enter both username and password');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await login(loginData);
      if (result.success) navigate('/dashboard', { replace: true });
      else setError(result.error || 'Login failed');
    } catch (err) {
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handleRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateRegistration();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: registrationData.username,
          email: registrationData.email,
          password: registrationData.password,
          role: registrationData.role,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setSuccess('Registration successful! You can now sign in.');
        setRegistrationData({ username: '', email: '', password: '', confirmPassword: '', role: 'user' });
        setTimeout(() => {
          setIsLogin(true);
          setSuccess(null);
        }, 2000);
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (err) {
      setError('An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError(null);
    setSuccess(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f2e4f 0%, #1e4a72 35%, #2c5aa0 70%, #4f7bc8 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Abstract background shapes */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: '-10%',
            left: '-5%',
            width: 320,
            height: 320,
            borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%',
            background: 'rgba(79, 123, 200, 0.25)',
            filter: 'blur(40px)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: '20%',
            right: '-8%',
            width: 280,
            height: 280,
            borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
            background: 'rgba(44, 90, 160, 0.3)',
            filter: 'blur(35px)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: '10%',
            left: '15%',
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'rgba(94, 156, 220, 0.2)',
            filter: 'blur(30px)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 400,
            height: 400,
            borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
            background: 'rgba(30, 74, 114, 0.15)',
            filter: 'blur(60px)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </Box>

      {/* Glassmorphism card */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          mx: 2,
          p: 4,
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 4,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.5)',
        }}
      >
        {/* Logo placeholder */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          {!logoError ? (
            <Box
              component="img"
              src="/logo192.png"
              alt="Logo"
              onError={() => setLogoError(true)}
              sx={{ height: 48, width: 'auto' }}
            />
          ) : (
            <Typography sx={{ color: '#5a5a5a', fontWeight: 500, fontSize: '1rem' }}>
              Your logo
            </Typography>
          )}
        </Box>

        <Typography component="h1" sx={{ fontSize: '1.75rem', fontWeight: 700, color: '#2d2d2d', mb: 3 }}>
          {isLogin ? 'Login' : 'Create Account'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        <Box component="form" onSubmit={isLogin ? handleLogin : handleRegistration}>
          {isLogin ? (
            <>
              <FormControl fullWidth sx={{ mb: 2 }} variant="outlined">
                <InputLabel htmlFor="login-username" sx={{ bgcolor: 'white', px: 0.5 }}>
                  Username
                </InputLabel>
                <OutlinedInput
                  id="login-username"
                  value={loginData.username}
                  onChange={handleLoginChange('username')}
                  placeholder="Enter your username"
                  disabled={loading}
                  label="Username"
                  sx={{
                    bgcolor: 'white',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0e0e0' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#bdbdbd' },
                  }}
                />
              </FormControl>

              <FormControl fullWidth sx={{ mb: 1 }} variant="outlined">
                <InputLabel htmlFor="login-password" sx={{ bgcolor: 'white', px: 0.5 }}>
                  Password
                </InputLabel>
                <OutlinedInput
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={loginData.password}
                  onChange={handleLoginChange('password')}
                  placeholder="Password"
                  disabled={loading}
                  label="Password"
                  endAdornment={
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        size="small"
                        aria-label="toggle password visibility"
                      >
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  }
                  sx={{
                    bgcolor: 'white',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0e0e0' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#bdbdbd' },
                  }}
                />
              </FormControl>

              <Box sx={{ textAlign: 'right', mb: 2 }}>
                <Typography
                  component="button"
                  type="button"
                  onClick={() => {}}
                  sx={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: darkBlue,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  Forgot Password?
                </Typography>
              </Box>

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: darkBlue,
                  boxShadow: '0 2px 8px rgba(30, 74, 114, 0.35)',
                  '&:hover': { bgcolor: '#0f2e4f', boxShadow: '0 4px 12px rgba(30, 74, 114, 0.4)' },
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign in'}
              </Button>
            </>
          ) : (
            <>
              <FormControl fullWidth sx={{ mb: 2 }} variant="outlined">
                <InputLabel htmlFor="reg-username" sx={{ bgcolor: 'white', px: 0.5 }}>Username</InputLabel>
                <OutlinedInput
                  id="reg-username"
                  value={registrationData.username}
                  onChange={handleRegistrationChange('username')}
                  label="Username"
                  disabled={loading}
                  sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0e0e0' } }}
                />
              </FormControl>
              <FormControl fullWidth sx={{ mb: 2 }} variant="outlined">
                <InputLabel htmlFor="reg-email" sx={{ bgcolor: 'white', px: 0.5 }}>Email</InputLabel>
                <OutlinedInput
                  id="reg-email"
                  type="email"
                  value={registrationData.email}
                  onChange={handleRegistrationChange('email')}
                  label="Email"
                  disabled={loading}
                  sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0e0e0' } }}
                />
              </FormControl>
              <FormControl fullWidth sx={{ mb: 2 }} variant="outlined">
                <InputLabel htmlFor="reg-password" sx={{ bgcolor: 'white', px: 0.5 }}>Password</InputLabel>
                <OutlinedInput
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={registrationData.password}
                  onChange={handleRegistrationChange('password')}
                  label="Password"
                  disabled={loading}
                  endAdornment={
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  }
                  sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0e0e0' } }}
                />
              </FormControl>
              <FormControl fullWidth sx={{ mb: 3 }} variant="outlined">
                <InputLabel htmlFor="reg-confirm" sx={{ bgcolor: 'white', px: 0.5 }}>Confirm Password</InputLabel>
                <OutlinedInput
                  id="reg-confirm"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={registrationData.confirmPassword}
                  onChange={handleRegistrationChange('confirmPassword')}
                  label="Confirm Password"
                  disabled={loading}
                  endAdornment={
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end" size="small">
                        {showConfirmPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  }
                  sx={{ bgcolor: 'white', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0e0e0' } }}
                />
              </FormControl>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: darkBlue,
                  boxShadow: '0 2px 8px rgba(30, 74, 114, 0.35)',
                  '&:hover': { bgcolor: '#0f2e4f' },
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Create Account'}
              </Button>
            </>
          )}

          {isLogin && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 3 }}>
                <Box sx={{ flex: 1, height: 1, bgcolor: '#e0e0e0' }} />
                <Typography variant="body2" color="text.secondary">
                  or continue with
                </Typography>
                <Box sx={{ flex: 1, height: 1, bgcolor: '#e0e0e0' }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
                <Button
                  variant="outlined"
                  sx={{
                    minWidth: 48,
                    height: 48,
                    borderRadius: 2,
                    borderColor: '#e0e0e0',
                    bgcolor: 'white',
                    '&:hover': { borderColor: '#bdbdbd', bgcolor: '#fafafa' },
                  }}
                  disabled
                >
                  <Box component="span" sx={{ color: '#5f6368', fontWeight: 600, fontSize: '1.1rem' }}>G</Box>
                </Button>
                <Button
                  variant="outlined"
                  sx={{
                    minWidth: 48,
                    height: 48,
                    borderRadius: 2,
                    borderColor: '#e0e0e0',
                    bgcolor: 'white',
                    '&:hover': { borderColor: '#bdbdbd', bgcolor: '#fafafa' },
                  }}
                  disabled
                >
                  <Box component="span" sx={{ color: '#24292f', fontSize: '1.25rem' }}>⌘</Box>
                </Button>
                <Button
                  variant="outlined"
                  sx={{
                    minWidth: 48,
                    height: 48,
                    borderRadius: 2,
                    borderColor: '#e0e0e0',
                    bgcolor: 'white',
                    '&:hover': { borderColor: '#bdbdbd', bgcolor: '#fafafa' },
                  }}
                  disabled
                >
                  <Box component="span" sx={{ color: '#1877f2', fontWeight: 700, fontSize: '1.1rem' }}>f</Box>
                </Button>
              </Box>
            </>
          )}

          <Box sx={{ textAlign: 'center', mt: 3 }}>
            <Typography component="span" variant="body2" color="text.secondary">
              {isLogin ? "Don't have an account yet? " : 'Already have an account? '}
            </Typography>
            <Typography
              component="button"
              type="button"
              onClick={toggleMode}
              sx={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: darkBlue,
                fontSize: '0.875rem',
                fontWeight: 600,
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {isLogin ? 'Register for free' : 'Sign in'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default LoginPage;

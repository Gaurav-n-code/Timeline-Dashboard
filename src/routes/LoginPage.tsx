import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { getApiErrorMessage } from '../lib/api/errorUtils';

type LoginFormState = {
  username: string;
  password: string;
};

type FieldErrors = Partial<Record<keyof LoginFormState, string>>;

function getErrorMessage(error: unknown) {
  const message = getApiErrorMessage(error, 'Unable to sign in. Please try again.');

  if (isAxiosError(error) && error.response?.status === 401) {
    return 'Invalid username or password.';
  }

  return message;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isHydrating } = useAuth();
  const [form, setForm] = useState<LoginFormState>({ username: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(values: LoginFormState) {
    const nextErrors: FieldErrors = {};

    if (!values.username.trim()) {
      nextErrors.username = 'Username is required.';
    }

    if (!values.password.trim()) {
      nextErrors.password = 'Password is required.';
    }

    return nextErrors;
  }

  function handleChange(field: keyof LoginFormState) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;

      setForm((current) => ({ ...current, [field]: value }));
      setErrors((current) => ({ ...current, [field]: undefined }));
      setSubmitError('');
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate(form);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      await login({
        username: form.username.trim(),
        password: form.password,
      });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isBusy = isSubmitting || isHydrating;

  return (
    <Container
      maxWidth="sm"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        alignItems: 'center',
        py: 4,
      }}
    >
      <Paper
        elevation={6}
        sx={{
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
        }}
      >
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" component="h1" fontWeight={700}>
              Timeline Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Sign in to continue.
            </Typography>
          </Box>

          {submitError ? <Alert severity="error">{submitError}</Alert> : null}

          <Box component="form" noValidate onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Username"
                value={form.username}
                onChange={handleChange('username')}
                error={Boolean(errors.username)}
                helperText={errors.username}
                autoComplete="username"
                fullWidth
                disabled={isBusy}
              />

              <TextField
                label="Password"
                type="password"
                value={form.password}
                onChange={handleChange('password')}
                error={Boolean(errors.password)}
                helperText={errors.password}
                autoComplete="current-password"
                fullWidth
                disabled={isBusy}
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isBusy}
                sx={{ mt: 1 }}
              >
                {isBusy ? 'Signing in...' : 'Sign in'}
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}

import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';

export function NotFoundPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleNavigation = () => {
    navigate(isAuthenticated ? '/dashboard' : '/login', { replace: true });
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper
          elevation={4}
          sx={{
            p: 6,
            width: '100%',
            textAlign: 'center',
            borderRadius: 3,
          }}
        >
          <Stack spacing={3} alignItems="center">
            <ErrorOutlineIcon color="primary" sx={{ fontSize: 72 }} />

            <Typography variant="h2" fontWeight={700}>
              404
            </Typography>

            <Typography variant="h5" fontWeight={600}>
              Page Not Found
            </Typography>

            <Typography color="text.secondary">
              The page you're looking for doesn't exist, may have been moved, or
              the URL is incorrect.
            </Typography>

            <Button variant="contained" size="large" onClick={handleNavigation}>
              {isAuthenticated ? 'Go to Dashboard' : 'Back to Login'}
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}

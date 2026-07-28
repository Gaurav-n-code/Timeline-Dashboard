import { useState } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';

function getInitials(name?: string | null, username?: string | null) {
  const source = name?.trim() || username?.trim() || 'User';
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'U';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function AppLayout() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleLogout() {
    setIsSigningOut(true);

    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        color="transparent"
        sx={{
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar
          sx={{
            minHeight: { xs: 72, sm: 80 },
            px: { xs: 2, sm: 3 },
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} noWrap>
              Timeline Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              Production visibility for one machine, one date, one shift
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <Avatar
              sx={{
                width: 40,
                height: 40,
                bgcolor: 'primary.main',
                fontSize: '0.875rem',
                fontWeight: 700,
              }}
            >
              {getInitials(user?.name, user?.username)}
            </Avatar>

            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {user?.name ?? 'User'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {user?.email ?? user?.username ?? ''}
              </Typography>
            </Box>

            <Button
              variant="outlined"
              color="inherit"
              onClick={handleLogout}
              disabled={isSigningOut}
              sx={{
                borderColor: 'divider',
                whiteSpace: 'nowrap',
              }}
            >
              {isSigningOut ? 'Signing out...' : 'Logout'}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, py: { xs: 2, sm: 3, md: 4 } }}>
        <Container maxWidth="xl" sx={{ height: '100%' }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}

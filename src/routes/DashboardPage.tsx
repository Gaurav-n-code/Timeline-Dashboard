import { Paper, Stack, Typography } from '@mui/material';

export function DashboardPage() {
  return (
    <Paper
      elevation={0}
      sx={{
        minHeight: { xs: 'calc(100vh - 180px)', sm: 'calc(100vh - 200px)' },
        p: { xs: 3, sm: 4 },
        borderRadius: 4,
        border: '1px solid',
        borderColor: 'divider',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
      }}
    >
      <Stack spacing={1.5} sx={{ maxWidth: 520 }}>
        <Typography variant="h5" component="h1" fontWeight={700}>
          Dashboard coming soon
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The app shell is ready. Timeline charts, filters, and analytics will be added in the next
          phase.
        </Typography>
      </Stack>
    </Paper>
  );
}

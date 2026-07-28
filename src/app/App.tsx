import { CssBaseline, ThemeProvider } from '@mui/material';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { theme } from '../theme/theme';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

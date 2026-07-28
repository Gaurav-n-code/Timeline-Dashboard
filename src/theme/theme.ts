import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0f766e',
    },
    secondary: {
      main: '#1d4ed8',
    },
    background: {
      default: '#f7f9fb',
      paper: '#ffffff',
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'].join(
      ',',
    ),
  },
});

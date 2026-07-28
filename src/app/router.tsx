import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '../routes/RootLayout';
import { LoginPage } from '../routes/LoginPage';
import { DashboardPage } from '../routes/DashboardPage';
import { NotFoundPage } from '../routes/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <LoginPage />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);

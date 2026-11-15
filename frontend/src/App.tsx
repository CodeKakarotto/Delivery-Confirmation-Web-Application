import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './components/Layout.tsx';
import { ConfirmationDetailPage } from './pages/ConfirmationDetailPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { DriverConfirmPage } from './pages/DriverConfirmPage.tsx';
import { DriverStartPage } from './pages/DriverStartPage.tsx';
import { HomePage, NotFoundPage } from './pages/HomePage.tsx';

/** No sign-in screen: a project requirement for this prototype (see docs/SECURITY.md for what that means). */
const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/confirm', element: <DriverStartPage /> },
      { path: '/confirm/:orderId', element: <DriverConfirmPage /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/dashboard/confirmations/:id', element: <ConfirmationDetailPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

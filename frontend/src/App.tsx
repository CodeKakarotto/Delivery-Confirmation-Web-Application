import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router';
import { AppLayout } from './components/Layout.tsx';
import { RequireAuth } from './components/RequireAuth.tsx';
import { Spinner } from './components/ui.tsx';
import { AuthProvider, ROLE_HOME, useAuth } from './lib/auth.tsx';
import { OfflineProvider } from './lib/offline.tsx';
import { CalendarPage } from './pages/CalendarPage.tsx';
import { ConfirmationDetailPage } from './pages/ConfirmationDetailPage.tsx';
import { DriverConfirmPage } from './pages/DriverConfirmPage.tsx';
import { DriverDashboardPage } from './pages/DriverDashboardPage.tsx';
import { NotFoundPage } from './pages/HomePage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { ShopDeliveriesPage } from './pages/ShopDeliveriesPage.tsx';
import { ShopOrderPage } from './pages/ShopOrderPage.tsx';
import { DriverSearchPage } from './pages/DriverSearchPage.tsx';
import { ShopReportPage } from './pages/ShopReportPage.tsx';
import { ShopSearchPage } from './pages/ShopSearchPage.tsx';

const driver = (page: ReactNode) => <RequireAuth role="driver">{page}</RequireAuth>;
const employee = (page: ReactNode) => <RequireAuth role="employee">{page}</RequireAuth>;

/** "/" sends signed-in people to their own dashboard and everyone else to sign in. */
function Home() {
  const { status, user } = useAuth();
  if (status === 'loading') return <Spinner label="Checking your sign-in" />;
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />;
}

function LegacyRecordRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/shop/confirmations/${id}`} replace />;
}

/**
 * Drivers: Dashboard (awaiting deliveries, find an order, recently confirmed) and Confirmations (calendar of their own
 * confirmations). Only drivers can confirm a delivery.
 * Shop employees: Dashboard (calendar of all deliveries), Deliveries (list by day) and Search. View only.
 */
const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Home /> },
      // Drivers
      { path: '/driver', element: driver(<DriverDashboardPage />) },
      { path: '/driver/confirmations', element: driver(<CalendarPage variant="driver" />) },
      { path: '/driver/search', element: driver(<DriverSearchPage />) },
      { path: '/driver/confirmations/:id', element: driver(<ConfirmationDetailPage />) },
      { path: '/confirm', element: <Navigate to="/driver" replace /> },
      { path: '/confirm/:orderId', element: driver(<DriverConfirmPage />) },
      // Shop employees
      { path: '/shop', element: employee(<CalendarPage variant="employee" />) },
      { path: '/shop/deliveries', element: employee(<ShopDeliveriesPage />) },
      { path: '/shop/search', element: employee(<ShopSearchPage />) },
      { path: '/shop/confirmations', element: <Navigate to="/shop" replace /> },
      { path: '/shop/confirmations/:id', element: employee(<ConfirmationDetailPage />) },
      { path: '/shop/orders/:orderId', element: employee(<ShopOrderPage />) },
      { path: '/shop/report', element: employee(<ShopReportPage />) },
      // Old links from earlier versions.
      { path: '/dashboard', element: <Navigate to="/" replace /> },
      // The paper slip section was removed.
      { path: '/shop/paper/*', element: <Navigate to="/" replace /> },
      { path: '/driver/paper-slips', element: <Navigate to="/" replace /> },
      { path: '/dashboard/confirmations/:id', element: <LegacyRecordRedirect /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <AuthProvider>
      <OfflineProvider>
        <RouterProvider router={router} />
      </OfflineProvider>
    </AuthProvider>
  );
}

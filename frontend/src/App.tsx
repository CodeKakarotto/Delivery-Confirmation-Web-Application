import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router';
import { AppLayout } from './components/Layout.tsx';
import { RoleGate } from './components/RoleGate.tsx';
import { RoleProvider } from './lib/role.tsx';
import { ConfirmationDetailPage } from './pages/ConfirmationDetailPage.tsx';
import { DriverConfirmPage } from './pages/DriverConfirmPage.tsx';
import { DriverStartPage } from './pages/DriverStartPage.tsx';
import { HomePage, NotFoundPage } from './pages/HomePage.tsx';
import { ShopCalendarPage } from './pages/ShopCalendarPage.tsx';
import { ShopOrderPage } from './pages/ShopOrderPage.tsx';

/**
 * No sign-in (prototype): the home screen asks whether you are a driver or a shop employee, and each section is only
 * shown to its role (RoleGate; the server checks it too). Real logins replace this in the final system.
 */
const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      // Drivers
      { path: '/confirm', element: <RoleGate role="driver"><DriverStartPage /></RoleGate> },
      { path: '/confirm/:orderId', element: <RoleGate role="driver"><DriverConfirmPage /></RoleGate> },
      // Shop employees
      { path: '/shop', element: <RoleGate role="shop"><ShopCalendarPage /></RoleGate> },
      { path: '/shop/confirmations', element: <Navigate to="/shop" replace /> },
      { path: '/shop/confirmations/:id', element: <RoleGate role="shop"><ConfirmationDetailPage /></RoleGate> },
      { path: '/shop/orders/:orderId', element: <RoleGate role="shop"><ShopOrderPage /></RoleGate> },
      // Old links from the first version.
      { path: '/dashboard', element: <Navigate to="/shop" replace /> },
      { path: '/dashboard/confirmations/:id', element: <LegacyRecordRedirect /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

function LegacyRecordRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/shop/confirmations/${id}`} replace />;
}

export function App() {
  return (
    <RoleProvider>
      <RouterProvider router={router} />
    </RoleProvider>
  );
}

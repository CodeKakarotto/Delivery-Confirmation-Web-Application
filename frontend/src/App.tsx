import { createBrowserRouter, Navigate, RouterProvider, useParams } from 'react-router';
import { AppLayout } from './components/Layout.tsx';
import { ShopLayout } from './components/ShopLayout.tsx';
import { ConfirmationDetailPage } from './pages/ConfirmationDetailPage.tsx';
import { DriverConfirmPage } from './pages/DriverConfirmPage.tsx';
import { DriverStartPage } from './pages/DriverStartPage.tsx';
import { HomePage, NotFoundPage } from './pages/HomePage.tsx';
import { ShopConfirmationsPage } from './pages/ShopConfirmationsPage.tsx';
import { ShopOrderPage } from './pages/ShopOrderPage.tsx';
import { ShopOverviewPage } from './pages/ShopOverviewPage.tsx';

/** No sign-in screen: a project requirement for this prototype (see docs/SECURITY.md for what that means). */
const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      // Drivers
      { path: '/confirm', element: <DriverStartPage /> },
      { path: '/confirm/:orderId', element: <DriverConfirmPage /> },
      // Shop employees
      {
        path: '/shop',
        element: <ShopLayout />,
        children: [
          { index: true, element: <ShopOverviewPage /> },
          { path: 'confirmations', element: <ShopConfirmationsPage /> },
          { path: 'confirmations/:id', element: <ConfirmationDetailPage /> },
          { path: 'orders/:orderId', element: <ShopOrderPage /> },
        ],
      },
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
  return <RouterProvider router={router} />;
}

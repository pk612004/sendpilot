import { DashboardProvider } from '@/lib/dashboard-context';

export default function DashboardLayout({ children }) {
  return <DashboardProvider>{children}</DashboardProvider>;
}

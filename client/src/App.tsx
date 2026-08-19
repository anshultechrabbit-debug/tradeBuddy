import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { RadarPage } from './pages/RadarPage';
import { DeepDivePage } from './pages/DeepDivePage';
import { PortfolioPage } from './pages/PortfolioPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { MarketPage } from './pages/MarketPage';
import { StrategyPage } from './pages/StrategyPage';
import { AlertsPage } from './pages/AlertsPage';
import { JournalPage } from './pages/JournalPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminHealthPage } from './pages/admin/AdminHealthPage';
import { AdminBrokersPage } from './pages/admin/AdminBrokersPage';
import { AdminCompliancePage } from './pages/admin/AdminCompliancePage';
import { AdminScanUniversePage } from './pages/admin/AdminScanUniversePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/radar" element={<RadarPage />} />
          <Route path="/radar/:symbol" element={<DeepDivePage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/strategy" element={<StrategyPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route element={<ProtectedRoute adminOnly />}>
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/system-health" element={<AdminHealthPage />} />
          <Route path="/admin/brokers" element={<AdminBrokersPage />} />
          <Route path="/admin/compliance" element={<AdminCompliancePage />} />
          <Route path="/admin/scan-universe" element={<AdminScanUniversePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
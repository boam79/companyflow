import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AuthProvider } from './lib/AuthContext'
import { AssetsPage } from './pages/AssetsPage'
import { ContractsPage } from './pages/ContractsPage'
import { DeviceSetupPage } from './pages/DeviceSetupPage'
import { GuestHomePage } from './pages/GuestHomePage'
import { GuestLayout } from './pages/GuestLayout'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MasterDataPage } from './pages/MasterDataPage'
import { OperatorCompaniesPage } from './pages/OperatorCompaniesPage'
import { PeoplePage } from './pages/PeoplePage'
import { QrScanPage } from './pages/QrScanPage'
import { StockPage } from './pages/StockPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/ops/companies" element={<OperatorCompaniesPage />} />
            <Route path="/setup" element={<DeviceSetupPage />} />
            <Route path="/master" element={<MasterDataPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/q/:token" element={<QrScanPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route element={<GuestLayout />}>
              <Route path="/guest" element={<GuestHomePage />} />
              <Route path="/guest/master" element={<MasterDataPage />} />
              <Route path="/guest/stock" element={<StockPage />} />
              <Route path="/guest/assets" element={<AssetsPage />} />
              <Route path="/guest/people" element={<PeoplePage />} />
              <Route path="/guest/contracts" element={<ContractsPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

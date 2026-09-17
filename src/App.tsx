import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AuthProvider } from './lib/AuthContext'
import { AssetsPage } from './pages/AssetsPage'
import { ContractsPage } from './pages/ContractsPage'
import { DeviceSetupPage } from './pages/DeviceSetupPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MasterDataPage } from './pages/MasterDataPage'
import { OperatorCompaniesPage } from './pages/OperatorCompaniesPage'
import { PeoplePage } from './pages/PeoplePage'
import { ReportsPage } from './pages/ReportsPage'
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
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

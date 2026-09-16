import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { AuthProvider } from './lib/AuthContext'
import { DeviceSetupPage } from './pages/DeviceSetupPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MasterDataPage } from './pages/MasterDataPage'
import { OperatorCompaniesPage } from './pages/OperatorCompaniesPage'

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
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

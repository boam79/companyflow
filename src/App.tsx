import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DeviceSetupPage } from './pages/DeviceSetupPage'
import { HomePage } from './pages/HomePage'
import { OperatorCompaniesPage } from './pages/OperatorCompaniesPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/ops/companies" element={<OperatorCompaniesPage />} />
          <Route path="/setup" element={<DeviceSetupPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

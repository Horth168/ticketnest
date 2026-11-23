import './index.css'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import { AppProvider } from './context/App'
import { I18nProvider } from './i18n'
import { installErrorReporting } from './lib/errors'
import Account, { MyInvoices, MyListings, MyWallet, Profile } from './pages/account/Account'
import { Forgot, Login, Register, Reset } from './pages/Auth'
import Checkout, { OrderPage, RequireAuth } from './pages/Checkout'
import Concert, { Artist } from './pages/Concert'
import Explore, { Artists } from './pages/Explore'
import Home from './pages/Home'
import { HowItWorks, NotFound, Policy, Support } from './pages/Info'
import Sell from './pages/Sell'
import TicketsPage from './pages/Tickets'
import Guarantee from './pages/Guarantee'

const AdminApp = lazy(() => import('./pages/admin/AdminApp'))
const MiniApp = lazy(() => import('./tg/MiniApp'))

// Opened from the bot's Mini App button at the site root? Go to the Mini App shell.
if (window.Telegram?.WebApp?.initData && !location.pathname.startsWith('/tg')) {
  history.replaceState(null, '', '/tg' + (location.pathname === '/' ? '' : location.pathname))
}

installErrorReporting()

// iPhone Safari ignores user-scalable=no, so block pinch-zoom gestures here too (app feel, no dizzy zooming)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault() }, { passive: false })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
      <AppProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/admin/*" element={<AdminApp />} />
            <Route path="/tg/*" element={<MiniApp />} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="concerts" element={<Explore />} />
              <Route path="concerts/:slug" element={<Concert />} />
              <Route path="artists" element={<Artists />} />
              <Route path="artists/:slug" element={<Artist />} />
              <Route path="checkout/:listingId" element={<RequireAuth><Checkout /></RequireAuth>} />
              <Route path="orders/:number" element={<RequireAuth><OrderPage /></RequireAuth>} />
              <Route path="sell" element={<RequireAuth><Sell /></RequireAuth>} />
              <Route path="tickets" element={<RequireAuth><TicketsPage /></RequireAuth>} />
              <Route path="account" element={<RequireAuth><Account /></RequireAuth>}>
                <Route index element={null} />
                <Route path="settings" element={<Profile />} />
                <Route path="orders" element={<Navigate to="/tickets" replace />} />
                <Route path="listings" element={<MyListings />} />
                <Route path="wallet" element={<MyWallet />} />
                <Route path="invoices" element={<MyInvoices />} />
              </Route>
              <Route path="login" element={<Login />} />
              <Route path="register" element={<Register />} />
              <Route path="forgot-password" element={<Forgot />} />
              <Route path="reset-password" element={<Reset />} />
              <Route path="how-it-works" element={<HowItWorks />} />
              <Route path="guarantee" element={<Guarantee />} />
              <Route path="policies/:slug" element={<Policy />} />
              <Route path="support" element={<Support />} />
              <Route path="sell-tickets" element={<Navigate to="/sell" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </AppProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)

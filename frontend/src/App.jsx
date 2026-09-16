import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { UIProvider } from './context/UIContext';
import { VoicesProvider } from './context/VoicesContext';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Voices from './pages/Voices';
import Library from './pages/Library';
import Settings from './pages/Settings';

function PublicOnly({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const from = location.state?.from;
  const target = from && !['/login', '/signup'].includes(from) ? from : '/';
  return isAuthenticated ? <Navigate to={target} replace /> : children;
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <UIProvider>
          <VoicesProvider>
            <BrowserRouter>
              <ErrorBoundary>
                <Routes>
                  <Route
                    path="/login"
                    element={
                      <PublicOnly>
                        <Login />
                      </PublicOnly>
                    }
                  />
                  <Route
                    path="/signup"
                    element={
                      <PublicOnly>
                        <Signup />
                      </PublicOnly>
                    }
                  />

                  <Route
                    element={
                      <ProtectedRoute>
                        <AppLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/" element={<Home />} />
                    <Route path="/tts" element={<Home focusEditor />} />
                    <Route path="/voices" element={<Voices />} />
                    <Route path="/library" element={<Library />} />
                    <Route path="/history" element={<Navigate to="/library" replace />} />
                    <Route path="/prompts" element={<Navigate to="/library" replace />} />
                    <Route path="/settings" element={<Settings />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ErrorBoundary>
            </BrowserRouter>
          </VoicesProvider>
        </UIProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;

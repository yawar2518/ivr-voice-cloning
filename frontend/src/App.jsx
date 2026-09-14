import { Navigate, BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Generate from './pages/Generate';
import PromptLibrary from './pages/PromptLibrary';
import AuditLog from './pages/AuditLog';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

function RootRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/generate' : '/login'} replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/generate"
              element={
                <ProtectedRoute>
                  <Generate />
                </ProtectedRoute>
              }
            />
            <Route
              path="/prompts"
              element={
                <ProtectedRoute>
                  <PromptLibrary />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-log"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AuditLog />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<RootRedirect />} />
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

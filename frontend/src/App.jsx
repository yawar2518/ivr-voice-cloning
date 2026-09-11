import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { apiClient } from './api/client';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';

function Dashboard() {
  const [prompts, setPrompts] = useState(null);

  useEffect(() => {
    apiClient.getPrompts().then((res) => setPrompts(res));
  }, []);

  return (
    <div>
      <h1>IVR Voice Cloning Dashboard</h1>
      <p>Frontend scaffold is working.</p>
      <pre>{prompts ? JSON.stringify(prompts, null, 2) : 'Loading...'}</pre>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

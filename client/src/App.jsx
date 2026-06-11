import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from './components/ui/toast';
import MainLayout from './layouts/MainLayout';
import HomePage from './pages/HomePage';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<HomePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

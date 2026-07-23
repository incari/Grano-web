import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BottomNav from './components/BottomNav/BottomNav';
import BrewSetup from './pages/Brew/BrewSetup';
import Beans from './pages/Beans/Beans';
import Recipes from './pages/Recipes/Recipes';
import Log from './pages/Log/Log';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BrewSetup />} />
        <Route path="/beans" element={<Beans />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/log" element={<Log />} />
      </Routes>
      <BottomNav />
    </BrowserRouter>
  );
}

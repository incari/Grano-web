import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import BottomNav from "./components/BottomNav/BottomNav";
import Landing from "./pages/Home/Landing";
import BrewSetup from "./pages/Brew/BrewSetup";
import Beans from "./pages/Beans/Beans";
import Recipes from "./pages/Recipes/Recipes";
import Log from "./pages/Log/Log";
import BrewDetails from "./pages/Log/BrewDetails";
import CompareBrews from "./pages/Log/CompareBrews";

function ChromeAwareNav() {
  const { pathname } = useLocation();
  if (pathname === "/") return null;
  return <BottomNav />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Landing />}
        />
        <Route
          path="/brew"
          element={<BrewSetup />}
        />
        <Route
          path="/beans"
          element={<Beans />}
        />
        <Route
          path="/recipes"
          element={<Recipes />}
        />
        <Route
          path="/log"
          element={<Log />}
        />
        <Route
          path="/log/compare"
          element={<CompareBrews />}
        />
        <Route
          path="/log/:id"
          element={<BrewDetails />}
        />
      </Routes>
      <ChromeAwareNav />
    </BrowserRouter>
  );
}

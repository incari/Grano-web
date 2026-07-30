import { BrowserRouter, Routes, Route } from "react-router-dom";
import BottomNav from "./components/BottomNav/BottomNav";
import BrewSetup from "./pages/Brew/BrewSetup";
import Beans from "./pages/Beans/Beans";
import Recipes from "./pages/Recipes/Recipes";
import Log from "./pages/Log/Log";
import BrewDetails from "./pages/Log/BrewDetails";
import ScalePage from "./pages/Scale/Scale";
import { ScaleProvider } from "./scale/ScaleProvider";

export default function App() {
  return (
    <ScaleProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
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
            path="/log/:id"
            element={<BrewDetails />}
          />
          <Route
            path="/scale"
            element={<ScalePage />}
          />
        </Routes>
        <BottomNav />
      </BrowserRouter>
    </ScaleProvider>
  );
}

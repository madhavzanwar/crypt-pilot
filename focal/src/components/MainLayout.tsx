import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";

export function MainLayout() {
  return (
    <div className="relative min-h-screen">
      <Navbar />
      <main className="relative z-0">
        <Outlet />
      </main>
    </div>
  );
}

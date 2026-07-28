import { NavLink } from "react-router-dom";
import { Coffee, Bean, NotebookText, ClipboardList, House } from "lucide-react";
import styles from "./BottomNav.module.scss";

const items = [
  { to: "/", Icon: House, label: "Home" },
  { to: "/brew", Icon: Coffee, label: "Brew" },
  { to: "/recipes", Icon: NotebookText, label: "Recipes" },
  { to: "/beans", Icon: Bean, label: "Beans" },
  { to: "/log", Icon: ClipboardList, label: "Log" },
];

export default function BottomNav() {
  return (
    <nav
      id="bottom-nav"
      className={styles.nav}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          className={({ isActive }) =>
            `${styles.item} ${isActive ? styles.active : ""}`
          }
        >
          <span className={styles.icon}>
            <item.Icon
              size={22}
              strokeWidth={2}
            />
          </span>
          <span className={styles.label}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

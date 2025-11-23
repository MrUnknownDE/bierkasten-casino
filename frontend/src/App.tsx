// frontend/src/App.tsx
import React, { useEffect, useState } from "react";
import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { getMe, getLoginUrl, logout, MeResponse, getAdminMe, AdminMeResponse } from "./api";
import { GamePage } from "./pages/GamePage";
import { AdminPage } from "./pages/AdminPage";

const AdminRoute: React.FC<{ adminInfo: AdminMeResponse | null; children: React.ReactNode }> = ({ adminInfo, children }) => {
  if (!adminInfo || !adminInfo.is_admin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [adminInfo, setAdminInfo] = useState<AdminMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  async function loadUser() {
    setLoading(true);
    try {
      const meRes = await getMe();
      setMe(meRes);
      if (meRes) {
        const adminRes = await getAdminMe();
        setAdminInfo(adminRes);
      }
    } catch {
      setMe(null);
      setAdminInfo(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  const handleLogin = () => {
    window.location.href = getLoginUrl();
  };

  const handleLogout = async () => {
    await logout();
    setMe(null);
    setAdminInfo(null);
  };

  if (loading) {
    return (
      <div style={{ color: 'white', textAlign: 'center', fontSize: '1.5rem' }}>
        Lade Bierbaron Casino...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #2b0b3a 0, #050509 60%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: location.pathname.startsWith('/admin') ? "1200px" : "960px", // Admin-Seite breiter
          background: "rgba(10,10,18,0.95)",
          borderRadius: "18px",
          padding: "24px 28px 30px",
          boxShadow: "0 18px 45px rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
          transition: 'max-width 0.3s ease-in-out',
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
            gap: "16px",
            flexWrap: 'wrap'
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "1.8rem", textAlign: "left" }}>
              <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>🍺 Bierbaron Casino</Link>
            </h1>
            {adminInfo?.is_admin && (
              <Link to="/admin" style={{ color: "#ffb347", textDecoration: "none", fontSize: "0.9rem", marginLeft: '4px' }}>
                🛠 Admin Panel
              </Link>
            )}
          </div>

          <div>
            {me ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {me.avatar_url && (
                  <img src={me.avatar_url} alt="Avatar" style={{ width: 44, height: 44, borderRadius: "50%" }} />
                )}
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.9rem" }}>{me.discord_name}</div>
                  <button
                    onClick={handleLogout}
                    style={{
                      marginTop: 2,
                      fontSize: "0.75rem",
                      padding: "4px 8px",
                      background: "transparent",
                      border: "1px solid #555",
                      borderRadius: 999,
                      color: "#ccc",
                      cursor: "pointer",
                    }}
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: "none",
                  background: "#5865F2",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Mit Discord einloggen
              </button>
            )}
          </div>
        </header>

        <Routes>
          <Route path="/*" element={<GamePage me={me} />} />
          <Route
            path="/admin/*"
            element={
              <AdminRoute adminInfo={adminInfo}>
                <AdminPage adminInfo={adminInfo} />
              </AdminRoute>
            }
          />
        </Routes>
      </div>
    </div>
  );
};

export default App;
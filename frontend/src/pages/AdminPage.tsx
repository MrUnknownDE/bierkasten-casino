// frontend/src/pages/AdminPage.tsx
import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import {
  AdminMeResponse,
  AdminStats,
  getAdminStats,
  AdminUserSearchResult,
  adminSearchUsers,
  adminFindUserByDiscord,
  AdminUserSummary,
  getAdminUserTransactions,
  AdminTransaction,
  getWinChance,
  setWinChance,
  adminAdjustBalance,
  adminResetWallet
} from "../api";

interface AdminPageProps {
  adminInfo: AdminMeResponse | null;
}

export const AdminPage: React.FC<AdminPageProps> = ({ adminInfo }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsHistory, setStatsHistory] = useState<AdminStats[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminUserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  
  const [adjustAmount, setAdjustAmount] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>("");
  
  const [winChance, setWinChance] = useState<number>(1.0);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const statsData = await getAdminStats();
        setStats(statsData);
        setStatsHistory(prev => [...prev.slice(-9), statsData]); // Keep last 10 entries
        
        const chanceData = await getWinChance();
        setWinChance(chanceData.win_chance_modifier);
      } catch (err: any) {
        setError(err.message || "Failed to load initial admin data");
      }
    };
    fetchAllData();
    const interval = setInterval(fetchAllData, 30000); // Refresh stats every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const debounceTimer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await adminSearchUsers(searchQuery);
        setSearchResults(results);
      } catch (err: any) { setError(err.message || "Suche fehlgeschlagen"); }
      finally { setIsSearching(false); }
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleSelectUser = async (user: AdminUserSearchResult) => {
    setIsBusy(true);
    setError(null);
    setSearchQuery(user.discord_name);
    setSearchResults([]);
    try {
      const [fullUserData, transactionsData] = await Promise.all([
        adminFindUserByDiscord(user.discord_id),
        getAdminUserTransactions(user.user_id)
      ]);
      setSelectedUser(fullUserData);
      setTransactions(transactionsData);
      setAdjustAmount(0);
      setAdjustReason("");
    } catch (err: any) {
      setError(err.message || "User-Daten konnten nicht geladen werden");
      setSelectedUser(null);
    } finally {
      setIsBusy(false);
    }
  };
  
  const handleUpdateWinChance = async (modifier: number) => {
    try {
      const res = await setWinChance(modifier);
      setWinChance(res.win_chance_modifier);
    } catch (err: any) {
      setError(err.message || "Einstellung konnte nicht gespeichert werden");
    }
  };

  const handleAdjustBalance = async () => {
    if (!selectedUser) return;
    setIsBusy(true);
    try {
      const res = await adminAdjustBalance(selectedUser.user_id, adjustAmount, adjustReason);
      setSelectedUser(prev => prev ? { ...prev, balance: res.balance } : null);
      setAdjustAmount(0);
      setAdjustReason("");
      // Refresh transactions
      const transactionsData = await getAdminUserTransactions(selectedUser.user_id);
      setTransactions(transactionsData);
    } catch (err: any) {
      setError(err.message || "Anpassung fehlgeschlagen");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div style={{ color: '#f5f5f5' }}>
      {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
      
      {/* Stats Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#1a1a2e', padding: '16px', borderRadius: '8px' }}>
          <h4>Online User (5min)</h4>
          <p style={{ fontSize: '2rem', margin: 0 }}>{stats?.online_users ?? '...'}</p>
        </div>
        <div style={{ background: '#1a1a2e', padding: '16px', borderRadius: '8px' }}>
          <h4>Registrierte User</h4>
          <p style={{ fontSize: '2rem', margin: 0 }}>{stats?.total_users ?? '...'}</p>
        </div>
        <div style={{ background: '#1a1a2e', padding: '16px', borderRadius: '8px' }}>
          <h4>Bierkästen im Umlauf</h4>
          <p style={{ fontSize: '2rem', margin: 0 }}>{stats?.total_supply.toLocaleString('de-DE') ?? '...'}</p>
        </div>
      </div>

      {/* Graph Section */}
      <div style={{ background: '#1a1a2e', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
        <h3>Geldmengen-Verlauf (Inflation)</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={statsHistory}>
              <XAxis dataKey="timestamp" tickFormatter={(ts) => new Date().toLocaleTimeString()} />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0b0b10', border: '1px solid #555' }} />
              <Legend />
              <Bar dataKey="total_supply" name="Bierkästen im Umlauf" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Management Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        {/* Left Column: Settings & User Search */}
        <div>
          <div style={{ background: '#1a1a2e', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h4>Globale Einstellungen</h4>
            <label>Gewinnchance-Modifikator: <strong>{winChance.toFixed(1)}x</strong></label>
            <input
              type="range"
              min="0.1"
              max="5.0"
              step="0.1"
              value={winChance}
              onChange={(e) => setWinChance(parseFloat(e.target.value))}
              onMouseUp={(e) => handleUpdateWinChance(parseFloat(e.currentTarget.value))}
              style={{ width: '100%', marginTop: '8px' }}
            />
          </div>
          <div style={{ background: '#1a1a2e', padding: '16px', borderRadius: '8px', position: 'relative' }}>
            <h4>User Management</h4>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="User suchen..." style={{ width: '100%', padding: '8px', background: '#0b0b10', border: '1px solid #555', color: 'white', borderRadius: '4px' }} />
            {searchResults.length > 0 && (
              <div style={{ position: 'absolute', background: '#2c2c4a', border: '1px solid #555', borderRadius: '4px', width: '100%', zIndex: 10 }}>
                {searchResults.map(u => <div key={u.user_id} onClick={() => handleSelectUser(u)} style={{ padding: '8px', cursor: 'pointer' }}>{u.discord_name}</div>)}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected User Details */}
        <div>
          {selectedUser ? (
            <div style={{ background: '#1a1a2e', padding: '16px', borderRadius: '8px' }}>
              <h4>Details für: {selectedUser.discord_name}</h4>
              <p>Guthaben: {selectedUser.balance.toLocaleString('de-DE')} Bierkästen</p>
              
              {/* Adjust Balance */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                <input type="number" value={adjustAmount} onChange={e => setAdjustAmount(parseInt(e.target.value))} style={{ padding: '8px', background: '#0b0b10', border: '1px solid #555', color: 'white', borderRadius: '4px' }} />
                <input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="Grund" style={{ flex: 1, padding: '8px', background: '#0b0b10', border: '1px solid #555', color: 'white', borderRadius: '4px' }} />
                <button onClick={handleAdjustBalance} disabled={isBusy}>Buchen</button>
              </div>

              {/* Transactions */}
              <h5>Letzte Transaktionen</h5>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {transactions.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333', padding: '4px 0' }}>
                    <span>{new Date(t.created_at).toLocaleString('de-DE')}</span>
                    <span>{t.reason}</span>
                    <span style={{ color: t.amount >= 0 ? 'lightgreen' : 'salmon' }}>{t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('de-DE')}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', background: '#1a1a2e', borderRadius: '8px' }}>
              <p>Bitte einen User suchen und auswählen, um Details anzuzeigen.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
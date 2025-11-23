// frontend/src/pages/CrashPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { MeResponse, WalletResponse, getWallet } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PlayerInfo {
  userId: number;
  discordName: string;
  bet: number;
  cashedOutAt?: number;
}

interface CrashPageProps {
  me: MeResponse | null;
}

export const CrashPage: React.FC<CrashPageProps> = ({ me }) => {
  const [phase, setPhase] = useState('connecting');
  const [multiplier, setMultiplier] = useState(1.00);
  const [history, setHistory] = useState<{ time: number, value: number }[]>([]);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [betAmount, setBetAmount] = useState(100);
  const [playerList, setPlayerList] = useState<PlayerInfo[]>([]);
  const [hasBet, setHasBet] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  const loadWallet = async () => {
    if (me) {
      try {
        const walletData = await getWallet();
        setWallet(walletData);
      } catch (err: any) {
        setError("Konnte das Guthaben nicht laden.");
      }
    }
  };

  useEffect(() => {
    loadWallet();
  }, [me]);

  useEffect(() => {
    const wsUrl = `wss://${window.location.host}/ws`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("WebSocket connected");
      setPhase('connected');
      if (me) {
        ws.current?.send(JSON.stringify({ type: 'auth', payload: { userId: me.id } }));
      }
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'gameState':
          setPhase(data.phase);
          setMultiplier(data.multiplier);
          setPlayerList(data.players);
          break;
        case 'newRound':
          setPhase(data.phase);
          setHistory([]);
          setMultiplier(1.00);
          setHasBet(false); 
          setError(null);
          break;
        case 'roundStart':
          setPhase(data.phase);
          break;
        case 'multiplierUpdate':
          setMultiplier(data.multiplier);
          setHistory(prev => [...prev, { time: prev.length, value: data.multiplier }]);
          break;
        case 'crash':
          setPhase('crashed');
          setMultiplier(data.multiplier);
          loadWallet(); // Guthaben nach der Runde neu laden
          break;
        case 'playerUpdate':
          setPlayerList(data.players);
          break;
        case 'cashout_success':
          loadWallet(); // Guthaben nach erfolgreichem Cashout neu laden
          break;
        case 'error':
          setError(data.message);
          setHasBet(false); // Einsatz fehlgeschlagen, erlaube neuen Versuch
          loadWallet(); // Guthaben synchronisieren
          break;
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket disconnected");
      setPhase('disconnected');
    };

    return () => {
      ws.current?.close();
    };
  }, [me]);

  const handlePlaceBet = () => {
    if (ws.current?.readyState === WebSocket.OPEN && phase === 'betting' && !hasBet) {
      setError(null);
      ws.current.send(JSON.stringify({ type: 'bet', payload: { amount: betAmount } }));
      setHasBet(true);
    }
  };

  const handleCashout = () => {
    const player = playerList.find(p => p.userId === me?.id);
    if (ws.current?.readyState === WebSocket.OPEN && phase === 'running' && player && !player.cashedOutAt) {
      ws.current.send(JSON.stringify({ type: 'cashout' }));
    }
  };

  const getStatusMessage = () => {
    switch (phase) {
      case 'connecting': return 'Verbinde mit dem Server...';
      case 'connected':
      case 'waiting': return 'Warte auf die nächste Runde...';
      case 'betting': return 'Einsätze platzieren!';
      case 'running': return 'Runde läuft...';
      case 'crashed': return `CRASHED @ ${multiplier.toFixed(2)}x`;
      case 'disconnected': return 'Verbindung verloren. Bitte Seite neu laden.';
      default: return '';
    }
  };

  if (!me) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        <h2>🚀 Bier-Crash</h2>
        <p>Bitte logge dich mit Discord ein, um zu spielen.</p>
      </div>
    );
  }

  const myPlayerInfo = playerList.find(p => p.userId === me.id);
  const canBet = phase === 'betting' && !myPlayerInfo;
  const canCashout = phase === 'running' && myPlayerInfo && !myPlayerInfo.cashedOutAt;

  return (
    <div>
      {error && <div style={{ color: 'salmon', marginBottom: '1rem', textAlign: 'center', background: 'rgba(250, 128, 114, 0.1)', padding: '8px', borderRadius: '4px' }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '24px', alignItems: 'flex-start' }}>
        {/* Linke Spalte: Steuerung & Spielerliste */}
        <div>
          <div style={{ background: '#1a1a2e', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h4>Dein Guthaben</h4>
            <p style={{ fontSize: '1.5rem', margin: '0 0 16px 0', color: '#ffb347' }}>
              {wallet ? wallet.balance.toLocaleString('de-DE') : '...'} Bierkästen
            </p>
            <h4>Dein Einsatz</h4>
            <input 
              type="number" 
              value={betAmount}
              onChange={e => setBetAmount(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={!canBet}
              style={{ width: '100%', padding: '8px', background: '#0b0b10', border: '1px solid #555', color: 'white', borderRadius: '4px' }} 
            />
            <button 
              onClick={handlePlaceBet} 
              disabled={!canBet}
              style={{ width: '100%', padding: '12px', marginTop: '16px', background: canBet ? 'limegreen' : '#555', border: 'none', borderRadius: '4px', color: 'white', fontWeight: 'bold', cursor: canBet ? 'pointer' : 'not-allowed' }}
            >
              {myPlayerInfo ? 'Einsatz platziert' : 'Einsatz platzieren'}
            </button>
            <button 
              onClick={handleCashout} 
              disabled={!canCashout}
              style={{ width: '100%', padding: '12px', marginTop: '8px', background: canCashout ? 'dodgerblue' : '#555', border: 'none', borderRadius: '4px', color: 'white', fontWeight: 'bold', cursor: canCashout ? 'pointer' : 'not-allowed' }}
            >
              CASHOUT
            </button>
          </div>
          <div style={{ background: '#1a1a2e', padding: '16px', borderRadius: '8px' }}>
            <h4>Spieler in dieser Runde ({playerList.length})</h4>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {playerList.map(p => (
                <div key={p.userId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #333', color: p.cashedOutAt ? 'limegreen' : 'white' }}>
                  <span>{p.discordName}</span>
                  <span>
                    {p.bet.toLocaleString('de-DE')} 
                    {p.cashedOutAt ? ` @ ${p.cashedOutAt.toFixed(2)}x` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rechte Spalte: Graph und Multiplikator */}
        <div style={{ background: '#0b0b10', padding: '16px', borderRadius: '8px', position: 'relative', height: '400px' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', zIndex: 1 }}>
            <h1 style={{ fontSize: '4rem', margin: 0, color: phase === 'crashed' ? 'salmon' : 'white', transition: 'color 0.3s' }}>
              {multiplier.toFixed(2)}x
            </h1>
            <p style={{ margin: 0, fontSize: '1.2rem' }}>{getStatusMessage()}</p>
          </div>
          <ResponsiveContainer>
            <LineChart data={history}>
              <XAxis type="number" dataKey="time" hide />
              <YAxis type="number" domain={[1, 'auto']} hide />
              <Tooltip content={() => null} />
              <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={4} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};